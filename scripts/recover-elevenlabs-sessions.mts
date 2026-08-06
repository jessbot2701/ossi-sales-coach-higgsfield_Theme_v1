import { createClient } from "@supabase/supabase-js";
import {
  sanitizeSessionStrengths,
  validateCriterionEvaluations,
} from "../lib/coaching/evaluation-integrity.ts";
import {
  ensureGermanLearningGoal,
  ensureGermanStrengths,
  ensureGermanSummary,
} from "../lib/coaching/german-output.ts";
import { recomputeLearningProfiles } from "../lib/coaching/recompute.ts";
import { analyzeTranscriptPhases } from "../lib/coaching/transcript-phases.ts";
import { extractPostCallAnalysis } from "../lib/elevenlabs/analysis.ts";

type ProviderConversation = {
  agent_id?: string;
  conversation_id?: string;
  status?: string;
  transcript?: unknown;
  analysis?: unknown;
  metadata?: Record<string, unknown>;
};

const MAX_TRANSCRIPT_TURNS = 500;
const MAX_TRANSCRIPT_MESSAGE_CHARS = 20_000;

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} fehlt.`);
  return value;
}

function cleanTranscript(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_TRANSCRIPT_TURNS).flatMap((turn) => {
    if (!turn || typeof turn !== "object") return [];
    const item = turn as Record<string, unknown>;
    const role = item.role === "user" ? "user" : item.role === "agent" ? "agent" : null;
    const message = typeof item.message === "string"
      ? item.message
      : typeof item.text === "string"
        ? item.text
        : null;
    return role && message ? [{
      role,
      message: message.slice(0, MAX_TRANSCRIPT_MESSAGE_CHARS),
      time_in_call_secs: Number(item.time_in_call_secs) || null,
    }] : [];
  });
}

function completionTime(metadata: Record<string, unknown>, duration: number) {
  const startedAtSeconds = Number(metadata.start_time_unix_secs ?? 0);
  if (Number.isFinite(startedAtSeconds) && startedAtSeconds > 0 && Number.isFinite(duration) && duration >= 0) {
    return new Date((startedAtSeconds + duration) * 1_000).toISOString();
  }
  return new Date().toISOString();
}

const apply = process.argv.includes("--apply");
const conversationIds = process.argv.slice(2).filter((value) => value !== "--apply");
if (!conversationIds.length || conversationIds.some((value) => !/^conv_[A-Za-z0-9_-]{8,190}$/.test(value))) {
  throw new Error("Aufruf: npx tsx scripts/recover-elevenlabs-sessions.mts [--apply] <conversation-id> [...]");
}

const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const supabaseKey = process.env.SUPABASE_SECRET_KEY?.trim()
  || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!supabaseKey) throw new Error("SUPABASE_SECRET_KEY oder SUPABASE_SERVICE_ROLE_KEY fehlt.");
const elevenLabsApiKey = requireEnv("ELEVENLABS_API_KEY");
const allowedAgents = new Set(requireEnv("ELEVENLABS_ALLOWED_AGENT_IDS").split(",").map((id) => id.trim()).filter(Boolean));
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

for (const conversationId of conversationIds) {
  const providerResponse = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(conversationId)}`,
    { headers: { "xi-api-key": elevenLabsApiKey } },
  );
  if (!providerResponse.ok) throw new Error(`ElevenLabs ${conversationId}: HTTP ${providerResponse.status}.`);
  const provider = await providerResponse.json() as ProviderConversation;
  if (provider.status !== "done") throw new Error(`${conversationId}: Provider-Status ist ${provider.status ?? "unbekannt"}.`);
  if (!provider.agent_id || !allowedAgents.has(provider.agent_id)) throw new Error(`${conversationId}: Agent ist nicht freigegeben.`);

  const { data: session, error: sessionLookupError } = await supabase.from("coaching_sessions")
    .select("id,user_id,scenario_snapshot,status,version:training_type_versions!inner(training_type_id,elevenlabs_agent_id)")
    .eq("elevenlabs_conversation_id", conversationId)
    .maybeSingle();
  if (sessionLookupError) throw sessionLookupError;
  if (!session) throw new Error(`${conversationId}: Keine gebundene Session gefunden.`);
  const version = Array.isArray(session.version) ? session.version[0] : session.version;
  if (!version || version.elevenlabs_agent_id !== provider.agent_id) throw new Error(`${conversationId}: Agent und Trainingsversion stimmen nicht überein.`);

  const transcript = cleanTranscript(provider.transcript);
  const phaseAnalysis = analyzeTranscriptPhases(transcript);
  const extracted = extractPostCallAnalysis(provider.analysis);
  const metadata = provider.metadata ?? {};
  const duration = Number(metadata.call_duration_secs ?? metadata.call_duration_seconds ?? 0);
  const completedAt = completionTime(metadata, duration);
  const snapshot = session.scenario_snapshot as Record<string, unknown>;
  const { data: criteria, error: criteriaError } = await supabase.from("evaluation_criteria")
    .select("id,slug,name,sort_order")
    .eq("training_type_id", version.training_type_id)
    .eq("is_active", true)
    .order("sort_order");
  if (criteriaError || !criteria?.length) throw criteriaError ?? new Error("Keine Bewertungskriterien konfiguriert.");

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
  const acceptedLearningGoal = phaseAnalysis.status === "recognized"
    && evaluations.some((evaluation) => evaluation.score !== null)
    ? ensureGermanLearningGoal(extracted.nextLearningGoal, ratingContext)
    : null;
  const sessionStrengths = ensureGermanStrengths(
    sanitizeSessionStrengths(extracted.strengths, phaseAnalysis),
    ratingContext,
  );

  console.log(JSON.stringify({
    conversationId,
    sessionId: session.id,
    previousStatus: session.status,
    providerStatus: provider.status,
    transcriptTurns: transcript.length,
    acceptedScores: evaluations.filter((evaluation) => evaluation.score !== null).length,
    acceptedImprovements: evaluations.filter((evaluation) => evaluation.improvement_priority !== null).length,
    mode: apply ? "apply" : "dry-run",
  }));
  if (!apply) continue;

  const { error: processingError } = await supabase.from("coaching_sessions")
    .update({ status: "processing", processing_error: null })
    .eq("id", session.id);
  if (processingError) throw processingError;
  const { error: evaluationsError } = await supabase.from("session_evaluations")
    .upsert(evaluations, { onConflict: "session_id,criterion_id" });
  if (evaluationsError) throw evaluationsError;
  const { error: sessionError } = await supabase.from("coaching_sessions").update({
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
  }).eq("id", session.id);
  if (sessionError) throw sessionError;
  await recomputeLearningProfiles(supabase, session.user_id, version.training_type_id, session.id, acceptedLearningGoal);
  const { error: receiptError } = await supabase.rpc("finish_webhook_receipt", {
    receipt_conversation_id: conversationId,
    receipt_status: "processed",
    receipt_error: null,
  });
  if (receiptError) throw receiptError;

  const [{ data: verifiedSession, error: verifySessionError }, { count: evaluationCount, error: verifyEvaluationError }] = await Promise.all([
    supabase.from("coaching_sessions").select("status,duration_seconds,completed_at,processing_error").eq("id", session.id).single(),
    supabase.from("session_evaluations").select("criterion_id", { count: "exact", head: true }).eq("session_id", session.id),
  ]);
  if (verifySessionError || verifyEvaluationError) throw verifySessionError ?? verifyEvaluationError;
  if (verifiedSession.status !== "completed" || evaluationCount !== criteria.length) {
    throw new Error(`${conversationId}: Verifikation fehlgeschlagen.`);
  }
  console.log(JSON.stringify({ conversationId, verifiedStatus: verifiedSession.status, evaluationCount }));
}
