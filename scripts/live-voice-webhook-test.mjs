import { createClient } from "@supabase/supabase-js";

const [email] = process.argv.slice(2);
if (!email) throw new Error("Usage: node scripts/live-voice-webhook-test.mjs <email>");

const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
const consentVersion = process.env.TRANSCRIPT_CONSENT_VERSION;
const trainingTypeId = "10000000-0000-0000-0000-000000000001";
const scenarioId = "12000000-0000-0000-0000-000000000005";
if (!supabaseUrl || !publishableKey || !secretKey || !elevenLabsKey || !consentVersion) {
  throw new Error("Live-test environment is incomplete.");
}

const admin = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForApp() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${appUrl}/login`, { redirect: "manual" });
      if (response.ok) return;
    } catch {
      // The local server may still be compiling.
    }
    await delay(1_000);
  }
  throw new Error("Local app did not become ready.");
}

async function createAuthenticatedCookie() {
  const { data: link, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${appUrl}/auth/confirm?next=/app` },
  });
  if (error || !link.properties?.hashed_token) {
    throw error ?? new Error("Magic link could not be generated.");
  }

  const confirmUrl = new URL("/auth/confirm", appUrl);
  confirmUrl.searchParams.set("token_hash", link.properties.hashed_token);
  confirmUrl.searchParams.set("type", "magiclink");
  confirmUrl.searchParams.set("next", "/app");
  const response = await fetch(confirmUrl, { redirect: "manual" });
  if (![302, 303, 307, 308].includes(response.status)) {
    throw new Error(`Auth callback returned HTTP ${response.status}.`);
  }

  const setCookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  const cookie = setCookies.map((value) => value.split(";", 1)[0]).join("; ");
  if (!cookie) throw new Error("Auth callback did not set a session cookie.");
  return cookie;
}

async function appRequest(path, cookie, options = {}) {
  const response = await fetch(`${appUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      cookie,
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.error?.message === "string"
      ? body.error.message
      : typeof body?.message === "string"
        ? body.message
        : `HTTP ${response.status}`;
    throw new Error(`${path}: ${message}`);
  }
  return body;
}

async function startSession(cookie) {
  const body = await appRequest("/api/sessions/start", cookie, {
    method: "POST",
    body: JSON.stringify({
      trainingTypeId,
      scenarioId,
      mode: "surprise",
      consent: true,
      consentVersion,
    }),
  });
  if (!body.sessionId || !body.signedUrl || !body.dynamicVariables) {
    throw new Error("Session start response is incomplete.");
  }
  return body;
}

async function runConversation({ sessionId, signedUrl, dynamicVariables }, cookie) {
  const userMessages = [
    "Guten Tag, hier ist Christian Weiss von IGZ. Ich moechte kurz ueber effizientere SAP-Lagerprozesse sprechen.",
    "Viele Unternehmen verlieren Zeit durch manuelle Ablaeufe. Wir schaffen transparentere Prozesse und reduzieren Fehler.",
    "Wenn das fuer Sie grundsaetzlich relevant ist, wuerde ich einen kurzen Folgetermin vorschlagen.",
  ];

  return await new Promise((resolve, reject) => {
    const socket = new WebSocket(signedUrl);
    let conversationId = null;
    let agentResponses = 0;
    let nextUserMessage = 0;
    let settled = false;
    const timer = setTimeout(() => finish(new Error("ElevenLabs conversation timed out.")), 120_000);

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close(1000, "live e2e complete");
        }
      } catch {
        // Best-effort close only.
      }
      if (error) reject(error);
      else resolve({ conversationId, agentResponses });
    }

    function sendNextUserMessage() {
      if (nextUserMessage >= userMessages.length || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "user_activity" }));
      socket.send(JSON.stringify({ type: "user_message", text: userMessages[nextUserMessage] }));
      nextUserMessage += 1;
    }

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({
        type: "conversation_initiation_client_data",
        dynamic_variables: dynamicVariables,
        user_id: email,
      }));
    });

    socket.addEventListener("message", async (event) => {
      try {
        const raw = typeof event.data === "string" ? event.data : Buffer.from(event.data).toString("utf8");
        const message = JSON.parse(raw);
        if (message.type === "ping" && Number.isInteger(message.ping_event?.event_id)) {
          socket.send(JSON.stringify({ type: "pong", event_id: message.ping_event.event_id }));
          return;
        }
        if (message.type === "conversation_initiation_metadata") {
          conversationId = message.conversation_initiation_metadata_event?.conversation_id;
          if (!conversationId) throw new Error("ElevenLabs metadata omitted conversation_id.");
          await appRequest(`/api/sessions/${sessionId}/bind`, cookie, {
            method: "POST",
            body: JSON.stringify({ conversationId }),
          });
          console.log("VOICE_BOUND=true");
          sendNextUserMessage();
          return;
        }
        if (message.type === "agent_response") {
          agentResponses += 1;
          console.log(`VOICE_AGENT_RESPONSE=${agentResponses}`);
          if (nextUserMessage < userMessages.length) {
            setTimeout(sendNextUserMessage, 500);
          } else if (agentResponses >= 3) {
            setTimeout(() => finish(), 750);
          }
        }
      } catch (error) {
        finish(error);
      }
    });
    socket.addEventListener("error", () => finish(new Error("ElevenLabs WebSocket failed.")));
    socket.addEventListener("close", () => {
      if (!settled && conversationId && agentResponses > 0) finish();
      else if (!settled) finish(new Error("ElevenLabs WebSocket closed before the conversation was established."));
    });
  });
}

async function waitForProviderConversation(conversationId) {
  for (let attempt = 0; attempt < 36; attempt += 1) {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(conversationId)}`,
      { headers: { "xi-api-key": elevenLabsKey } },
    );
    if (!response.ok) throw new Error(`Conversation lookup returned HTTP ${response.status}.`);
    const conversation = await response.json();
    if (conversation.status === "done") {
      const transcriptTurns = Array.isArray(conversation.transcript) ? conversation.transcript.length : 0;
      return { status: conversation.status, transcriptTurns };
    }
    await delay(5_000);
  }
  throw new Error("ElevenLabs conversation did not reach done status.");
}

