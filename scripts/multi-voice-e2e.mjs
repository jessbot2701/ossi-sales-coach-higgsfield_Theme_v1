import { mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const [email] = process.argv.slice(2);
if (!email) throw new Error("Usage: node scripts/multi-voice-e2e.mjs <test-email>");

const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
const consentVersion = process.env.TRANSCRIPT_CONSENT_VERSION;
const trainingTypeId = "10000000-0000-0000-0000-000000000001";
const scenarioId = "12000000-0000-0000-0000-000000000005";
const objectionCriterionId = "21000000-0000-0000-0000-000000000004";
const closingCriterionId = "21000000-0000-0000-0000-000000000005";
const startMarker = "Rollenspiel beginnt.";
const endMarker = "Rollenspiel beendet – zurück im Coach-Modus.";
const forbiddenCoachEvidence = ["ich bin bereit", "danke, das hilft mir", "ciao, ossi"];

if (!supabaseUrl || !publishableKey || !secretKey || !elevenLabsKey || !consentVersion) {
  throw new Error("Live-E2E-Umgebung ist unvollständig.");
}

const admin = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const cases = [
  {
    id: "VOICE-01",
    name: "Überraschungsmodus – vollständiger Beratungsverlauf",
    mode: "surprise",
    messages: [
      "Guten Tag, hier ist Christian von IGZ. Ich rufe an, weil viele Logistikleiter ihre SAP-Abläufe stabiler und transparenter gestalten möchten.",
      "Wie organisieren Sie heute die Abstimmung zwischen Lagerbetrieb und SAP-Verantwortlichen?",
      "Wo entstehen dabei aktuell die meisten manuellen Rückfragen oder Verzögerungen?",
      "IGZ verbindet SAP-Beratung und Logistikpraxis, sodass Prozessbrüche schneller sichtbar und gezielt reduziert werden können.",
      "Lassen Sie uns in einem zwanzigminütigen Termin prüfen, ob das für Ihre Situation relevant ist. Passt Dienstag um zehn Uhr oder Donnerstag um vierzehn Uhr besser?",
    ],
  },
  {
    id: "VOICE-02",
    name: "Gezielte Einwandbehandlung – schwach beginnen, dann klären",
    mode: "focus",
    focusCriterionId: objectionCriterionId,
    messages: [
      "Guten Tag, Christian von IGZ. Ich möchte mit Ihnen über Ihre SAP-Logistik sprechen.",
      "Das sollten Sie sich trotzdem einmal anhören, weil unsere Lösungen wirklich gut sind.",
      "Verstanden. Was genau macht das Thema für Sie im Moment nachrangig: fehlende Kapazität, andere Projekte oder bereits ein bestehender Partner?",
      "Wenn bereits ein Partner gesetzt ist, geht es nicht um einen Austausch. Wo wünschen Sie sich ergänzend mehr Transparenz oder Entlastung im laufenden Betrieb?",
      "Dann schlage ich einen kurzen fachlichen Austausch ohne Verpflichtung vor. Wäre Mittwochvormittag grundsätzlich möglich?",
    ],
  },
  {
    id: "VOICE-03",
    name: "Gezielter Abschluss – konkreten nächsten Schritt führen",
    mode: "focus",
    focusCriterionId: closingCriterionId,
    messages: [
      "Guten Tag, hier ist Christian von IGZ. Wir unterstützen SAP-Logistikteams dabei, operative Engpässe strukturiert zu lösen.",
      "Welche Themen kosten Ihr Team derzeit im Tagesgeschäft am meisten Zeit?",
      "Wenn wir genau diesen Punkt mit Ihrem Fachteam eingrenzen, hätten Sie eine belastbare Entscheidungsgrundlage statt einer allgemeinen Präsentation.",
      "Wer sollte bei einem ersten zwanzigminütigen Austausch neben Ihnen noch teilnehmen?",
      "Ich sende Ihnen direkt eine kurze Agenda. Sollen wir Dienstag um zehn Uhr oder Donnerstag um vierzehn Uhr reservieren?",
    ],
  },
];

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const normalize = (value) => String(value ?? "")
  .replace(/<\/?(?:Christian|Susanne|Helmut)>/g, "")
  .replace(/[„“‚‘"'`]/g, "")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

async function waitForApp() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${appUrl}/login`, { redirect: "manual" });
      if (response.ok) return;
    } catch {
      // Local development server may still be starting.
    }
    await delay(1_000);
  }
  throw new Error("Lokale App wurde nicht rechtzeitig verfügbar.");
}

async function createAuthenticatedCookie() {
  const { data: link, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${appUrl}/auth/confirm?next=/app` },
  });
  if (error || !link.properties?.hashed_token) {
    throw error ?? new Error("Magic Link konnte nicht erzeugt werden.");
  }
  const confirmUrl = new URL("/auth/confirm", appUrl);
  confirmUrl.searchParams.set("token_hash", link.properties.hashed_token);
  confirmUrl.searchParams.set("type", "magiclink");
  confirmUrl.searchParams.set("next", "/app");
  const response = await fetch(confirmUrl, { redirect: "manual" });
  if (![302, 303, 307, 308].includes(response.status)) {
    throw new Error(`Auth-Callback antwortete mit HTTP ${response.status}.`);
  }
  const setCookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  const cookie = setCookies.map((value) => value.split(";", 1)[0]).join("; ");
  if (!cookie) throw new Error("Auth-Callback setzte kein Session-Cookie.");
  return cookie;
}

