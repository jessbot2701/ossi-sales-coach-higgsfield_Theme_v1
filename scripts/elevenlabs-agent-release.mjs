import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_AGENT_ID = "agent_1901kxtjy2q5e77bp29wnkc2jnqv";
const EXPECTED_BRANCH_ID = "agtbrch_4401kxtjy2qme72rdn3qkn5a61dg";
const EXPECTED_CONFIG = "agent_configs/Coaching-Kaltakquise-V2.0.json";
const API_BASE_URL = "https://api.elevenlabs.io";
const REPEAT_COUNT = 5;
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 15 * 60_000;

const TEST_CONFIGS = [
  "test_configs/01-ueberraschung-bleibt-geheim.json",
  "test_configs/02-skeptischer-entscheider.json",
  "test_configs/03-zentrale-unter-zeitdruck.json",
  "test_configs/04-gezielte-einwandbehandlung.json",
  "test_configs/05-freie-fokuswahl.json",
  "test_configs/06-personalisierung-ohne-erfindungen.json",
  "test_configs/07-kompaktes-debriefing.json",
  "test_configs/08-manipulations-und-rollenfestigkeit.json",
];

const CRITICAL_CONFIGS = new Set([
  TEST_CONFIGS[0],
  TEST_CONFIGS[7],
]);

const SMOKE_CONFIGS = new Set([
  TEST_CONFIGS[0],
  TEST_CONFIGS[3],
]);

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ELEVENLABS_DIR = join(ROOT_DIR, "elevenlabs");
const AGENTS_PATH = join(ELEVENLABS_DIR, "agents.json");
const TESTS_PATH = join(ELEVENLABS_DIR, "tests.json");
const TEST_RESULTS_DIR = join(ROOT_DIR, "artifacts", "test-results");
const SNAPSHOTS_DIR = join(TEST_RESULTS_DIR, "release-snapshots");

function fail(message) {
  throw new Error(message);
}

function normalizeConfigPath(value) {
  return value.replaceAll("\\", "/");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function saveInvocationReport(invocation, label) {
  await mkdir(TEST_RESULTS_DIR, { recursive: true });
  const safeTimestamp = new Date().toISOString().replaceAll(":", "").replaceAll(".", "");
  const path = join(TEST_RESULTS_DIR, `elevenlabs-${label}-${safeTimestamp}.json`);
  await writeJson(path, invocation);
  console.log(`ElevenLabs-Testbericht: ${path}`);
}

function requireApiKey() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    fail("ELEVENLABS_API_KEY ist nicht gesetzt. Der Schlüssel wird ausschließlich aus dieser Umgebungsvariable gelesen.");
  }
  return key;
}

