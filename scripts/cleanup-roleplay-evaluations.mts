import { createClient } from "@supabase/supabase-js";
import { validateCriterionEvaluations } from "../lib/coaching/evaluation-integrity.ts";
import { analyzeTranscriptPhases, type TranscriptTurn } from "../lib/coaching/transcript-phases.ts";

type EvaluationRow = {
  criterion_id: string;
  score: number | null;
  reasoning: string | null;
  evidence: string | null;
  recommendation: string | null;
};

type SessionRow = {
  id: string;
  user_id: string;
  training_type_version_id: string;
  completed_at: string | null;
  transcript: TranscriptTurn[] | null;
  session_evaluations: EvaluationRow[] | null;
};

type ProgressEntry = {
  competencyId: string;
  competencyName: string;
  score: number;
  completedAt: string;
  trainingTypeId: string;
  sessionId: string;
};

type LearningProfileInsert = {
  user_id: string;
  training_type_id: string | null;
  strengths: string[];
  focus_areas: string[];
  next_learning_goal: string | null;
  source_session_id: string;
  updated_at: string;
};

const applyChanges = process.argv.includes("--apply");
const unknownArgs = process.argv.slice(2).filter((arg) => arg !== "--apply" && arg !== "--dry-run");
if (unknownArgs.length > 0) {
  throw new Error(`Unbekannte Argumente: ${unknownArgs.join(", ")}. Erlaubt: --dry-run oder --apply.`);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim()
  || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!supabaseUrl || !secretKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SECRET_KEY (oder SUPABASE_SERVICE_ROLE_KEY) müssen gesetzt sein.");
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

function sameEvaluation(left: EvaluationRow, right: EvaluationRow) {
  return left.score === right.score
    && left.reasoning === right.reasoning
    && left.evidence === right.evidence
    && left.recommendation === right.recommendation;
}

async function loadCompletedSessions() {
  const pageSize = 500;
  const sessions: SessionRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("coaching_sessions")
      .select("id,user_id,training_type_version_id,completed_at,transcript,session_evaluations(criterion_id,score,reasoning,evidence,recommendation)")
      .eq("status", "completed")
      .not("transcript", "is", null)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as SessionRow[];
    sessions.push(...page);
    if (page.length < pageSize) return sessions;
  }
}

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const round = (value: number) => Math.round(value * 100) / 100;

function aggregate(entries: ProgressEntry[]) {
  const byCompetency = new Map<string, ProgressEntry[]>();
  for (const entry of entries) {
    const values = byCompetency.get(entry.competencyId) ?? [];
    values.push(entry);
    byCompetency.set(entry.competencyId, values);
  }

  return [...byCompetency.values()].map((values) => {
    const sorted = values.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    const scores = sorted.map((entry) => entry.score);
    const recent = scores.length >= 6 ? average(scores.slice(0, 3)) : null;
    const previous = scores.length >= 6 ? average(scores.slice(3, 6)) : null;
    const trend = recent === null || previous === null
      ? "insufficient_data"
      : recent - previous >= 0.35
        ? "up"
        : previous - recent >= 0.35
          ? "down"
          : "stable";
    return {
      competencyId: sorted[0].competencyId,
      competencyName: sorted[0].competencyName,
      sessionCount: sorted.length,
      averageScore: round(average(scores)),
      latestScore: sorted[0].score,
      trend,
    };
  });
}

function profileFor(entries: ProgressEntry[]) {
  const aggregates = aggregate(entries);
  const ranked = [...aggregates].sort(
    (a, b) => a.latestScore - b.latestScore || a.averageScore - b.averageScore,
  );
  return {
    strengths: aggregates
      .filter((item) => item.sessionCount >= 3 && item.averageScore >= 4)
      .sort((a, b) => b.averageScore - a.averageScore)
      .map((item) => item.competencyName),
    focus_areas: ranked.slice(0, 2).map((item) => item.competencyName),
    next_learning_goal: ranked[0]
      ? `${ranked[0].competencyName} in der nächsten Session gezielt trainieren.`
      : null,
  };
}