async function appRequest(path, cookie, options = {}, allowError = false) {
  const response = await fetch(`${appUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      cookie,
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok && !allowError) {
    throw new Error(`${path}: ${body?.error || body?.message || `HTTP ${response.status}`}`);
  }
  return { status: response.status, body };
}

async function startSession(testCase, cookie) {
  const payload = {
    trainingTypeId,
    scenarioId,
    mode: testCase.mode,
    consent: true,
    consentVersion,
  };
  if (testCase.focusCriterionId) payload.focusCriterionId = testCase.focusCriterionId;
  const { body } = await appRequest("/api/sessions/start", cookie, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!body.sessionId || !body.signedUrl || !body.dynamicVariables) {
    throw new Error("Sessionstart-Antwort ist unvollständig.");
  }
  return body;
}

function agentText(message) {
  return String(
    message.agent_response_event?.agent_response
      ?? message.agent_response
      ?? message.text
      ?? "",
  ).trim();
}

async function runConversation(testCase, session, cookie) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(session.signedUrl);
    const transcript = [];
    let conversationId = null;
    let readySent = false;
    let roleplayStarted = false;
    let roleplayMessageIndex = 0;
    let endRequested = false;
    let debriefSeen = false;
    let signoffSent = false;
    let settled = false;
    let pendingTurn = null;
    const timer = setTimeout(() => finish(new Error("Voice-E2E-Zeitlimit überschritten.")), 900_000);

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (pendingTurn?.timer) clearTimeout(pendingTurn.timer);
      try {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close(1000, "multi voice e2e complete");
        }
      } catch {
        // Best-effort close.
      }
      if (error) reject(error);
      else resolve({
        conversationId,
        transcript,
        roleplayStarted,
        debriefSeen,
        agentResponses: transcript.filter((turn) => turn.role === "agent").length,
      });
    }

    function sendUser(text) {
      if (socket.readyState !== WebSocket.OPEN) return finish(new Error("Socket ist beim Nutzerzug nicht offen."));
      transcript.push({ role: "user", text });
      socket.send(JSON.stringify({ type: "user_activity" }));
      socket.send(JSON.stringify({ type: "user_message", text }));
    }

    function completePendingTurn() {
      if (!pendingTurn || settled) return;
      const action = pendingTurn.action;
      clearTimeout(pendingTurn.timer);
      pendingTurn = null;
      action();
    }

    function queueAfterAudio(message, text, action) {
      const eventId = message.agent_response_event?.event_id ?? null;
      const fallbackMs = Math.min(
        120_000,
        Math.max(3_000, Math.ceil(text.replace(/<[^>]+>/g, "").length / 10) * 1_000),
      );
      pendingTurn = {
        action,
        eventId,
        audioBytes: 0,
        alignmentMs: 0,
        timer: setTimeout(completePendingTurn, fallbackMs),
      };
    }

    function handleAudio(message) {
      if (!pendingTurn) return;
      const audio = message.audio_event;
      if (!audio || (pendingTurn.eventId !== null && audio.event_id !== pendingTurn.eventId)) return;
      if (typeof audio.audio_base_64 === "string") {
        pendingTurn.audioBytes += Buffer.from(audio.audio_base_64, "base64").length;
      }
      const starts = audio.alignment?.char_start_times_ms;
      const durations = audio.alignment?.char_durations_ms;
      if (Array.isArray(starts) && Array.isArray(durations) && starts.length > 0) {
        const last = Math.min(starts.length, durations.length) - 1;
        pendingTurn.alignmentMs = Math.max(
          pendingTurn.alignmentMs,
          Number(starts[last] ?? 0) + Number(durations[last] ?? 0),
        );
      }
      const pcmDurationMs = pendingTurn.audioBytes / 32_000 * 1_000;
      const playbackMs = Math.max(pcmDurationMs, pendingTurn.alignmentMs);
      clearTimeout(pendingTurn.timer);
      pendingTurn.timer = setTimeout(completePendingTurn, Math.ceil(playbackMs) + 750);
    }

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({
        type: "conversation_initiation_client_data",
        dynamic_variables: session.dynamicVariables,
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
          if (!conversationId) throw new Error("Conversation-ID fehlt.");
          await appRequest(`/api/sessions/${session.sessionId}/bind`, cookie, {
            method: "POST",
            body: JSON.stringify({ conversationId }),
          });
          return;
        }
        if (message.type === "audio") {
          handleAudio(message);
          return;
        }
        if (message.type !== "agent_response") return;

        const text = agentText(message);
        transcript.push({ role: "agent", text });
        const spoken = text.replace(/<\/?(?:Christian|Susanne|Helmut)>/g, "").trim();

        if (!roleplayStarted) {
          if (spoken.startsWith(startMarker)) {
            roleplayStarted = true;
            queueAfterAudio(message, text, () => {
              sendUser(testCase.messages[roleplayMessageIndex]);
              roleplayMessageIndex += 1;
            });
            return;
          }
          if (spoken.includes(startMarker)) {
            return finish(new Error(`Startmarker war nicht der erste gesprochene Inhalt: ${spoken.slice(0, 180)}`));
          }
          if (!readySent) {
            readySent = true;
            queueAfterAudio(message, text, () => sendUser("Ich bin bereit."));
            return;
          }
          return finish(new Error(`Exakter Startmarker blieb nach Bereitschaft aus: ${spoken.slice(0, 180)}`));
        }

        if (!endRequested) {
          if (spoken.startsWith(endMarker)) {
            return finish(new Error(
              "Agent wechselte vor der ausdrücklichen Nutzerbeendigung in den Coach-Modus.",
            ));
          }
          if (roleplayMessageIndex < testCase.messages.length) {
            queueAfterAudio(message, text, () => {
              sendUser(testCase.messages[roleplayMessageIndex]);
              roleplayMessageIndex += 1;
            });
          } else {
            endRequested = true;
            queueAfterAudio(message, text, () => sendUser("Rollenspiel beendet."));
          }
          return;
        }

        if (!debriefSeen) {
          if (!spoken.startsWith(endMarker)) {
            return finish(new Error(`Debriefing begann nicht mit Endmarker: ${spoken.slice(0, 180)}`));
          }
          debriefSeen = true;
          signoffSent = true;
          queueAfterAudio(message, text, () => sendUser("Danke, das hilft mir. Ciao, Ossi."));
          return;
        }

        if (signoffSent) queueAfterAudio(message, text, () => finish());
      } catch (error) {
        finish(error);
      }
    });

    socket.addEventListener("error", () => finish(new Error("ElevenLabs-WebSocket meldete einen Fehler.")));
    socket.addEventListener("close", () => {
      if (!settled && conversationId && debriefSeen) finish();
      else if (!settled) finish(new Error("WebSocket wurde vor vollständigem Debriefing geschlossen."));
    });
  });
}

async function waitForProviderConversation(conversationId) {
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(conversationId)}`,
      { headers: { "xi-api-key": elevenLabsKey } },
    );
    if (!response.ok) throw new Error(`Conversation-Lookup HTTP ${response.status}.`);
    const conversation = await response.json();
    if (conversation.status === "done") {
      return {
        status: conversation.status,
        transcriptTurns: Array.isArray(conversation.transcript) ? conversation.transcript.length : 0,
      };
    }
    await delay(5_000);
  }
  throw new Error("Provider-Conversation erreichte nicht den Status done.");
}