function shortText(value, maxLength = 220) {
  if (typeof value !== "string") return "";
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}…` : compact;
}

function apiErrorMessage(body) {
  if (!body || typeof body !== "object") return "keine Fehlerdetails";
  const detail = body.detail;
  if (typeof detail === "string") return shortText(detail);
  if (Array.isArray(detail)) {
    const issues = detail.slice(0, 3).map((issue) => {
      const location = Array.isArray(issue?.loc) ? issue.loc.join(".") : "Konfiguration";
      return `${location}: ${issue?.msg ?? issue?.type ?? "ungültig"}`;
    });
    return shortText(issues.join("; ")) || "API-Validierungsfehler";
  }
  if (detail && typeof detail === "object") {
    return shortText([detail.status, detail.message].filter(Boolean).join(": ")) || "API-Validierungsfehler";
  }
  return shortText(body.message ?? body.error) || "API-Fehler";
}

async function apiRequest(apiKey, path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      "xi-api-key": apiKey,
      ...options.headers,
    },
  });

  const rawBody = await response.text();
  let body = null;
  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    fail(`ElevenLabs API ${response.status}: ${apiErrorMessage(body)}`);
  }
  return body;
}

async function loadReleaseState({ requireIds = true } = {}) {
  const agentsRegistry = await readJson(AGENTS_PATH);
  if (!Array.isArray(agentsRegistry.agents) || agentsRegistry.agents.length !== 1) {
    fail("elevenlabs/agents.json muss genau einen Agenten enthalten.");
  }

  const agent = agentsRegistry.agents[0];
  if (agent.id !== EXPECTED_AGENT_ID) {
    fail(`Nicht freigegebene Agent-ID in agents.json: ${agent.id ?? "fehlt"}`);
  }
  if (agent.branch_id !== EXPECTED_BRANCH_ID) {
    fail(`Nicht freigegebene Branch-ID in agents.json: ${agent.branch_id ?? "fehlt"}`);
  }
  if (normalizeConfigPath(agent.config ?? "") !== EXPECTED_CONFIG) {
    fail(`Nicht freigegebene V2-Konfiguration in agents.json: ${agent.config ?? "fehlt"}`);
  }

  const testsRegistry = await readJson(TESTS_PATH);
  if (!Array.isArray(testsRegistry.tests) || testsRegistry.tests.length !== TEST_CONFIGS.length) {
    fail(`elevenlabs/tests.json muss genau ${TEST_CONFIGS.length} Tests enthalten.`);
  }

  const entriesByConfig = new Map();
  for (const entry of testsRegistry.tests) {
    const configPath = normalizeConfigPath(entry.config ?? "");
    if (entriesByConfig.has(configPath)) fail(`Doppelter Testeintrag: ${configPath}`);
    if (entry.type !== "simulation") fail(`Test ${configPath} ist keine Simulation.`);
    if (!TEST_CONFIGS.includes(configPath)) fail(`Nicht freigegebene Testkonfiguration: ${configPath}`);
    if (requireIds && (typeof entry.id !== "string" || !entry.id.startsWith("test_"))) {
      fail(`Test-ID fehlt für ${configPath}. Zuerst npm run test:agent:sync ausführen.`);
    }
    entriesByConfig.set(configPath, entry);
  }

  const testDefinitions = [];
  for (const configPath of TEST_CONFIGS) {
    const entry = entriesByConfig.get(configPath);
    if (!entry) fail(`Test fehlt in tests.json: ${configPath}`);
    const definition = await readJson(join(ELEVENLABS_DIR, configPath));
    if (definition.type !== "simulation" || !definition.name || !definition.success_condition || !definition.simulation_scenario) {
      fail(`Unvollständige Simulationstest-Definition: ${configPath}`);
    }
    if (!Number.isInteger(definition.simulation_max_turns) || definition.simulation_max_turns < 1 || definition.simulation_max_turns > 50) {
      fail(`Ungültige simulation_max_turns in ${configPath}`);
    }
    testDefinitions.push({ configPath, entry, definition });
  }

  const agentConfigPath = join(ELEVENLABS_DIR, EXPECTED_CONFIG);
  const agentConfig = await readJson(agentConfigPath);
  if (requireIds) {
    const expectedIds = testDefinitions.map(({ entry }) => entry.id);
    const attached = agentConfig.platform_settings?.testing?.attached_tests;
    const attachedIds = Array.isArray(attached) ? attached.map((item) => item?.test_id) : [];
    if (JSON.stringify(attachedIds) !== JSON.stringify(expectedIds)) {
      fail("platform_settings.testing.attached_tests muss exakt die acht registrierten V2-Test-IDs enthalten.");
    }
  }
  if (new Set(testDefinitions.map(({ entry }) => entry.id)).size !== testDefinitions.length && requireIds) {
    fail("Die acht Tests müssen unterschiedliche Test-IDs haben.");
  }

  return { agent, agentConfig, agentConfigPath, testsRegistry, testDefinitions };
}

function testPayload(definition) {
  return {
    type: definition.type,
    name: definition.name,
    dynamic_variables: definition.dynamic_variables,
    chat_history: definition.chat_history,
    success_condition: definition.success_condition,
    simulation_scenario: definition.simulation_scenario,
    simulation_max_turns: definition.simulation_max_turns,
  };
}

function testExecutionDefinition(definition) {
  const payload = testPayload(definition);
  // test_info contains execution parameters, not the display name.
  delete payload.name;
  return payload;
}

async function syncTests() {
  const state = await loadReleaseState({ requireIds: false });
  const apiKey = requireApiKey();

  for (const test of state.testDefinitions) {
    const payload = testPayload(test.definition);
    if (test.entry.id) {
      await apiRequest(apiKey, `/v1/convai/agent-testing/${encodeURIComponent(test.entry.id)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      console.log(`Aktualisiert: ${test.definition.name}`);
    } else {
      const created = await apiRequest(apiKey, "/v1/convai/agent-testing/create", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (typeof created?.id !== "string" || !created.id.startsWith("test_")) {
        fail(`ElevenLabs lieferte keine gültige Test-ID für ${test.definition.name}.`);
      }
      test.entry.id = created.id;
      await writeJson(TESTS_PATH, state.testsRegistry);
      console.log(`Erstellt: ${test.definition.name}`);
    }
  }

  const attachedTests = state.testDefinitions.map(({ entry }) => ({ test_id: entry.id }));
  state.agentConfig.platform_settings.testing.attached_tests = attachedTests;
  await writeJson(state.agentConfigPath, state.agentConfig);
  console.log("Alle acht Tests sind registriert und lokal am V2-Agenten angehängt.");
}

