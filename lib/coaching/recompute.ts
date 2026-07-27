import type { SupabaseClient } from "@supabase/supabase-js";
import { aggregateCompetencyProgress, deriveLearningProfile } from "@/lib/coaching/progress";
import type { ScoreEntry } from "@/types/domain";

interface JoinedEvaluationRow {
  score: number;
  session: {
    id: string;
    completed_at: string;
    training_type_version: { training_type_id: string };
  };
  criterion: {
    competency: { id: string; name: string };
  };
}

export async function recomputeLearningProfiles(
  supabase: SupabaseClient,
  userId: string,
  trainingTypeId: string,
  sourceSessionId: string,
  explicitGoal?: string | null,
) {
  const { data, error } = await supabase
    .from("session_evaluations")
    .select("score,session:coaching_sessions!inner(id,completed_at,status,user_id,training_type_version:training_type_versions!inner(training_type_id)),criterion:evaluation_criteria!inner(competency:competencies!inner(id,name))")
    .eq("session.user_id", userId)
    .eq("session.status", "completed")
    .not("session.completed_at", "is", null)
    .not("score", "is", null);
  if (error) throw error;

  const evaluations = (data ?? []) as unknown as JoinedEvaluationRow[];
  if (!evaluations.length) {
    const cleanup = await Promise.all([
      supabase.from("user_competency_progress").delete().eq("user_id", userId),
      supabase.from("learning_profiles").delete().eq("user_id", userId),
    ]);
    const cleanupError = cleanup.find((result) => result.error)?.error;
    if (cleanupError) throw cleanupError;
    return;
  }

  const toEntries = (rows: JoinedEvaluationRow[]): ScoreEntry[] => rows.map((row) => ({
    competencyId: row.criterion.competency.id,
    competencyName: row.criterion.competency.name,
    score: Number(row.score),
    completedAt: row.session.completed_at,
  }));
  const globalAggregates = aggregateCompetencyProgress(toEntries(evaluations));
  const typeAggregates = aggregateCompetencyProgress(toEntries(
    evaluations.filter((row) => (
      row.session.training_type_version.training_type_id === trainingTypeId
    )),
  ));
  const newestSession = [...evaluations]
    .sort((a, b) => b.session.completed_at.localeCompare(a.session.completed_at))[0]
    .session;
  const validSessionIds = new Set(evaluations.map((row) => row.session.id));
  const resolvedSourceSessionId = validSessionIds.has(sourceSessionId)
    ? sourceSessionId
    : newestSession.id;
  const updatedAt = new Date().toISOString();

  const { error: clearProgressError } = await supabase
    .from("user_competency_progress")
    .delete()
    .eq("user_id", userId);
  if (clearProgressError) throw clearProgressError;

  const progressRows = globalAggregates.map((item) => ({
    user_id: userId,
    competency_id: item.competencyId,
    session_count: item.sessionCount,
    average_score: item.averageScore,
    latest_score: item.latestScore,
    trend: item.trend,
    updated_at: updatedAt,
  }));
  const globalProfile = deriveLearningProfile(globalAggregates);
  const typeProfile = deriveLearningProfile(typeAggregates, explicitGoal);
  const profileRows = [
    { trainingTypeId: null, values: globalProfile },
    { trainingTypeId, values: typeProfile },
  ].map(({ trainingTypeId: profileTrainingTypeId, values }) => ({
    user_id: userId,
    training_type_id: profileTrainingTypeId,
    strengths: values.strengths,
    focus_areas: values.focusAreas,
    next_learning_goal: values.nextLearningGoal,
    source_session_id: resolvedSourceSessionId,
    updated_at: updatedAt,
  }));

  const writes = await Promise.all([
    supabase
      .from("user_competency_progress")
      .upsert(progressRows, { onConflict: "user_id,competency_id" }),
    supabase
      .from("learning_profiles")
      .upsert(profileRows, { onConflict: "user_id,training_type_id" }),
  ]);
  const writeError = writes.find((result) => result.error)?.error;
  if (writeError) throw writeError;
}