async function rebuildUserLearningState(userId: string) {
  const { data: sessionData, error: sessionError } = await supabase
    .from("coaching_sessions")
    .select("id,training_type_version_id,completed_at,transcript")
    .eq("user_id", userId)
    .eq("status", "completed")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false });
  if (sessionError) throw sessionError;

  const safeSessions = ((sessionData ?? []) as Omit<SessionRow, "user_id" | "session_evaluations">[])
    .filter((session) => analyzeTranscriptPhases(Array.isArray(session.transcript) ? session.transcript : []).status === "recognized");
  const sessionIds = safeSessions.map((session) => session.id);

  const [{ data: criteriaData, error: criteriaError }, { data: competenciesData, error: competenciesError }, { data: versionsData, error: versionsError }] = await Promise.all([
    supabase.from("evaluation_criteria").select("id,competency_id"),
    supabase.from("competencies").select("id,name"),
    supabase.from("training_type_versions").select("id,training_type_id"),
  ]);
  if (criteriaError) throw criteriaError;
  if (competenciesError) throw competenciesError;
  if (versionsError) throw versionsError;

  const evaluations: { session_id: string; criterion_id: string; score: number }[] = [];
  for (let index = 0; index < sessionIds.length; index += 200) {
    const { data, error } = await supabase
      .from("session_evaluations")
      .select("session_id,criterion_id,score")
      .in("session_id", sessionIds.slice(index, index + 200))
      .not("score", "is", null);
    if (error) throw error;
    evaluations.push(...((data ?? []) as typeof evaluations));
  }

  const criteria = new Map((criteriaData ?? []).map((row) => [row.id, row.competency_id]));
  const competencies = new Map((competenciesData ?? []).map((row) => [row.id, row.name]));
  const versions = new Map((versionsData ?? []).map((row) => [row.id, row.training_type_id]));
  const sessions = new Map(safeSessions.map((session) => [session.id, session]));
  const entries = evaluations.flatMap((evaluation): ProgressEntry[] => {
    const session = sessions.get(evaluation.session_id);
    const competencyId = criteria.get(evaluation.criterion_id);
    const competencyName = competencyId ? competencies.get(competencyId) : null;
    const trainingTypeId = session ? versions.get(session.training_type_version_id) : null;
    return session && competencyId && competencyName && trainingTypeId && session.completed_at
      ? [{
        competencyId,
        competencyName,
        trainingTypeId,
        sessionId: session.id,
        score: Number(evaluation.score),
        completedAt: session.completed_at,
      }]
      : [];
  });

  const [{ error: progressDeleteError }, { error: profilesDeleteError }] = await Promise.all([
    supabase.from("user_competency_progress").delete().eq("user_id", userId),
    supabase.from("learning_profiles").delete().eq("user_id", userId),
  ]);
  if (progressDeleteError) throw progressDeleteError;
  if (profilesDeleteError) throw profilesDeleteError;

  const globalAggregates = aggregate(entries);
  if (globalAggregates.length > 0) {
    const { error } = await supabase.from("user_competency_progress").insert(
      globalAggregates.map((item) => ({
        user_id: userId,
        competency_id: item.competencyId,
        session_count: item.sessionCount,
        average_score: item.averageScore,
        latest_score: item.latestScore,
        trend: item.trend,
        updated_at: new Date().toISOString(),
      })),
    );
    if (error) throw error;
  }

  if (safeSessions.length === 0) return;
  const latestGlobal = safeSessions[0];
  const profiles: LearningProfileInsert[] = [{
    user_id: userId,
    training_type_id: null,
    ...profileFor(entries),
    source_session_id: latestGlobal.id,
    updated_at: new Date().toISOString(),
  }];
  for (const trainingTypeId of new Set(entries.map((entry) => entry.trainingTypeId))) {
    const typeEntries = entries.filter((entry) => entry.trainingTypeId === trainingTypeId);
    const latestTypeSession = safeSessions.find(
      (session) => versions.get(session.training_type_version_id) === trainingTypeId,
    );
    if (!latestTypeSession) continue;
    profiles.push({
      user_id: userId,
      training_type_id: trainingTypeId,
      ...profileFor(typeEntries),
      source_session_id: latestTypeSession.id,
      updated_at: new Date().toISOString(),
    });
  }
  const { error: profileInsertError } = await supabase.from("learning_profiles").insert(profiles);
  if (profileInsertError) throw profileInsertError;
}

