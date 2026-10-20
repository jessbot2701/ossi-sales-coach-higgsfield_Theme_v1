import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api";
import { requireServerEnv } from "@/lib/env";

export const PROVIDER_TIMEOUT_MS = 10_000;
const URL_EXPIRY_WITH_MARGIN_MS = 16 * 60_000;
const conversationIdPattern = /^conv_[A-Za-z0-9_-]+$/;

type PendingAttempt = {
  session_id: string; conversation_id: string | null; agent_id: string;
  issued_at: string | null; bound_at: string | null;
};

export async function voiceSessionControl(
  db: SupabaseClient, action: string, userId: string, sessionId: string | null = null, conversationId: string | null = null,
) {
  const { data, error } = await db.rpc("voice_session_control", {
    p_action: action, p_user_id: userId, p_session_id: sessionId, p_conversation_id: conversationId,
  });
  if (error) throw new ApiError(503, "Der Session-Status konnte nicht zuverlässig gespeichert oder gelesen werden.", "session_state_failed");
  return data as ({ code: string; duplicate?: boolean } & PendingAttempt) | null;
}

export async function issueVoiceGrant(agentId: string, branchId: string | null) {
  const query = new URLSearchParams({ agent_id: agentId, include_conversation_id: "true" });
  if (branchId) query.set("branch_id", branchId);
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?${query}`, {
      headers: { "xi-api-key": requireServerEnv("ELEVENLABS_API_KEY") },
      cache: "no-store", signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error("Provider rejected grant");
    const body = await response.json();
    const url = new URL(body.signed_url);
    // include_conversation_id embeds the reserved ID in the signed URL. Accept
    // an explicit response field too, but never accept contradictory IDs.
    const fromUrl = url.searchParams.get("conversation_id");
    const conversationId = body.conversation_id ?? fromUrl;
    if (url.protocol !== "wss:" || url.hostname !== "api.elevenlabs.io"
      || url.pathname !== "/v1/convai/conversation" || url.username || url.password
      || typeof conversationId !== "string" || !conversationIdPattern.test(conversationId)
      || (fromUrl !== null && fromUrl !== conversationId)
      || url.searchParams.getAll("conversation_id").length > 1) throw new Error("Invalid grant");
    return { signedUrl: url.href, conversationId };
  } catch {
    // Never log the provider body or signed URL.
    throw new ApiError(502, "Der Voice Agent konnte nicht sicher vorbereitet werden. Bitte versuche es erneut.", "voice_provider_error");
  }
}

export async function reconcilePendingVoiceSession(db: SupabaseClient, userId: string) {
  const pending = await voiceSessionControl(db, "pending", userId);
  if (!pending?.conversation_id) return !pending;
  let terminal = false;
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(pending.conversation_id)}`, {
      headers: { "xi-api-key": requireServerEnv("ELEVENLABS_API_KEY") },
      cache: "no-store", signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (response.status === 404) {
      // An unused grant may disappear; expiry alone never closes a bound call.
      terminal = !pending.bound_at && !!pending.issued_at
        && Date.now() - Date.parse(pending.issued_at) > URL_EXPIRY_WITH_MARGIN_MS;
    } else {
      if (!response.ok) throw new Error("Provider status unavailable");
      const conversation = await response.json();
      if (conversation.conversation_id !== pending.conversation_id || conversation.agent_id !== pending.agent_id
        || !["initiated", "in-progress", "processing", "done", "failed"].includes(conversation.status)) {
        throw new Error("Invalid provider state");
      }
      terminal = conversation.status === "done" || conversation.status === "failed";
    }
  } catch {
    throw new ApiError(503, "Der Abschluss der bisherigen Voice-Verbindung ist noch nicht bestätigt. Bitte versuche es später erneut.", "voice_state_unavailable");
  }
  if (terminal) {
    const settled = await voiceSessionControl(db, "settle", userId, pending.session_id, pending.conversation_id);
    if (settled?.code !== "settled") throw new ApiError(409, "Der Session-Status hat sich geändert.", "session_conflict");
  }
  return terminal;
}