async function waitForWebhook(sessionId) {
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const { data: session, error } = await admin
      .from("coaching_sessions")
      .select("status,summary,transcript,processing_error")
      .eq("id", sessionId)
      .single();
    if (error) throw error;
    if (session.status === "completed") {
      const { count, error: countError } = await admin
        .from("session_evaluations")
        .select("*", { count: "exact", head: true })
        .eq("session_id", sessionId);
      if (countError) throw countError;
      return {
        status: session.status,
        hasSummary: Boolean(session.summary),
        transcriptTurns: Array.isArray(session.transcript) ? session.transcript.length : 0,
        evaluationCount: count ?? 0,
      };
    }
    if (session.status === "failed") {
      throw new Error(`Webhook processing failed: ${session.processing_error || "unknown error"}`);
    }
    await delay(5_000);
  }
  throw new Error("Webhook did not complete the coaching session.");
}

async function markFailed(sessionId, message) {
  await admin
    .from("coaching_sessions")
    .update({ status: "failed", processing_error: message.slice(0, 500) })
    .eq("id", sessionId)
    .in("status", ["created", "active", "processing"]);
}

await waitForApp();
const cookie = await createAuthenticatedCookie();
let sessionId = null;
try {
  const session = await startSession(cookie);
  sessionId = session.sessionId;
  console.log("VOICE_SESSION_CREATED=true");
  const voice = await runConversation(session, cookie);
  console.log(`VOICE_AGENT_RESPONSES=${voice.agentResponses}`);
  const provider = await waitForProviderConversation(voice.conversationId);
  console.log(`PROVIDER_STATUS=${provider.status}`);
  console.log(`PROVIDER_TRANSCRIPT_TURNS=${provider.transcriptTurns}`);
  const webhook = await waitForWebhook(sessionId);
  console.log(`WEBHOOK_STATUS=${webhook.status}`);
  console.log(`WEBHOOK_HAS_SUMMARY=${webhook.hasSummary}`);
  console.log(`WEBHOOK_TRANSCRIPT_TURNS=${webhook.transcriptTurns}`);
  console.log(`WEBHOOK_EVALUATIONS=${webhook.evaluationCount}`);
  console.log(JSON.stringify({ passed: 1, name: "live-voice-webhook" }));
} catch (error) {
  if (sessionId) await markFailed(sessionId, `Live E2E: ${error instanceof Error ? error.message : String(error)}`);
  throw error;
}