const sessions = await loadCompletedSessions();
const usersToRebuild = new Set<string>();
let recognizedSessions = 0;
let skippedSessions = 0;
let contaminatedSessions = 0;
let changedEvaluations = 0;
let forbiddenCoachReferences = 0;

for (const session of sessions) {
  usersToRebuild.add(session.user_id);
  const transcript = Array.isArray(session.transcript) ? session.transcript : [];
  const phaseAnalysis = analyzeTranscriptPhases(transcript);
  if (phaseAnalysis.status !== "recognized") {
    skippedSessions += 1;
    console.log(`[ÜBERSPRUNGEN:${phaseAnalysis.status}] Session ${session.id}: ${phaseAnalysis.reason}`);
    continue;
  }
  recognizedSessions += 1;

  const evaluations = session.session_evaluations ?? [];
  forbiddenCoachReferences += evaluations.flatMap((evaluation) => [
    evaluation.reasoning,
    evaluation.evidence,
    evaluation.recommendation,
  ]).filter((value) => (
    typeof value === "string"
    && /ich bin bereit|hört sich besser an|ciao[\s,]+ossi/iu.test(value)
  )).length;
  const validated = validateCriterionEvaluations(evaluations, transcript, phaseAnalysis);
  const hasInvalidEvaluation = validated.some((evaluation, index) => (
    !sameEvaluation(evaluations[index], evaluation as EvaluationRow)
  ));
  const sanitized = validated.map((evaluation) => ({
    ...(evaluation as EvaluationRow),
    recommendation: hasInvalidEvaluation ? null : evaluation.recommendation ?? null,
  }));
  const changes = sanitized.filter((evaluation, index) => (
    !sameEvaluation(evaluations[index], evaluation)
  ));
  if (changes.length === 0) continue;

  contaminatedSessions += 1;
  changedEvaluations += changes.length;
  console.log(`[BEREINIGEN] Session ${session.id}: ${changes.length} Bewertung(en), Empfehlungen der Session werden entfernt.`);
  console.log(`  Erkannte Rollenspiel-Nutzerbeiträge: ${phaseAnalysis.roleplayUserMessages.map((message) => message.replace(/\s+/g, " ").trim().slice(0, 100)).join(" | ")}`);
  for (const evaluation of changes) {
    const previous = evaluations.find((item) => item.criterion_id === evaluation.criterion_id);
    if (previous?.evidence) console.log(`  Verworfenes Belegfragment: ${previous.evidence.slice(0, 120)}`);
    if (previous?.reasoning) console.log(`  Verworfenes Begründungsfragment: ${previous.reasoning.slice(0, 160)}`);
  }

  if (applyChanges) {
    for (const evaluation of sanitized) {
      const { error } = await supabase
        .from("session_evaluations")
        .update({
          score: evaluation.score,
          reasoning: evaluation.reasoning,
          evidence: evaluation.evidence,
          recommendation: evaluation.recommendation,
        })
        .eq("session_id", session.id)
        .eq("criterion_id", evaluation.criterion_id);
      if (error) throw error;
    }
  }
}

if (applyChanges) {
  for (const userId of usersToRebuild) {
    await rebuildUserLearningState(userId);
    console.log(`[NEU BERECHNET] Lernprofil ${userId}`);
  }
}

console.log(JSON.stringify({
  mode: applyChanges ? "apply" : "dry-run",
  sessionsChecked: sessions.length,
  recognizedSessions,
  skippedSessions,
  contaminatedSessions,
  changedEvaluations,
  forbiddenCoachReferences,
  profilesToRebuild: usersToRebuild.size,
}, null, 2));

if (!applyChanges) {
  console.log("Dry-Run abgeschlossen. Es wurden keine Daten verändert. Zum Anwenden: npm run maintenance:evaluations:apply");
}