async function waitForWebhook(sessionId) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const { data: session, error } = await admin
      .from("coaching_sessions")
      .select("status,summary,strengths,transcript,processing_error")
      .eq("id", sessionId)
      .single();
    if (error) throw error;
    if (session.status === "completed") {
      const { data: evaluations, error: evaluationError } = await admin
        .from("session_evaluations")
        .select("score,reasoning,evidence,recommendation,alternative_formulation,improvement_evidence,improvement_priority")
        .eq("session_id", sessionId);
      if (evaluationError) throw evaluationError;
      return { session, evaluations: evaluations ?? [] };
    }
    if (session.status === "failed") {
      throw new Error(`Webhook-Verarbeitung fehlgeschlagen: ${session.processing_error || "unbekannt"}`);
    }
    await delay(5_000);
  }
  throw new Error("Webhook schloss die Session nicht rechtzeitig ab.");
}

function verifyStoredResult(testCase, webhook) {
  const transcript = Array.isArray(webhook.session.transcript) ? webhook.session.transcript : [];
  const startIndex = transcript.findIndex((turn) => (
    turn.role === "agent" && normalize(turn.message).startsWith(normalize(startMarker))
  ));
  const endIndex = transcript.findIndex((turn, index) => (
    index > startIndex
      && turn.role === "agent"
      && normalize(turn.message).startsWith(normalize(endMarker))
  ));
  if (startIndex < 0 || endIndex <= startIndex) throw new Error("Gespeicherte Rollenspielgrenzen sind nicht eindeutig.");
  if (webhook.evaluations.length !== 6) throw new Error(`Erwartet 6 Bewertungen, erhalten ${webhook.evaluations.length}.`);
  if (!webhook.session.summary?.trim()) throw new Error("Zusammenfassung fehlt.");

  const roleplayUserText = normalize(
    transcript
      .slice(startIndex + 1, endIndex)
      .filter((turn) => turn.role === "user")
      .map((turn) => turn.message)
      .join(" "),
  );
  const improvements = webhook.evaluations.filter((evaluation) => (
    evaluation.recommendation !== null
    || evaluation.alternative_formulation !== null
    || evaluation.improvement_evidence !== null
    || evaluation.improvement_priority !== null
  ));
  if (improvements.length > 3) throw new Error(`Mehr als drei Verbesserungshebel gespeichert: ${improvements.length}.`);
  const priorities = new Set();
  for (const evaluation of webhook.evaluations) {
    if (evaluation.score !== null && (!Number.isInteger(evaluation.score) || evaluation.score < 1 || evaluation.score > 5)) {
      throw new Error(`Ungültiger Score ${evaluation.score}.`);
    }
    const evidence = normalize(evaluation.evidence);
    if (forbiddenCoachEvidence.some((forbidden) => evidence.includes(forbidden))) {
      throw new Error(`Coach-Dialog als Beleg verwendet: ${evaluation.evidence}`);
    }
    if (evidence && !roleplayUserText.includes(evidence) && !evidence.includes(roleplayUserText)) {
      throw new Error(`Beleg stammt nicht erkennbar aus dem Rollenspiel: ${evaluation.evidence}`);
    }
    const improvementFields = [
      evaluation.recommendation,
      evaluation.alternative_formulation,
      evaluation.improvement_evidence,
      evaluation.improvement_priority,
    ];
    const populatedImprovementFields = improvementFields.filter((value) => value !== null).length;
    if (populatedImprovementFields !== 0 && populatedImprovementFields !== improvementFields.length) {
      throw new Error("Unvollständiger Verbesserungshebel gespeichert.");
    }
    if (populatedImprovementFields === improvementFields.length) {
      if (!Number.isInteger(evaluation.improvement_priority) || evaluation.improvement_priority < 1 || evaluation.improvement_priority > 3) {
        throw new Error(`Ungültige Verbesserungspriorität ${evaluation.improvement_priority}.`);
      }
      if (priorities.has(evaluation.improvement_priority)) throw new Error("Doppelte Verbesserungspriorität gespeichert.");
      priorities.add(evaluation.improvement_priority);
      const improvementEvidence = normalize(evaluation.improvement_evidence);
      if (!roleplayUserText.includes(improvementEvidence) && !improvementEvidence.includes(roleplayUserText)) {
        throw new Error(`Verbesserungsbeleg stammt nicht aus dem Rollenspiel: ${evaluation.improvement_evidence}`);
      }
    }
  }
  return {
    transcriptTurns: transcript.length,
    evaluations: webhook.evaluations.length,
    scoredCriteria: webhook.evaluations.filter((item) => item.score !== null).length,
    evidenceCriteria: webhook.evaluations.filter((item) => item.evidence?.trim()).length,
    improvements: improvements.length,
    roleplayUserTurns: transcript.slice(startIndex + 1, endIndex).filter((turn) => turn.role === "user").length,
  };
}

