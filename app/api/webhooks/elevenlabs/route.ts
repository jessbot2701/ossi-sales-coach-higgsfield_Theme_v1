import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api";
import { recomputeLearningProfiles } from "@/lib/coaching/recompute";
import { extractPostCallAnalysis } from "@/lib/elevenlabs/analysis";
import { verifyElevenLabsSignature } from "@/lib/elevenlabs/signature";
import { requireServerEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

type EventData = {
  agent_id?: string;
  conversation_id?: string;
  transcript?: unknown;
  analysis?: unknown;
  metadata?: Record<string, unknown>;
};

function cleanTranscript(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((turn) => {
    if (!turn || typeof turn !== "object") return [];
    const item = turn as Record<string, unknown>;
    const role = item.role === "user" ? "user" : item.role === "agent" ? "agent" : null;
    const message = typeof item.message === "string" ? item.message : typeof item.text === "string" ? item.text : null;
    return role && message ? [{ role, message, time_in_call_secs: Number(item.time_in_call_secs) || null }] : [];
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  let conversationId: string | undefined;
  let receiptClaimed = false;
  const supabase = createAdminClient();
  try {
    const secret = requireServerEnv("ELEVENLABS_WEBHOOK_SECRET");
    if (!verifyElevenLabsSignature(rawBody, request.headers.get("elevenlabs-signature"), secret)) {
      throw new ApiError(401, "Ungültige Webhook-Signatur.", "invalid_signature");
    }

    const event = JSON.parse(rawBody) as { type?: string; data?: EventData };
    if (event.type !== "post_call_transcription" || !event.data) {
      return NextResponse.json({ received: true, ignored: true });
    }
    const data = event.data;
    conversationId = data.conversation_id;
    if (!conversationId || !data.agent_id) throw new ApiError(400, "Conversation- oder Agent-ID fehlt.", "invalid_payload");

    const allowedAgents = new Set(requireServerEnv("ELEVENLABS_ALLOWED_AGENT_IDS").split(",").map((id) => id.trim()).filter(Boolean));
    if (!allowedAgents.has(data.agent_id)) throw new ApiError(403, "Der Agent ist für V2 nicht freigegeben.", "invalid_agent");

    const payloadHash = createHash("sha256").update(rawBody).digest("hex");
    const { data: claim, error: claimError } = await supabase.rpc("claim_webhook_receipt", {
      receipt_conversation_id: conversationId, receipt_payload_hash: payloadHash,
    });
    if (claimError) throw claimError;
    if (claim === "duplicate") return NextResponse.json({ received: true, duplicate: true });
    if (claim === "conflict") throw new ApiError(409, "Abweichender Payload für bekannte Conversation-ID.", "payload_conflict");
    receiptClaimed = true;

    const { data: session } = await supabase.from("coaching_sessions")
      .select("id,user_id,training_type_version_id,scenario_snapshot,status")
      .eq("elevenlabs_conversation_id", conversationId).maybeSingle();
    if (!session) {
      await supabase.rpc("finish_webhook_receipt", { receipt_conversation_id: conversationId, receipt_status: "failed", receipt_error: "Session not bound" });
      throw new ApiError(409, "Die Conversation ist noch keiner Session zugeordnet.", "session_not_bound");
    }
    const { data: version } = await supabase.from("training_type_versions").select("training_type_id,elevenlabs_agent_id").eq("id", session.training_type_version_id).single();
    if (!version || version.elevenlabs_agent_id !== data.agent_id) throw new ApiError(403, "Agent und gespeicherte Trainingsversion stimmen nicht überein.", "agent_version_mismatch");

    await supabase.from("coaching_sessions").update({ status: "processing", processing_error: null }).eq("id", session.id);
    const extracted = extractPostCallAnalysis(data.analysis);
    const metadata = data.metadata ?? {};
    const duration = Number(metadata.call_duration_secs ?? metadata.call_duration_seconds ?? 0);
    const snapshot = session.scenario_snapshot as Record<string, unknown>;
    const transcript = cleanTranscript(data.transcript);
    const completedAt = new Date().toISOString();

    const { data: criteria, error: criteriaError } = await supabase.from("evaluation_criteria")
      .select("id,slug,name,sort_order").eq("training_type_id", version.training_type_id).eq("is_active", true).order("sort_order");
    if (criteriaError || !criteria?.length) throw new Error("No evaluation criteria configured");
    const evaluations = criteria.map((criterion) => {
      const slug = criterion.slug as keyof typeof extracted.scores;
      return {
        session_id: session.id,
        criterion_id: criterion.id,
        score: extracted.scores[slug] ?? null,
        reasoning: extracted.feedback[slug] ?? extracted.improvements,
        evidence: extracted.criterionEvidence[slug] ?? extracted.evidence,
        recommendation: extracted.nextLearningGoal,
      };
    });
    const { error: evaluationsError } = await supabase.from("session_evaluations").upsert(evaluations, { onConflict: "session_id,criterion_id" });
    if (evaluationsError) throw evaluationsError;

    const { error: sessionError } = await supabase.from("coaching_sessions").update({
      status: "completed",
      duration_seconds: Number.isFinite(duration) && duration >= 0 ? Math.round(duration) : null,
      title: typeof snapshot.title === "string" ? snapshot.title : "Voice-Coaching",
      summary: extracted.summary,
      transcript,
      completed_at: completedAt,
      expires_at: new Date(new Date(completedAt).setFullYear(new Date(completedAt).getFullYear() + 1)).toISOString(),
      processing_error: null,
    }).eq("id", session.id);
    if (sessionError) throw sessionError;

    await recomputeLearningProfiles(supabase, session.user_id, version.training_type_id, session.id, extracted.nextLearningGoal);
    await supabase.rpc("finish_webhook_receipt", { receipt_conversation_id: conversationId, receipt_status: "processed", receipt_error: null });
    return NextResponse.json({ received: true, sessionId: session.id });
  } catch (error) {
    if (conversationId && receiptClaimed) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown webhook error";
      await supabase.from("coaching_sessions").update({ status: "failed", processing_error: message }).eq("elevenlabs_conversation_id", conversationId);
      await supabase.rpc("finish_webhook_receipt", { receipt_conversation_id: conversationId, receipt_status: "failed", receipt_error: message });
    }
    return apiErrorResponse(error);
  }
}
