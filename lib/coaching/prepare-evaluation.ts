import { createHash } from "node:crypto";
import { sanitizeSessionStrengths, validateCriterionEvaluations } from "./evaluation-integrity.ts";
import { ensureGermanLearningGoal, ensureGermanStrengths, ensureGermanSummary } from "./german-output.ts";
import { analyzeTranscriptPhases, hasEvaluableRoleplay } from "./transcript-phases.ts";
import { extractPostCallAnalysis } from "../elevenlabs/analysis.ts";

export type ProviderEvaluation = { agent_id?: string; conversation_id?: string; transcript?: unknown; analysis?: unknown; metadata?: Record<string, unknown> };
export type EvaluationSession = { id: string; status: string; evaluation_revision: number; scenario_snapshot: Record<string, unknown> };
export type EvaluationCriterion = { id: string; slug: string; name: string };
const MAX_TRANSCRIPT_TURNS = 500;
const MAX_TRANSCRIPT_MESSAGE_CHARS = 20_000;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
  return value;
}
export function evaluationPayloadHash(data: ProviderEvaluation) {
  // GET and webhook envelopes differ. Hash the exact inputs consumed by evaluation,
  // while keeping additional provider transport metadata out of the retry identity.
  return createHash("sha256").update(JSON.stringify(canonical({
    agent_id: data.agent_id, conversation_id: data.conversation_id,
    transcript: cleanTranscript(data.transcript), analysis: extractPostCallAnalysis(data.analysis),
    start: Number(data.metadata?.start_time_unix_secs) || null,
    duration: Number(data.metadata?.call_duration_secs ?? data.metadata?.call_duration_seconds ?? 0),
  }))).digest("hex");
}
function cleanTranscript(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_TRANSCRIPT_TURNS).flatMap((turn) => {
    if (!turn || typeof turn !== "object") return [];
    const item = turn as Record<string, unknown>;
    const role = item.role === "user" ? "user" : item.role === "agent" ? "agent" : null;
    const message = typeof item.message === "string" ? item.message : typeof item.text === "string" ? item.text : null;
    return role && message ? [{
      role,
      message: message.slice(0, MAX_TRANSCRIPT_MESSAGE_CHARS),
      time_in_call_secs: Number(item.time_in_call_secs) || null,
    }] : [];
  });
}

export function prepareEvaluation(data: ProviderEvaluation, session: EvaluationSession, criteria: EvaluationCriterion[], receivedAt: string) {
    const extracted = extractPostCallAnalysis(data.analysis);
    const metadata = data.metadata ?? {};
    const duration = Number(metadata.call_duration_secs ?? metadata.call_duration_seconds ?? 0);
    const snapshot = session.scenario_snapshot as Record<string, unknown>;
    const transcript = cleanTranscript(data.transcript);
    const phaseAnalysis = analyzeTranscriptPhases(transcript);
    const start = Number(metadata.start_time_unix_secs);
    const completedAt = Number.isFinite(start) && start > 0 && Number.isFinite(duration) && duration >= 0
      ? new Date((start + duration) * 1000).toISOString() : receivedAt;

    const evaluations = validateCriterionEvaluations(criteria.map((criterion) => {
      const slug = criterion.slug as keyof typeof extracted.scores;
      return {
        session_id: session.id,
        criterion_id: criterion.id,
        score: extracted.scores[slug] ?? null,
        reasoning: extracted.feedback[slug],
        evidence: extracted.criterionEvidence[slug],
        recommendation: extracted.improvementsByCriterion[slug],
        alternative_formulation: extracted.alternativesByCriterion[slug],
        improvement_evidence: extracted.improvementEvidenceByCriterion[slug],
        improvement_priority: extracted.improvementPriorities[slug],
      };
    }), transcript, phaseAnalysis);
    const ratingContext = evaluations.map((evaluation, index) => ({
      score: evaluation.score,
      name: criteria[index]?.name,
    }));
    const acceptedLearningGoal = hasEvaluableRoleplay(phaseAnalysis)
      && evaluations.some((evaluation) => evaluation.score !== null)
      ? ensureGermanLearningGoal(extracted.nextLearningGoal)
      : null;
    const sessionStrengths = ensureGermanStrengths(
      sanitizeSessionStrengths(extracted.strengths, phaseAnalysis),
      ratingContext,
    );
    return { evaluations, session: {
      status: "completed",
      duration_seconds: Number.isFinite(duration) && duration >= 0 ? Math.round(duration) : null,
      title: typeof snapshot.title === "string" ? snapshot.title : "Voice-Coaching",
      summary: ensureGermanSummary(extracted.summary, ratingContext),
      strengths: sessionStrengths,
      next_learning_goal: acceptedLearningGoal,
      transcript,
      completed_at: completedAt,
      expires_at: new Date(new Date(completedAt).setFullYear(new Date(completedAt).getFullYear() + 1)).toISOString(),
      processing_error: null,
    } };
}
