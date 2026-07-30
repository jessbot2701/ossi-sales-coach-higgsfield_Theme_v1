import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const baseUrl = (process.env.E2E_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const configuredAdminEmail = process.env.E2E_ADMIN_EMAIL;
const configuredAdminPassword = process.env.E2E_ADMIN_PASSWORD;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const consentVersion = process.env.TRANSCRIPT_CONSENT_VERSION || "2026-07-18";

if (Boolean(configuredAdminEmail) !== Boolean(configuredAdminPassword)) {
  throw new Error("E2E_ADMIN_EMAIL und E2E_ADMIN_PASSWORD muessen gemeinsam gesetzt sein.");
}
if (!supabaseUrl || !publishableKey || !secretKey) {
  throw new Error("Die Supabase-Variablen muessen gesetzt sein.");
}

const usesTemporaryAdmin = !configuredAdminEmail;
const adminEmail = configuredAdminEmail || `codex-functional-admin-${randomUUID()}@example.com`;
const adminPassword = configuredAdminPassword || `Ossi-Admin-${randomUUID()}!`;

const admin = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const trainingTypeId = "10000000-0000-0000-0000-000000000001";
const trainingTypeVersionId = "11000000-0000-0000-0000-000000000001";
const scenarioId = "12000000-0000-0000-0000-000000000005";
const runId = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const normalEmail = `codex-functional-${runId}@example.com`;
const normalPassword = "Ossi-Functional-2026!";
const cascadeEmail = `codex-cascade-${runId}@example.com`;
const cascadePassword = "Ossi-Cascade-2026!";
const results = [];
const cleanupUserIds = new Set();
const cleanupSessionIds = new Set();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function check(id, title, fn) {
  const startedAt = Date.now();
  try {
    const evidence = await fn();
    results.push({ id, title, status: "PASS", durationMs: Date.now() - startedAt, evidence: evidence ?? null });
    console.log(`PASS ${id} ${title}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ id, title, status: "FAIL", durationMs: Date.now() - startedAt, error: message });
    console.error(`FAIL ${id} ${title}: ${message}`);
  }
}

async function createUser(email, password, displayName, role = "user") {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error || !data.user) throw error ?? new Error("Testnutzer konnte nicht erstellt werden.");
  cleanupUserIds.add(data.user.id);
  const [{ error: profileError }, { error: roleError }] = await Promise.all([
    admin.from("profiles").update({ display_name: displayName, is_active: true }).eq("id", data.user.id),
    admin.from("app_roles").upsert({ user_id: data.user.id, role, granted_at: new Date().toISOString() }),
  ]);
  if (profileError || roleError) throw profileError ?? roleError;
  return data.user.id;
}

async function createCompletedSession(userId, title, {
  improvementCount = 1,
  strengths = ["Ruhiger Gesprächseinstieg", "Klare Sprache"],
} = {}) {
  const completedAt = new Date().toISOString();
  const transcript = [
    { role: "agent", message: "Willkommen zum Training." },
    { role: "agent", message: "Rollenspiel beginnt." },
    { role: "user", message: "Guten Tag, hier ist der Vertrieb von IGZ." },
    { role: "agent", message: "Worum geht es genau?" },
    { role: "user", message: "Wie organisieren Sie aktuell Ihre SAP-Lagerprozesse?" },
    { role: "agent", message: "Rollenspiel beendet – zurück im Coach-Modus." },
    { role: "user", message: "Danke für das Feedback." },
  ];
  const sessionValues = {
    user_id: userId,
    training_type_version_id: trainingTypeVersionId,
    scenario_id: scenarioId,
    elevenlabs_conversation_id: `conv_functional_${randomUUID()}`,
    status: "completed",
    consent_version: consentVersion,
    consented_at: completedAt,
    scenario_snapshot: { test: true, mode: "surprise" },
    duration_seconds: 95,
    title,
    summary: "Funktionstest mit klar erkannten Rollenspielphasen.",
    ...(strengths === null ? {} : { strengths }),
    next_learning_goal: "Fragetechnik weiter trainieren",
    transcript,
    started_at: completedAt,
    completed_at: completedAt,
  };
  const { data: session, error } = await admin.from("coaching_sessions").insert(sessionValues).select("id").single();
  if (error || !session) throw error ?? new Error("Testsession konnte nicht erstellt werden.");
  cleanupSessionIds.add(session.id);

  const { data: criteria, error: criteriaError } = await admin
    .from("evaluation_criteria")
    .select("id,competency_id,name")
    .eq("training_type_id", trainingTypeId)
    .eq("is_active", true)
    .order("sort_order");
  if (criteriaError || !criteria?.length) throw criteriaError ?? new Error("Kriterien fehlen.");

  const { error: evaluationError } = await admin.from("session_evaluations").insert(
    criteria.map((criterion, index) => ({
      session_id: session.id,
      criterion_id: criterion.id,
      score: index < improvementCount ? 3 : 4,
      reasoning: `Testbegründung ${index + 1}`,
      evidence: index === 0
        ? "Guten Tag, hier ist der Vertrieb von IGZ."
        : "Wie organisieren Sie aktuell Ihre SAP-Lagerprozesse?",
      recommendation: index < improvementCount ? `Verbesserungshebel ${index + 1} konkreter umsetzen.` : null,
      alternative_formulation: index < improvementCount ? `Alternative Formulierung ${index + 1} für das Kundengespräch.` : null,
      improvement_evidence: index < improvementCount
        ? (index === 0
          ? "Guten Tag, hier ist der Vertrieb von IGZ."
          : "Wie organisieren Sie aktuell Ihre SAP-Lagerprozesse?")
        : null,
      improvement_priority: index < improvementCount ? index + 1 : null,
    })),
  );
  if (evaluationError) throw evaluationError;

  const { error: progressError } = await admin.from("user_competency_progress").upsert(
    criteria.map((criterion) => ({
      user_id: userId,
      competency_id: criterion.competency_id,
      session_count: 1,
      average_score: 3,
      latest_score: 3,
      trend: "insufficient_data",
    })),
    { onConflict: "user_id,competency_id" },
  );
  if (progressError) throw progressError;

  const { error: learningError } = await admin.from("learning_profiles").upsert([
    {
      user_id: userId,
      training_type_id: null,
      strengths: [],
      focus_areas: ["Fragetechnik"],
      next_learning_goal: "Fragetechnik weiter trainieren",
      source_session_id: session.id,
    },
    {
      user_id: userId,
      training_type_id: trainingTypeId,
      strengths: [],
      focus_areas: ["Fragetechnik"],
      next_learning_goal: "Fragetechnik weiter trainieren",
      source_session_id: session.id,
    },
  ], { onConflict: "user_id,training_type_id" });
  if (learningError) throw learningError;
  return session.id;
}

async function login(page, email, password, next = "/app") {
  await page.goto(`${baseUrl}/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/app") || url.pathname.startsWith("/admin"), {
    timeout: 30_000,
  });
}

async function browserJson(page, path, options = {}) {
  return page.evaluate(async ({ path, options }) => {
    const response = await fetch(path, options);
    return { status: response.status, body: await response.json().catch(() => null) };
  }, { path, options });
}

async function countRows(table, column, value) {
  const { count, error } = await admin.from(table).select("*", { count: "exact", head: true }).eq(column, value);
  if (error) throw error;
  return count ?? 0;
}

let normalUserId;
let ownSessionId;
let retainedSessionId;
let zeroImprovementSessionId;
let threeImprovementSessionId;
let legacySessionId;
let cascadeUserId;
let cascadeSessionId;
let existingSessionId;
let startedSessionId;
let suspendedContext;

const browser = await chromium.launch({ headless: true });
const publicContext = await browser.newContext();
const publicPage = await publicContext.newPage();
const normalContext = await browser.newContext();
const normalPage = await normalContext.newPage();
const adminContext = await browser.newContext();
const adminPage = await adminContext.newPage();

try {
  if (usesTemporaryAdmin) {
    await createUser(adminEmail, adminPassword, "Codex Functional Admin", "admin");
  }
  const { data: existingSession } = await admin
    .from("coaching_sessions")
    .select("id")
    .not("user_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  existingSessionId = existingSession?.id ?? null;

  normalUserId = await createUser(normalEmail, normalPassword, "Codex Functional User");
  ownSessionId = await createCompletedSession(normalUserId, "Codex E2E Löschtest");
  zeroImprovementSessionId = await createCompletedSession(normalUserId, "Codex E2E ohne Hebel", { improvementCount: 0 });
  threeImprovementSessionId = await createCompletedSession(normalUserId, "Codex E2E drei Hebel", { improvementCount: 3 });
  legacySessionId = await createCompletedSession(normalUserId, "Codex E2E alte Session", {
    improvementCount: 0,
    strengths: null,
  });
  retainedSessionId = await createCompletedSession(normalUserId, "Codex E2E Restbestand");

  await check("UI-01", "Öffentliche Landingpage lädt vollständig", async () => {
    const response = await publicPage.goto(`${baseUrl}/`);
    assert(response?.status() === 200, `HTTP ${response?.status()}`);
    await publicPage.getByRole("heading", { name: "Meet Ossi. The Prince of Sales Calls." }).waitFor();
    assert(await publicPage.getByRole("link", { name: "Impressum" }).count() === 1, "Impressumslink fehlt.");
    return { http: 200 };
  });

  await check("UI-02", "Mobile Layout hat keinen horizontalen Überlauf", async () => {
    await publicPage.setViewportSize({ width: 390, height: 844 });
    await publicPage.goto(`${baseUrl}/`);
    const dimensions = await publicPage.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    }));
    assert(dimensions.scrollWidth <= dimensions.clientWidth, JSON.stringify(dimensions));
    return dimensions;
  });

  await check("AUTH-01", "Geschützte Seite leitet anonym zum Login um", async () => {
    await publicPage.goto(`${baseUrl}/app`);
    const url = new URL(publicPage.url());
    assert(url.pathname === "/login", `Unerwarteter Pfad ${url.pathname}`);
    assert(url.searchParams.get("next") === "/app", "Rücksprungziel fehlt.");
    return { finalUrl: publicPage.url() };
  });

  await check("AUTH-02", "Ungültige Anmeldung zeigt neutrale Fehlermeldung", async () => {
    await publicPage.getByLabel("E-Mail-Adresse").fill("nobody@example.com");
    await publicPage.getByLabel("Passwort").fill("wrong-password");
    await publicPage.getByRole("button", { name: "Anmelden" }).click();
    const alert = publicPage.locator(".form-message.error");
    await alert.waitFor();
    const text = await alert.innerText();
    assert(text.includes("nicht korrekt"), text);
    return { message: text };
  });

  await check("AUTH-03", "Passwort-Reset-Modus ist erreichbar und reversibel", async () => {
    await publicPage.getByRole("button", { name: "Passwort vergessen?" }).click();
    await publicPage.getByRole("button", { name: "Reset-Link senden" }).waitFor();
    await publicPage.getByRole("button", { name: "Zurück zur Anmeldung" }).click();
    await publicPage.getByLabel("Passwort").waitFor();
  });

  await check("AUTH-04", "Passwortformular validiert Mindestlänge und Gleichheit", async () => {
    await publicPage.goto(`${baseUrl}/set-password`);
    await publicPage.locator("form").evaluate((form) => { form.noValidate = true; });
    await publicPage.getByLabel("Neues Passwort").fill("kurz");
    await publicPage.getByLabel("Passwort wiederholen").fill("kurz");
    await publicPage.getByRole("button", { name: "Passwort festlegen" }).click();
    assert((await publicPage.locator(".form-message.error").innerText()).includes("mindestens 10"), "Mindestlängenfehler fehlt.");
    await publicPage.getByLabel("Neues Passwort").fill("langes-passwort-1");
    await publicPage.getByLabel("Passwort wiederholen").fill("langes-passwort-2");
    await publicPage.getByRole("button", { name: "Passwort festlegen" }).click();
    assert((await publicPage.locator(".form-message.error").innerText()).includes("nicht überein"), "Abgleichfehler fehlt.");
  });

  await check("AUTH-05", "Sicherer Login ignoriert externes next-Ziel", async () => {
    await login(normalPage, normalEmail, normalPassword, "https://evil.example/phish");
    const url = new URL(normalPage.url());
    assert(url.origin === baseUrl && url.pathname === "/app", `Unsicheres Ziel: ${normalPage.url()}`);
    return { finalUrl: normalPage.url() };
  });

  await check("NAV-01", "Dashboard zeigt Nutzer, Kennzahlen und Sessionverlauf", async () => {
    await normalPage.getByRole("heading", { name: "Hallo Codex." }).waitFor();
    await normalPage.getByRole("link", { name: "Codex E2E Löschtest", exact: true }).waitFor();
    assert(await normalPage.getByText("Deine sechs Kompetenzen").count() === 1, "Kompetenzbereich fehlt.");
  });

  await check("NAV-02", "Hilfeseite und Navigation sind erreichbar", async () => {
    await normalPage.goto(`${baseUrl}/app/so-funktionierts`);
    await normalPage.getByRole("heading", { name: "So funktioniert dein Training." }).waitFor();
    assert(await normalPage.getByText("Eine Session in vier Schritten").count() === 1, "Ablauf fehlt.");
  });

  await check("TRAIN-01", "Überraschungsmodus ist Standard und Einwilligung sperrt Start", async () => {
    await normalPage.goto(`${baseUrl}/app/training`);
    const surprise = normalPage.getByRole("radio", { name: /Ossi überrascht mich/ });
    assert(await surprise.isChecked(), "Überraschungsmodus ist nicht vorausgewählt.");
    const start = normalPage.getByRole("button", { name: "Voice-Training starten" });
    assert(await start.isDisabled(), "Start ist ohne Einwilligung aktiv.");
    await normalPage.getByRole("checkbox", { name: /Einwilligung zur Transkriptspeicherung/ }).check();
    assert(await start.isEnabled(), "Start bleibt trotz Einwilligung gesperrt.");
  });

  await check("TRAIN-02", "Gezieltes Training bietet alle sechs Schwerpunkte", async () => {
    await normalPage.goto(`${baseUrl}/app/training?mode=focus`);
    assert(await normalPage.getByRole("radio", { name: /Gezielt trainieren/ }).isChecked(), "Fokusmodus nicht aktiv.");
    const options = await normalPage.locator("#focusCriterion option").count();
    assert(options === 6, `Erwartet 6, erhalten ${options}`);
    return { focusOptions: options };
  });

  await check("RLS-01", "Normaler Nutzer wird aus dem Adminbereich zurückgeleitet", async () => {
    await normalPage.goto(`${baseUrl}/admin/users`);
    assert(new URL(normalPage.url()).pathname === "/app", `Unerwartetes Ziel ${normalPage.url()}`);
  });

  await check("SESSION-01", "Sessiondetail zeigt Bewertungen, Zeit und Phasentrenner", async () => {
    await normalPage.goto(`${baseUrl}/app/sessions/${ownSessionId}`);
    await normalPage.getByRole("heading", { name: "Codex E2E Löschtest" }).waitFor();
    assert(await normalPage.getByLabel("Zeitpunkt und Dauer der Session").count() === 1, "Sessionmetadaten fehlen.");
    assert(await normalPage.locator(".score-card").count() === 6, "Nicht genau sechs Bewertungskarten.");
    await normalPage.getByText(/Transkript anzeigen/).click();
    for (const label of ["Coach-Start", "Rollenspiel", "Coach-Auswertung"]) {
      assert(await normalPage.getByText(label, { exact: true }).count() >= 1, `${label} fehlt.`);
    }
    assert(await normalPage.getByText("Ossi / Kundenrolle", { exact: true }).count() >= 1, "Kundenrollenlabel fehlt.");
  });

  await check("SESSION-02", "Coaching-Fazit zeigt null, einen, drei und alte Sessions korrekt", async () => {
    const variants = [
      { id: zeroImprovementSessionId, expected: 0 },
      { id: ownSessionId, expected: 1 },
      { id: threeImprovementSessionId, expected: 3 },
      { id: legacySessionId, expected: 0 },
    ];
    for (const variant of variants) {
      await normalPage.goto(`${baseUrl}/app/sessions/${variant.id}`);
      await normalPage.getByRole("heading", { name: "Das nimmst du aus der Session mit" }).waitFor();
      assert(
        await normalPage.locator(".category-improvement").count() === variant.expected,
        `Erwartet ${variant.expected} Verbesserungen für ${variant.id}.`,
      );
      assert(
        await normalPage.locator(".conclusion-improvements li").count() === variant.expected,
        `Übersicht und Karten weichen für ${variant.id} ab.`,
      );
    }
    return { variants: variants.map(({ expected }) => expected) };
  });

  await check("SESSION-03", "Session-Fazit bleibt auf Desktop, Tablet und Mobile responsiv", async () => {
    const viewports = [
      { name: "desktop", width: 1440, height: 1000 },
      { name: "tablet", width: 768, height: 1024 },
      { name: "mobile", width: 390, height: 844 },
    ];
    const screenshotsUrl = new URL("../artifacts/visual-qa/", import.meta.url);
    await mkdir(screenshotsUrl, { recursive: true });
    for (const viewport of viewports) {
      await normalPage.setViewportSize(viewport);
      await normalPage.goto(`${baseUrl}/app/sessions/${threeImprovementSessionId}`);
      await normalPage.getByRole("heading", { name: "Das nimmst du aus der Session mit" }).waitFor();
      const dimensions = await normalPage.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      }));
      assert(dimensions.scrollWidth <= dimensions.clientWidth, `${viewport.name}: ${JSON.stringify(dimensions)}`);
      await normalPage.screenshot({
        path: fileURLToPath(new URL(`session-improvements-${viewport.name}.png`, screenshotsUrl)),
        fullPage: true,
      });
    }
    return { viewports };
  });

  await check("RLS-02", "Fremde Session ist für normalen Nutzer nicht lesbar", async () => {
    if (!existingSessionId) return { skipped: "Keine bestehende Fremdsession vorhanden." };
    const response = await normalPage.goto(`${baseUrl}/app/sessions/${existingSessionId}`);
    assert(response?.status() === 404, `Erwartet 404, erhalten ${response?.status()}`);
    return { http: response?.status() };
  });

  await check("RLS-03", "Fremde Session kann nicht gelöscht werden", async () => {
    if (!existingSessionId) return { skipped: "Keine bestehende Fremdsession vorhanden." };
    const result = await browserJson(normalPage, `/api/sessions/${existingSessionId}`, { method: "DELETE" });
    assert(result.status === 404, `Erwartet 404, erhalten ${result.status}`);
    return result;
  });

  await check("DELETE-01", "Abgebrochene Löschbestätigung erhält die Session", async () => {
    await normalPage.goto(`${baseUrl}/app/sessions/${ownSessionId}`);
    normalPage.once("dialog", (dialog) => dialog.dismiss());
    await normalPage.getByRole("button", { name: "Session löschen" }).click();
    await normalPage.waitForTimeout(300);
    assert(await countRows("coaching_sessions", "id", ownSessionId) === 1, "Session wurde trotz Abbruch gelöscht.");
  });

  await check("DELETE-02", "Bestätigtes Löschen entfernt Session und Bewertungen", async () => {
    normalPage.once("dialog", (dialog) => dialog.accept());
    await normalPage.getByRole("button", { name: "Session löschen" }).click();
    await normalPage.waitForURL(`${baseUrl}/app`);
    const sessionCount = await countRows("coaching_sessions", "id", ownSessionId);
    const evaluationCount = await countRows("session_evaluations", "session_id", ownSessionId);
    assert(sessionCount === 0, `Sessioncount ${sessionCount}`);
    assert(evaluationCount === 0, `Evaluationcount ${evaluationCount}`);
    cleanupSessionIds.delete(ownSessionId);
    return { sessionCount, evaluationCount };
  });

  await check("DELETE-03", "Session-Löschen berechnet Kompetenzfortschritt und Lernprofil neu", async () => {
    const progressCount = await countRows("user_competency_progress", "user_id", normalUserId);
    const learningCount = await countRows("learning_profiles", "user_id", normalUserId);
    const { data: learningRows, error } = await admin
      .from("learning_profiles")
      .select("source_session_id")
      .eq("user_id", normalUserId);
    if (error) throw error;
    assert(progressCount === 6, `Fortschrittszeilen nach Neuberechnung: ${progressCount}`);
    assert(learningCount === 2, `Lernprofile nach Neuberechnung: ${learningCount}`);
    assert(learningRows.every((row) => row.source_session_id === retainedSessionId), "Falsche Quell-Session im Lernprofil.");
    return { progressCount, learningCount, sourceSessionId: retainedSessionId };
  });

  await check("API-START-01", "Sessionstart verlangt Einwilligung", async () => {
    const result = await browserJson(normalPage, "/api/sessions/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trainingTypeId, scenarioId, mode: "surprise", consent: false, consentVersion }),
    });
    assert(result.status === 400, `Erwartet 400, erhalten ${result.status}`);
    return result;
  });

  await check("API-START-02", "Sessionstart lehnt veraltete Einwilligungsversion ab", async () => {
    const result = await browserJson(normalPage, "/api/sessions/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trainingTypeId, scenarioId, mode: "surprise", consent: true, consentVersion: "alt" }),
    });
    assert(result.status === 400 && result.body?.code === "invalid_consent", JSON.stringify(result));
    return result;
  });

  await check("API-START-03", "Fokusmodus verlangt einen Schwerpunkt", async () => {
    const result = await browserJson(normalPage, "/api/sessions/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trainingTypeId, scenarioId, mode: "focus", consent: true, consentVersion }),
    });
    assert(result.status === 400, `Erwartet 400, erhalten ${result.status}`);
    return result;
  });

  await check("API-START-04", "Gültiger Start liefert signierte URL und Personalisierung", async () => {
    const result = await browserJson(normalPage, "/api/sessions/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trainingTypeId, scenarioId, mode: "surprise", consent: true, consentVersion }),
    });
    assert(result.status === 200, JSON.stringify(result.body));
    assert(result.body?.sessionId && result.body?.signedUrl && result.body?.dynamicVariables, "Antwort unvollständig.");
    assert(result.body.dynamicVariables.user_first_name === "Codex", "Vorname nicht personalisiert.");
    startedSessionId = result.body.sessionId;
    cleanupSessionIds.add(startedSessionId);
    return { sessionId: startedSessionId, hasSignedUrl: true, dynamicVariableCount: Object.keys(result.body.dynamicVariables).length };
  });

  await check("API-START-05", "Paralleler zweiter Start wird blockiert", async () => {
    const result = await browserJson(normalPage, "/api/sessions/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trainingTypeId, scenarioId, mode: "surprise", consent: true, consentVersion }),
    });
    assert(result.status === 409 && result.body?.code === "session_already_open", JSON.stringify(result));
    return result;
  });

  await check("API-BIND-01", "Bindung validiert Conversation-ID", async () => {
    const result = await browserJson(normalPage, `/api/sessions/${startedSessionId}/bind`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: "kurz" }),
    });
    assert(result.status === 400, `Erwartet 400, erhalten ${result.status}`);
    return result;
  });

  const conversationId = `conv_codex_${runId}`;
  await check("API-BIND-02", "Session wird genau einmal mit Conversation verknüpft", async () => {
    const result = await browserJson(normalPage, `/api/sessions/${startedSessionId}/bind`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId }),
    });
    assert(result.status === 200 && result.body?.bound === true, JSON.stringify(result));
    return result;
  });

  await check("API-BIND-03", "Identische Bindung ist idempotent", async () => {
    const result = await browserJson(normalPage, `/api/sessions/${startedSessionId}/bind`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId }),
    });
    assert(result.status === 200 && result.body?.duplicate === true, JSON.stringify(result));
    return result;
  });

  await check("API-BIND-04", "Abweichende zweite Bindung wird blockiert", async () => {
    const result = await browserJson(normalPage, `/api/sessions/${startedSessionId}/bind`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: `${conversationId}_other` }),
    });
    assert(result.status === 409, `Erwartet 409, erhalten ${result.status}`);
    return result;
  });

  await check("API-START-06", "Stündliches Limit wird vor Provider-Aufruf erzwungen", async () => {
    await admin.from("coaching_sessions").delete().eq("id", startedSessionId);
    cleanupSessionIds.delete(startedSessionId);
    const recentRows = Array.from({ length: 10 }, (_, index) => ({
      user_id: normalUserId,
      training_type_version_id: trainingTypeVersionId,
      scenario_id: scenarioId,
      status: "failed",
      consent_version: consentVersion,
      consented_at: new Date().toISOString(),
      scenario_snapshot: { rateLimitTest: true, index },
      processing_error: "Codex rate limit test",
    }));
    const { data, error } = await admin.from("coaching_sessions").insert(recentRows).select("id");
    if (error) throw error;
    for (const row of data ?? []) cleanupSessionIds.add(row.id);
    const result = await browserJson(normalPage, "/api/sessions/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trainingTypeId, scenarioId, mode: "surprise", consent: true, consentVersion }),
    });
    assert(result.status === 429 && result.body?.code === "session_rate_limited", JSON.stringify(result));
    await admin.from("coaching_sessions").delete().in("id", (data ?? []).map((row) => row.id));
    for (const row of data ?? []) cleanupSessionIds.delete(row.id);
    return result;
  });

  await check("ADMIN-01", "Admin sieht Nutzer- und Sessionverwaltung", async () => {
    await login(adminPage, adminEmail, adminPassword);
    await adminPage.goto(`${baseUrl}/admin/users`);
    await adminPage.getByRole("heading", { name: "Nutzer verwalten" }).waitFor();
    await adminPage.getByText("Codex Functional User", { exact: true }).waitFor();
    await adminPage.goto(`${baseUrl}/admin/sessions`);
    await adminPage.getByRole("heading", { name: "Alle Sessions" }).waitFor();
    assert(await adminPage.locator("tbody tr").count() >= 1, "Keine Sessions in Adminliste.");
  });

  await check("ADMIN-02", "Admin kann bestehende fremde Session schreibgeschützt öffnen", async () => {
    if (!existingSessionId) return { skipped: "Keine bestehende Session vorhanden." };
    const response = await adminPage.goto(`${baseUrl}/app/sessions/${existingSessionId}`);
    assert(response?.status() === 200, `Admin-Sessiondetail HTTP ${response?.status()}`);
    assert(await adminPage.getByText("Transkript", { exact: true }).count() === 1, "Transkriptbereich fehlt.");
    return { http: response?.status() };
  });

  await check("ADMIN-03", "Einladungsroute validiert Eingaben", async () => {
    const result = await browserJson(adminPage, "/api/admin/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "keine-email", displayName: "", role: "root" }),
    });
    assert(result.status === 400 && result.body?.code === "validation_error", JSON.stringify(result));
    return result;
  });

  await check("ADMIN-04", "Admin kann sich nicht selbst sperren oder löschen", async () => {
    const { data: users, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;
    const currentAdmin = users.users.find((user) => user.email?.toLowerCase() === adminEmail.toLowerCase());
    if (!currentAdmin) throw new Error("Testadmin nicht gefunden.");
    const lock = await browserJson(adminPage, `/api/admin/users/${currentAdmin.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    const remove = await browserJson(adminPage, `/api/admin/users/${currentAdmin.id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmationEmail: adminEmail }),
    });
    assert(lock.status === 400 && lock.body?.code === "self_lockout", JSON.stringify(lock));
    assert(remove.status === 400 && remove.body?.code === "self_delete", JSON.stringify(remove));
    return { lock: lock.status, remove: remove.status };
  });

  await check("ADMIN-05", "Sperren blockiert bestehende Nutzersession", async () => {
    suspendedContext = await browser.newContext();
    const suspendedPage = await suspendedContext.newPage();
    await login(suspendedPage, normalEmail, normalPassword);
    await adminPage.goto(`${baseUrl}/admin/users`);
    const row = adminPage.locator("tr").filter({ hasText: normalEmail });
    await row.getByRole("button", { name: "Sperren" }).click();
    await adminPage.getByText("Nutzer wurde gesperrt.").waitFor();
    const { data: profile } = await admin.from("profiles").select("is_active").eq("id", normalUserId).single();
    const { data: authUser } = await admin.auth.admin.getUserById(normalUserId);
    assert(profile.is_active === false, "Profil blieb aktiv.");
    assert(Boolean(authUser.user?.banned_until), "Auth-Ban fehlt.");
    const response = await suspendedPage.goto(`${baseUrl}/app`);
    const suspendedUrl = new URL(suspendedPage.url());
    assert(suspendedUrl.pathname === "/login", `Gesperrter Nutzer blieb im Portal (HTTP ${response?.status()}).`);
    assert(suspendedUrl.searchParams.get("error") === "inactive", "Inaktiv-Hinweis fehlt.");
    return { isActive: profile.is_active, banned: Boolean(authUser.user?.banned_until) };
  });

  await check("ADMIN-06", "Reaktivieren hebt Profil- und Auth-Sperre auf", async () => {
    await adminPage.goto(`${baseUrl}/admin/users`);
    const row = adminPage.locator("tr").filter({ hasText: normalEmail });
    await row.getByRole("button", { name: "Reaktivieren" }).click();
    await adminPage.getByText("Nutzer wurde reaktiviert.").waitFor();
    const { data: profile } = await admin.from("profiles").select("is_active").eq("id", normalUserId).single();
    const { data: authUser } = await admin.auth.admin.getUserById(normalUserId);
    assert(profile.is_active === true, "Profil blieb gesperrt.");
    assert(!authUser.user?.banned_until || new Date(authUser.user.banned_until) <= new Date(), "Auth-Ban blieb bestehen.");
    return { isActive: profile.is_active, bannedUntil: authUser.user?.banned_until ?? null };
  });

  cascadeUserId = await createUser(cascadeEmail, cascadePassword, "Codex Cascade User");
  cascadeSessionId = await createCompletedSession(cascadeUserId, "Codex E2E Nutzerlöschung");
  await check("ADMIN-07", "Nutzerlöschung entfernt alle personenbezogenen Daten per Kaskade", async () => {
    const result = await browserJson(adminPage, `/api/admin/users/${cascadeUserId}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmationEmail: cascadeEmail }),
    });
    assert(result.status === 200 && result.body?.deleted === true, JSON.stringify(result));
    const counts = {
      profiles: await countRows("profiles", "id", cascadeUserId),
      roles: await countRows("app_roles", "user_id", cascadeUserId),
      sessions: await countRows("coaching_sessions", "user_id", cascadeUserId),
      progress: await countRows("user_competency_progress", "user_id", cascadeUserId),
      learning: await countRows("learning_profiles", "user_id", cascadeUserId),
    };
    assert(Object.values(counts).every((count) => count === 0), JSON.stringify(counts));
    const { data: authUser, error } = await admin.auth.admin.getUserById(cascadeUserId);
    assert(Boolean(error) || !authUser.user, "Auth-Nutzer besteht weiterhin.");
    cleanupUserIds.delete(cascadeUserId);
    cleanupSessionIds.delete(cascadeSessionId);
    return counts;
  });

  await check("AUTH-06", "Abmelden beendet die Portalsitzung", async () => {
    await adminPage.goto(`${baseUrl}/app`);
    await adminPage.getByRole("button", { name: "Abmelden" }).click();
    await adminPage.waitForURL((url) => url.pathname === "/login");
    await adminPage.goto(`${baseUrl}/app`);
    assert(new URL(adminPage.url()).pathname === "/login", "Portal blieb nach Logout erreichbar.");
  });
} finally {
  await suspendedContext?.close().catch(() => {});
  for (const sessionId of cleanupSessionIds) {
    await admin.from("coaching_sessions").delete().eq("id", sessionId);
  }
  for (const userId of cleanupUserIds) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
  }
  await Promise.all([
    publicContext.close(),
    normalContext.close(),
    adminContext.close(),
  ]);
  await browser.close();
}

const totals = {
  total: results.length,
  passed: results.filter((item) => item.status === "PASS").length,
  failed: results.filter((item) => item.status === "FAIL").length,
};
const report = { generatedAt: new Date().toISOString(), baseUrl, totals, results };
await mkdir(new URL("../artifacts/test-results/", import.meta.url), { recursive: true });
const reportUrl = new URL(`../artifacts/test-results/full-functional-${runId}.json`, import.meta.url);
await writeFile(reportUrl, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ report: reportUrl.pathname, totals }, null, 2));
if (totals.failed > 0) process.exitCode = 1;