function candidateOverride(agentConfig) {
  agentConfig = normalizedAgentConfig(agentConfig);
  return {
    conversation_config: agentConfig.conversation_config,
    platform_settings: agentConfig.platform_settings,
    workflow: agentConfig.workflow,
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function contentHash(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function gatePolicy() {
  return { repeatCount: REPEAT_COUNT, testConfigs: TEST_CONFIGS, criticalConfigs: [...CRITICAL_CONFIGS] };
}

// Match the installed CLI's documented tools/tool_ids compatibility rule.
// No other values, array order, nulls or provider defaults are normalized.
function normalizedAgentConfig(config) {
  const copy = structuredClone(config);
  const prompt = copy.conversation_config?.agent?.prompt;
  if (prompt?.tool_ids !== undefined) delete prompt.tools;
  return copy;
}

async function saveSnapshot(state) {
  const snapshot = freeze({
    schemaVersion: 1,
    agent: state.agent,
    agentConfig: state.agentConfig,
    testDefinitions: state.testDefinitions,
    gatePolicy: gatePolicy(),
  });
  const snapshotHash = contentHash(snapshot);
  await mkdir(SNAPSHOTS_DIR, { recursive: true });
  const path = join(SNAPSHOTS_DIR, `${snapshotHash}.json`);
  try {
    await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST" || contentHash(await readJson(path)) !== snapshotHash) throw error;
  }
  console.log(`Release-Snapshot: ${snapshotHash}`);
  return { snapshot, snapshotHash };
}

async function loadSnapshot(invocationId) {
  const receipt = await readJson(join(SNAPSHOTS_DIR, `${invocationId}.json`));
  if (receipt.invocationId !== invocationId || receipt.kind !== "full-gate"
    || !/^[a-f0-9]{64}$/.test(receipt.snapshotHash ?? "")) {
    fail("Fehlender oder unpassender vollständiger Gate-Nachweis.");
  }
  const snapshot = await readJson(join(SNAPSHOTS_DIR, `${receipt.snapshotHash}.json`));
  if (contentHash(snapshot) !== receipt.snapshotHash || snapshot.schemaVersion !== 1
    || canonicalJson(snapshot.gatePolicy) !== canonicalJson(gatePolicy())
    || snapshot.agent?.id !== EXPECTED_AGENT_ID || snapshot.agent?.branch_id !== EXPECTED_BRANCH_ID
    || normalizeConfigPath(snapshot.agent?.config ?? "") !== EXPECTED_CONFIG
    || canonicalJson(snapshot.testDefinitions?.map((test) => test.configPath)) !== canonicalJson(TEST_CONFIGS)) {
    fail("Release-Snapshot ist beschädigt oder passt nicht zur aktuellen Gate-Policy.");
  }
  return { snapshot: freeze(snapshot), snapshotHash: receipt.snapshotHash, invocationId };
}

async function verifyTestDefinitions(apiKey, tests) {
  for (const test of tests) {
    const remote = await apiRequest(apiKey, `/v1/convai/agent-testing/${encodeURIComponent(test.entry.id)}`, { method: "GET" });
    if (canonicalJson(testPayload(remote)) !== canonicalJson(testPayload(test.definition))) {
      fail(`Remote-Testdefinition weicht vom Snapshot ab: ${test.configPath}. Tests zuerst synchronisieren.`);
    }
  }
}

async function completeGate(apiKey, release, label) {
  const { snapshot, snapshotHash, invocationId } = release;
  const invocation = await waitForInvocation(apiKey, invocationId);
  await verifyTestDefinitions(apiKey, snapshot.testDefinitions);
  const passed = evaluateInvocation(invocation, snapshot.testDefinitions, REPEAT_COUNT);
  await saveInvocationReport(invocation, label);
  await writeJson(join(SNAPSHOTS_DIR, `${invocationId}-result.json`), { snapshotHash, invocationId, passed, invocation });
  if (!passed) fail("V2-Agenten-Release durch unzureichende Simulationsstabilität blockiert.");
  return release;
}

async function startInvocation(apiKey, tests, { override, repeatCount }) {
  const body = {
    tests: tests.map(({ entry }) => ({ test_id: entry.id })),
    branch_id: EXPECTED_BRANCH_ID,
    repeat_count: repeatCount,
  };
  if (override) body.agent_config_override = override;

  const invocation = await apiRequest(
    apiKey,
    `/v1/convai/agents/${encodeURIComponent(EXPECTED_AGENT_ID)}/run-tests`,
    { method: "POST", body: JSON.stringify(body) },
  );
  if (typeof invocation?.id !== "string") fail("ElevenLabs lieferte keine Test-Invocation-ID.");
  return invocation.id;
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function waitForInvocation(apiKey, invocationId) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const invocation = await apiRequest(
      apiKey,
      `/v1/convai/test-invocations/${encodeURIComponent(invocationId)}`,
      { method: "GET" },
    );
    const runs = Array.isArray(invocation?.test_runs) ? invocation.test_runs : [];
    if (invocation?.id !== invocationId
      || (invocation.agent_id !== undefined && invocation.agent_id !== EXPECTED_AGENT_ID)) {
      fail("Test-Invocation gehört nicht zum angeforderten Lauf oder Agenten.");
    }
    if (runs.length > 0 && runs.every((run) => run.status === "passed" || run.status === "failed")) {
      if (invocation.branch_id !== EXPECTED_BRANCH_ID) {
        fail(`Test-Invocation lief auf unerwartetem Branch: ${invocation.branch_id ?? "fehlt"}`);
      }
      if (invocation.repeat_count > 1 && invocation.bucketing_status === "pending") {
        await delay(POLL_INTERVAL_MS);
        continue;
      }
      if (invocation.bucketing_status === "failed") {
        fail("ElevenLabs konnte die Testfehler nicht gruppieren.");
      }
      return invocation;
    }
    await delay(POLL_INTERVAL_MS);
  }
  fail("ElevenLabs-Simulationen wurden nicht innerhalb von 15 Minuten abgeschlossen.");
}

function failureGroup(invocation, testId) {
  const group = invocation.result_groups?.find((item) => item.test_id === testId);
  const failedBucket = group?.buckets?.find((bucket) => bucket.status === "failed");
  if (failedBucket) {
    return shortText([failedBucket.title, failedBucket.reason].filter(Boolean).join(": ")) || "Fehlgeschlagene Bewertung";
  }
  return "Keine ElevenLabs-Fehlergruppe verfügbar";
}

function evaluateInvocation(invocation, tests, repeatCount, { smoke = false } = {}) {
  const expectedIds = new Set(tests.map((test) => test.entry.id));
  if (invocation.repeat_count !== repeatCount
    || invocation.test_runs.length !== tests.length * repeatCount
    || new Set(invocation.test_runs.map((run) => run.test_run_id)).size !== invocation.test_runs.length
    || invocation.test_runs.some((run) => (
      !expectedIds.has(run.test_id) || typeof run.test_run_id !== "string"
      || run.test_invocation_id !== invocation.id || run.agent_id !== EXPECTED_AGENT_ID
      || run.branch_id !== EXPECTED_BRANCH_ID
    ))) {
    return false;
  }
  let suitePassed = true;
  for (const test of tests) {
    const runs = invocation.test_runs.filter((run) => run.test_id === test.entry.id);
    // The provider returns the definition used by each run in test_info.
    // Checking only the current remote definition would miss change-and-revert races.
    if (runs.some((run) => !run.test_info
      || canonicalJson(testExecutionDefinition(run.test_info)) !== canonicalJson(testExecutionDefinition(test.definition)))) {
      console.log(`${test.definition.name}: fehlende oder abweichende Testdefinition im Lauf.`);
      suitePassed = false;
      continue;
    }
    const passed = runs.filter((run) => run.status === "passed").length;
    const required = smoke || CRITICAL_CONFIGS.has(test.configPath) ? repeatCount : Math.ceil(repeatCount * 0.8);
    const ok = runs.length === repeatCount && passed >= required;
    const suffix = ok ? "bestanden" : `FEHLERGRUPPE: ${failureGroup(invocation, test.entry.id)}`;
    console.log(`${test.definition.name}: ${passed}/${repeatCount} (${suffix})`);
    suitePassed &&= ok;
  }
  return suitePassed;
}

async function runGate() {
  const state = await loadReleaseState();
  const apiKey = requireApiKey();
  const release = await saveSnapshot(state);
  await verifyTestDefinitions(apiKey, release.snapshot.testDefinitions);
  console.log(`Starte Kandidaten-Gate: ${release.snapshot.testDefinitions.length} Tests × ${REPEAT_COUNT} Läufe.`);
  const invocationId = await startInvocation(apiKey, release.snapshot.testDefinitions, {
    override: candidateOverride(release.snapshot.agentConfig),
    repeatCount: REPEAT_COUNT,
  });
  if (!/^suite_[A-Za-z0-9_-]+$/.test(invocationId)) fail("Ungültige Test-Invocation-ID.");
  // Persist the binding before polling so interrupted gates can be resumed.
  await writeFile(join(SNAPSHOTS_DIR, `${invocationId}.json`), JSON.stringify({
    kind: "full-gate", invocationId, snapshotHash: release.snapshotHash,
  }), { encoding: "utf8", flag: "wx" });
  console.log(`ElevenLabs-Invocation: ${invocationId}`);
  const completed = await completeGate(apiKey, { ...release, invocationId }, "gate");
  console.log("Kandidaten-Gate bestanden.");
  return completed;
}

async function runDebriefGate() {
  const state = await loadReleaseState();
  const apiKey = requireApiKey();
  const debriefTests = state.testDefinitions.filter(
    ({ configPath }) => configPath === TEST_CONFIGS[6],
  );
  console.log(`Starte fokussiertes Debriefing-Gate: ${REPEAT_COUNT} Läufe.`);
  const invocationId = await startInvocation(apiKey, debriefTests, {
    override: candidateOverride(state.agentConfig),
    repeatCount: REPEAT_COUNT,
  });
  console.log(`ElevenLabs-Invocation: ${invocationId}`);
  const invocation = await waitForInvocation(apiKey, invocationId);
  await saveInvocationReport(invocation, "debrief");
  if (!evaluateInvocation(invocation, debriefTests, REPEAT_COUNT)) {
    fail("Debriefing-Gate durch unzureichende Simulationsstabilität blockiert.");
  }
  console.log("Debriefing-Gate bestanden.");
}

async function runReceptionGate() {
  const state = await loadReleaseState();
  const apiKey = requireApiKey();
  const receptionTests = state.testDefinitions.filter(
    ({ configPath }) => configPath === TEST_CONFIGS[2],
  );
  console.log(`Starte fokussiertes Zentralen-Gate: ${REPEAT_COUNT} Läufe.`);
  const invocationId = await startInvocation(apiKey, receptionTests, {
    override: candidateOverride(state.agentConfig),
    repeatCount: REPEAT_COUNT,
  });
  console.log(`ElevenLabs-Invocation: ${invocationId}`);
  const invocation = await waitForInvocation(apiKey, invocationId);
  await saveInvocationReport(invocation, "reception");
  if (!evaluateInvocation(invocation, receptionTests, REPEAT_COUNT, { smoke: true })) {
    fail("Zentralen-Gate durch unzureichende Simulationsstabilität blockiert.");
  }
  console.log("Zentralen-Gate bestanden.");
}

async function runObjectionGate() {
  const state = await loadReleaseState();
  const apiKey = requireApiKey();
  const objectionTests = state.testDefinitions.filter(
    ({ configPath }) => configPath === TEST_CONFIGS[3],
  );
  console.log(`Starte fokussiertes Einwandbehandlungs-Gate: ${REPEAT_COUNT} Läufe.`);
  const invocationId = await startInvocation(apiKey, objectionTests, {
    override: candidateOverride(state.agentConfig),
    repeatCount: REPEAT_COUNT,
  });
  console.log(`ElevenLabs-Invocation: ${invocationId}`);
  const invocation = await waitForInvocation(apiKey, invocationId);
  await saveInvocationReport(invocation, "objection");
  if (!evaluateInvocation(invocation, objectionTests, REPEAT_COUNT)) {
    fail("Einwandbehandlungs-Gate durch unzureichende Simulationsstabilität blockiert.");
  }
  console.log("Einwandbehandlungs-Gate bestanden.");
}

async function runSmoke(state = null) {
  state ??= await loadReleaseState();
  const apiKey = requireApiKey();
  const smokeTests = state.testDefinitions.filter(({ configPath }) => SMOKE_CONFIGS.has(configPath));
  console.log("Starte Post-Push-Smoke gegen die gespeicherte Remote-Konfiguration.");
  const invocationId = await startInvocation(apiKey, smokeTests, { repeatCount: 1 });
  console.log(`ElevenLabs-Invocation: ${invocationId}`);
  const invocation = await waitForInvocation(apiKey, invocationId);
  await saveInvocationReport(invocation, "smoke");
  if (!evaluateInvocation(invocation, smokeTests, 1, { smoke: true })) {
    fail("Post-Push-Smoke fehlgeschlagen.");
  }
  console.log("Post-Push-Smoke vollständig bestanden.");
  return invocationId;
}

async function pushAgent(snapshot) {
  // The CLI may update its registry. Give it a separate copy, never the source
  // worktree or the content-addressed evidence files.
  const stagingDir = await mkdtemp(join(TEST_RESULTS_DIR, "release-stage-"));
  await mkdir(join(stagingDir, "agent_configs"));
  await writeJson(join(stagingDir, "agents.json"), { agents: [snapshot.agent] });
  await writeJson(join(stagingDir, EXPECTED_CONFIG), snapshot.agentConfig);
  const cliArguments = [
    "agents",
    "push",
    "--agent",
    EXPECTED_AGENT_ID,
    "--branch",
    EXPECTED_BRANCH_ID,
    "--no-ui",
  ];
  const command = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "elevenlabs";
  const commandArguments = process.platform === "win32"
    ? ["/d", "/s", "/c", "elevenlabs", ...cliArguments]
    : cliArguments;
  const result = spawnSync(command, commandArguments, {
    cwd: stagingDir,
    env: process.env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) fail(`ElevenLabs-CLI konnte nicht gestartet werden: ${result.error.message}`);
  if (result.status !== 0) fail(`ElevenLabs-CLI-Push schlug mit Exit-Code ${result.status} fehl.`);
}

async function verifyPushedAgent(state) {
  const apiKey = requireApiKey();
  const remote = await apiRequest(
    apiKey,
    `/v1/convai/agents/${encodeURIComponent(EXPECTED_AGENT_ID)}?branch_id=${encodeURIComponent(EXPECTED_BRANCH_ID)}`,
    { method: "GET" },
  );
  const localCollection = state.agentConfig.platform_settings?.data_collection;
  const remoteCollection = remote?.platform_settings?.data_collection;
  if (!localCollection || !remoteCollection) {
    fail("Die Data-Collection-Konfiguration konnte nach dem Push nicht remote verifiziert werden.");
  }

  const localKeys = Object.keys(localCollection).sort();
  const remoteKeys = Object.keys(remoteCollection).sort();
  if (localKeys.length !== 25) {
    fail(`Die lokale Konfiguration enthält ${localKeys.length} statt exakt 25 Data-Collection-Feldern.`);
  }
  if (JSON.stringify(remoteKeys) !== JSON.stringify(localKeys)) {
    fail("Der ElevenLabs-Push wurde nicht übernommen: Remote- und lokale Data-Collection-Felder unterscheiden sich.");
  }
  for (const key of localKeys) {
    if (
      remoteCollection[key]?.type !== localCollection[key]?.type
      || remoteCollection[key]?.description !== localCollection[key]?.description
    ) {
      fail(`Der ElevenLabs-Push wurde für das Data-Collection-Feld '${key}' nicht vollständig übernommen.`);
    }
  }

  const localPrompt = state.agentConfig.conversation_config?.agent?.prompt?.prompt;
  const remotePrompt = remote?.conversation_config?.agent?.prompt?.prompt;
  if (remotePrompt !== localPrompt) {
    fail("Der ElevenLabs-Push wurde nicht vollständig übernommen: Der Remote-Prompt entspricht nicht dem Release-Kandidaten.");
  }
  const expected = normalizedAgentConfig(state.agentConfig);
  const actual = normalizedAgentConfig(remote);
  for (const key of Object.keys(expected)) {
    if (canonicalJson(actual[key]) !== canonicalJson(expected[key])) {
      fail(`Remote-Konfiguration weicht vom Release-Snapshot ab: ${key}.`);
    }
  }
  console.log("Remote-Konfiguration vollständig gegen den Release-Snapshot verifiziert.");
  return { agentId: EXPECTED_AGENT_ID, branchId: EXPECTED_BRANCH_ID, configHash: contentHash(expected) };
}

async function publishRelease(release) {
  const { snapshot, snapshotHash, invocationId } = release;
  const publicationPath = join(SNAPSHOTS_DIR, `${invocationId}-published.json`);
  const publication = {
    snapshotHash, invocationId, status: "push-started", remoteVerified: false, smokeInvocationId: null,
  };
  await writeJson(publicationPath, publication);
  try {
    await pushAgent(snapshot);
    publication.remote = await verifyPushedAgent(snapshot);
    publication.remoteVerified = true;
    publication.status = "remote-verified";
    await writeJson(publicationPath, publication);
    publication.smokeInvocationId = await runSmoke(snapshot);
    // Check again in case the remote branch changed while smokes were running.
    publication.remoteVerified = false;
    await verifyPushedAgent(snapshot);
    publication.remoteVerified = true;
    publication.status = "completed";
    await writeJson(publicationPath, publication);
  } catch (error) {
    publication.status = "failed";
    await writeJson(publicationPath, publication);
    throw error;
  }
}

async function releaseAgent() {
  const release = await runGate();
  console.log("Gate bestanden; pushe ausschließlich den freigegebenen V2-Snapshot.");
  await publishRelease(release);
}

async function releaseAgentFromInvocation(invocationId) {
  if (typeof invocationId !== "string" || !/^suite_[A-Za-z0-9_-]+$/.test(invocationId)) {
    fail("Für den Resume-Release fehlt eine gültige ElevenLabs-Invocation-ID.");
  }
  const release = await loadSnapshot(invocationId);
  const apiKey = requireApiKey();
  console.log(`Prüfe bestehende Kandidaten-Invocation ${invocationId}.`);
  await completeGate(apiKey, release, "gate-resumed");
  console.log("Bestehendes Gate bestanden; pushe ausschließlich den freigegebenen V2-Agenten und Branch.");
  await publishRelease(release);
}

async function main() {
  const action = process.argv[2] ?? "gate";
  if (action === "sync-tests") return syncTests();
  if (action === "gate") return runGate();
  if (action === "gate-debrief") return runDebriefGate();
  if (action === "gate-reception") return runReceptionGate();
  if (action === "gate-objection") return runObjectionGate();
  if (action === "smoke") return runSmoke();
  if (action === "release") return releaseAgent();
  if (action === "release-from-invocation") return releaseAgentFromInvocation(process.argv[3]);
  fail(`Unbekannte Aktion '${action}'. Erlaubt: sync-tests, gate, gate-debrief, gate-reception, gate-objection, smoke, release, release-from-invocation.`);
}

main().catch((error) => {
  console.error(`Agenten-Release fehlgeschlagen: ${shortText(error instanceof Error ? error.message : String(error))}`);
  process.exitCode = 1;
});
