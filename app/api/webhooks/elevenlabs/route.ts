import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api";
import { evaluationPayloadHash, prepareEvaluation, type ProviderEvaluation } from "@/lib/coaching/prepare-evaluation";
import { verifyElevenLabsSignature } from "@/lib/elevenlabs/signature";
import { requireServerEnv } from "@/lib/env";
import { readTextBodyWithLimit } from "@/lib/request-body";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_WEBHOOK_BODY_BYTES = 1_000_000;

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-vercel-id") ?? crypto.randomUUID();
  const db = createAdminClient();
  let conversationId: string | undefined;
  let token: string | undefined;
  try {
    const rawBody = await readTextBodyWithLimit(request, MAX_WEBHOOK_BODY_BYTES);
    if (!verifyElevenLabsSignature(rawBody, request.headers.get("elevenlabs-signature"), requireServerEnv("ELEVENLABS_WEBHOOK_SECRET"))) {
      throw new ApiError(401, "Ung?ltige Webhook-Signatur.", "invalid_signature");
    }
    const event = JSON.parse(rawBody) as { type?: string; data?: ProviderEvaluation };
    if (event.type !== "post_call_transcription" || !event.data) return NextResponse.json({ received: true, ignored: true });
    const data = event.data;
    conversationId = data.conversation_id;
    if (!conversationId || !data.agent_id) throw new ApiError(400, "Conversation- oder Agent-ID fehlt.", "invalid_payload");
    const allowedAgents = new Set(requireServerEnv("ELEVENLABS_ALLOWED_AGENT_IDS").split(",").map((id) => id.trim()).filter(Boolean));
    if (!allowedAgents.has(data.agent_id)) throw new ApiError(403, "Der Agent ist nicht freigegeben.", "invalid_agent");
    console.log(JSON.stringify({ level: "info", message: "ElevenLabs webhook processing started", requestId, conversationId }));
    const { data: claim, error: claimError } = await db.rpc("claim_evaluation", {
      p_conversation_id: conversationId, p_payload_hash: evaluationPayloadHash(data),
    });
    if (claimError || !claim) throw new ApiError(503, "Die Verarbeitung konnte nicht reserviert werden.", "receipt_claim_failed");
    if (claim.code === "duplicate") return NextResponse.json({ received: true, duplicate: true });
    if (claim.code === "conflict") throw new ApiError(409, "Abweichender Payload f?r bekannte Conversation-ID.", "payload_conflict");
    if (claim.code !== "claimed") throw new ApiError(503, "Ein anderer Versuch verarbeitet die Conversation. Bitte erneut zustellen.", "receipt_busy");
    token = claim.token;
    const { data: context, error: contextError } = await db.rpc("read_evaluation_context", {
      p_conversation_id: conversationId, p_agent_id: data.agent_id,
    });
    if (contextError || !context) throw new ApiError(503, "Die Session konnte nicht gelesen werden.", "session_read_failed");
    if (context.code === "agent_mismatch") throw new ApiError(403, "Agent und Session stimmen nicht ?berein.", "agent_version_mismatch");
    if (!["accepted", "ignored"].includes(context.code)) throw new ApiError(503, "Unbekannte Zuordnung.", "session_state_failed");
    let result = null;
    if (context.code === "accepted" && context.session.status !== "completed") {
      const { data: criteria, error } = await db.from("evaluation_criteria")
        .select("id,slug,name,sort_order").eq("training_type_id", context.training_type_id).eq("is_active", true).order("sort_order");
      if (error) throw new ApiError(503, "Bewertungskriterien konnten nicht gelesen werden.", "criteria_read_failed");
      if (!criteria?.length) throw new ApiError(409, "Keine Bewertungskriterien konfiguriert.", "criteria_unavailable");
      result = prepareEvaluation(data, context.session, criteria, claim.received_at);
    }
    const { data: completed, error: completeError } = await db.rpc("complete_evaluation", {
      p_conversation_id: conversationId, p_token: token, p_agent_id: data.agent_id,
      p_expected_revision: context.session?.evaluation_revision ?? null, p_result: result,
    });
    if (completeError || !["processed", "ignored"].includes(completed?.code)) {
      throw new ApiError(503, "Die Verarbeitung wurde nicht best?tigt. Bitte erneut zustellen.", "evaluation_commit_failed");
    }
    console.log(JSON.stringify({ level: "info", message: "ElevenLabs webhook processing completed", requestId, conversationId,
      outcome: completed.code, durationMs: Date.now() - startedAt }));
    return NextResponse.json(completed.code === "ignored" ? { received: true, ignored: true } : { received: true, sessionId: completed.session_id });
  } catch (error) {
    const code = error instanceof ApiError ? error.code : "evaluation_failed";
    // Never log provider bodies, DB error details, transcripts or signed URLs.
    console.error(JSON.stringify({ level: "error", message: "ElevenLabs webhook processing failed", code, requestId, conversationId,
      durationMs: Date.now() - startedAt }));
    if (conversationId && token) {
      try {
        const failure = await db.rpc("fail_evaluation", { p_conversation_id: conversationId, p_token: token, p_error_code: code });
        if (failure.error || failure.data !== true) console.error(JSON.stringify({ level: "error", message: "receipt_failure_unconfirmed", requestId, conversationId }));
      } catch { console.error(JSON.stringify({ level: "error", message: "receipt_failure_unconfirmed", requestId, conversationId })); }
    }
    return apiErrorResponse(error instanceof ApiError ? error : new ApiError(503, "Die Verarbeitung ist fehlgeschlagen. Bitte erneut zustellen.", code));
  }
}
