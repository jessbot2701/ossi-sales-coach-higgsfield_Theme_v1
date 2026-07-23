import type { SupabaseClient } from "@supabase/supabase-js";
import { aggregateCompetencyProgress, deriveLearningProfile } from "@/lib/coaching/progress";
import type { ScoreEntry } from "@/types/domain";

interface SessionRow { id: string; completed_at: string; training_type_version_id: string }
interface EvaluationRow { session_id: string; criterion_id: string; score: number }
interface CriterionRow { id: string; competency_id: string }
interface CompetencyRow { id: string; name: string }

async function saveLearningProfile(
  supabase: SupabaseClient,
  userId: string,
  trainingTypeId: string | null,
  values: { strengths: string[]; focusAreas: string[]; nextLearningGoal: string | null },
  sourceSessionId: string,
) {
  let query = supabase.from("learning_profiles").select("id").eq("user_id", userId);
  query = trainingTypeId ? query.eq("training_type_id", trainingTypeId) : query.is("training_type_id", null);
  const { data: existing } = await query.maybeSingle();
  const payload = {
    strengths: values.strengths,
    focus_areas: values.focusAreas,
    next_learning_goal: values.nextLearningGoal,
    source_session_id: sourceSessionId,
    updated_at: new Date().toISOString(),
  };
  if (existing) await supabase.from("learning_profiles").update(payload).eq("id", existing.id);
  else await supabase.from("learning_profiles").insert({ user_id: userId, training_type_id: trainingTypeId, ...payload });
}

export async function recomputeLearningProfiles(
  supabase: SupabaseClient,
  userId: string,
  trainingTypeId: string,
  sourceSessionId: string,
  explicitGoal?: string | null,
) {
  const { data: sessionData } = await supabase
    .from("coaching_sessions")
    .select("id,completed_at,training_type_version_id")
    .eq("user_id", userId)
    .eq("status", "completed")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(60);
  const sessions = (sessionData ?? []) as SessionRow[];
  if (!sessions.length) return;

  const [{ data: evaluationData }, { data: criteriaData }, { data: competencyData }, { data: versionData }] = await Promise.all([
    supabase.from("session_evaluations").select("session_id,criterion_id,score").in("session_id", sessions.map((row) => row.id)).not("score", "is", null),
    supabase.from("evaluation_criteria").select("id,competency_id"),
    supabase.from("competencies").select("id,name"),
    supabase.from("training_type_versions").select("id").eq("training_type_id", trainingTypeId),
  ]);
  const evaluations = (evaluationData ?? []) as EvaluationRow[];
  const criteria = new Map(((criteriaData ?? []) as CriterionRow[]).map((row) => [row.id, row]));
  const competencies = new Map(((competencyData ?? []) as CompetencyRow[]).map((row) => [row.id, row]));
  const sessionMap = new Map(sessions.map((row) => [row.id, row]));
  const typeVersionIds = new Set(((versionData ?? []) as { id: string }[]).map((row) => row.id));

  const toEntries = (rows: EvaluationRow[]): ScoreEntry[] => rows.flatMap((row) => {
    const criterion = criteria.get(row.criterion_id);
    const competency = criterion && competencies.get(criterion.competency_id);
    const session = sessionMap.get(row.session_id);
    return criterion && competency && session ? [{
      competencyId: competency.id,
      competencyName: competency.name,
      score: Number(row.score),
      completedAt: session.completed_at,
    }] : [];
  });

  const globalAggregates = aggregateCompetencyProgress(toEntries(evaluations));
  await Promise.all(globalAggregates.map((item) => supabase.from("user_competency_progress").upsert({
    user_id: userId,
    competency_id: item.competencyId,
    session_count: item.sessionCount,
    average_score: item.averageScore,
    latest_score: item.latestScore,
    trend: item.trend,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,competency_id" })));

  const typeEvaluations = evaluations.filter((row) => {
    const session = sessionMap.get(row.session_id);
    return session ? typeVersionIds.has(session.training_type_version_id) : false;
  });
  const globalProfile = deriveLearningProfile(globalAggregates);
  const typeProfile = deriveLearningProfile(aggregateCompetencyProgress(toEntries(typeEvaluations)), explicitGoal);
  await Promise.all([
    saveLearningProfile(supabase, userId, null, globalProfile, sourceSessionId),
    saveLearningProfile(supabase, userId, trainingTypeId, typeProfile, sourceSessionId),
  ]);
}