async function deleteSession(sessionId, cookie) {
  const result = await appRequest(`/api/sessions/${sessionId}`, cookie, { method: "DELETE" });
  if (result.body?.deleted !== true) throw new Error("Testsession wurde nicht gelöscht.");
  const [{ count: sessionCount }, { count: evaluationCount }] = await Promise.all([
    admin.from("coaching_sessions").select("*", { count: "exact", head: true }).eq("id", sessionId),
    admin.from("session_evaluations").select("*", { count: "exact", head: true }).eq("session_id", sessionId),
  ]);
  if ((sessionCount ?? 0) !== 0 || (evaluationCount ?? 0) !== 0) {
    throw new Error("Testsession oder Bewertungen blieben nach Cleanup bestehen.");
  }
}

await waitForApp();
const cookie = await createAuthenticatedCookie();
const results = [];
const conversationIds = [];

for (const testCase of cases) {
  let sessionId = null;
  let conversation = null;
  let webhook = null;
  const startedAt = Date.now();
  try {
    console.log(`START ${testCase.id} ${testCase.name}`);
    const session = await startSession(testCase, cookie);
    sessionId = session.sessionId;
    conversation = await runConversation(testCase, session, cookie);
    if (!conversation.roleplayStarted || !conversation.debriefSeen || !conversation.conversationId) {
      throw new Error("Conversation erreichte nicht alle Phasen.");
    }
    conversationIds.push(conversation.conversationId);
    const provider = await waitForProviderConversation(conversation.conversationId);
    webhook = await waitForWebhook(sessionId);
    const verification = verifyStoredResult(testCase, webhook);
    await deleteSession(sessionId, cookie);
    sessionId = null;
    results.push({
      id: testCase.id,
      name: testCase.name,
      status: "PASS",
      durationMs: Date.now() - startedAt,
      provider,
      conversation: {
        conversationId: conversation.conversationId,
        agentResponses: conversation.agentResponses,
      },
      verification,
    });
    console.log(`PASS ${testCase.id} ${testCase.name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      id: testCase.id,
      name: testCase.name,
      status: "FAIL",
      durationMs: Date.now() - startedAt,
      error: message,
      diagnostics: {
        conversationId: conversation?.conversationId ?? null,
        clientTranscript: conversation?.transcript ?? null,
        storedTranscript: webhook?.session?.transcript ?? null,
        evaluations: webhook?.evaluations ?? null,
      },
    });
    console.error(`FAIL ${testCase.id}: ${message}`);
    if (sessionId) {
      await admin.from("coaching_sessions").update({
        status: "failed",
        processing_error: `Multi Voice E2E: ${message}`.slice(0, 500),
      }).eq("id", sessionId).in("status", ["created", "active", "processing"]);
      await appRequest(`/api/sessions/${sessionId}`, cookie, { method: "DELETE" }, true).catch(() => {});
    }
  }
}

const totals = {
  total: results.length,
  passed: results.filter((item) => item.status === "PASS").length,
  failed: results.filter((item) => item.status === "FAIL").length,
};
const report = { generatedAt: new Date().toISOString(), email, totals, conversationIds, results };
await mkdir(new URL("../artifacts/test-results/", import.meta.url), { recursive: true });
const reportUrl = new URL(`../artifacts/test-results/multi-voice-e2e-${Date.now()}.json`, import.meta.url);
await writeFile(reportUrl, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ report: reportUrl.pathname, totals, conversationIds }, null, 2));
if (totals.failed > 0) process.exitCode = 1;
