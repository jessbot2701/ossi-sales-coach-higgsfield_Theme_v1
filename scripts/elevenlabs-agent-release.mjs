import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
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
  return {
    conversation_config: agentConfig.conversation_config,
    platform_settings: agentConfig.platform_settings,
    workflow: agentConfig.workflow,
  };
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
  let suitePassed = true;
  for (const test of tests) {
    const runs = invocation.test_runs.filter((run) => run.test_id === test.entry.id);
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
  console.log(`Starte Kandidaten-Gate: ${state.testDefinitions.length} Tests × ${REPEAT_COUNT} Läufe.`);
  const invocationId = await startInvocation(apiKey, state.testDefinitions, {
    override: candidateOverride(state.agentConfig),
    repeatCount: REPEAT_COUNT,
  });
  const invocation = await waitForInvocation(apiKey, invocationId);
  if (!evaluateInvocation(invocation, state.testDefinitions, REPEAT_COUNT)) {
    fail("V2-Agenten-Release durch unzureichende Simulationsstabilität blockiert.");
  }
  console.log("Kandidaten-Gate bestanden.");
}

async function runSmoke() {
  const state = await loadReleaseState();
  const apiKey = requireApiKey();
  const smokeTests = state.testDefinitions.filter(({ configPath }) => SMOKE_CONFIGS.has(configPath));
  console.log("Starte Post-Push-Smoke gegen die gespeicherte Remote-Konfiguration.");
  const invocationId = await startInvocation(apiKey, smokeTests, { repeatCount: 1 });
  const invocation = await waitForInvocation(apiKey, invocationId);
  if (!evaluateInvocation(invocation, smokeTests, 1, { smoke: true })) {
    fail("Post-Push-Smoke fehlgeschlagen.");
  }
  console.log("Post-Push-Smoke vollständig bestanden.");
}

function pushAgent() {
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
    cwd: ELEVENLABS_DIR,
    env: process.env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) fail(`ElevenLabs-CLI konnte nicht gestartet werden: ${result.error.message}`);
  if (result.status !== 0) fail(`ElevenLabs-CLI-Push schlug mit Exit-Code ${result.status} fehl.`);
}

async function releaseAgent() {
  await runGate();
  console.log("Gate bestanden; pushe ausschließlich den freigegebenen V2-Agenten und Branch.");
  pushAgent();
  await runSmoke();
}

async function main() {
  const action = process.argv[2] ?? "gate";
  if (action === "sync-tests") return syncTests();
  if (action === "gate") return runGate();
  if (action === "smoke") return runSmoke();
  if (action === "release") return releaseAgent();
  fail(`Unbekannte Aktion '${action}'. Erlaubt: sync-tests, gate, smoke, release.`);
}

main().catch((error) => {
  console.error(`Agenten-Release fehlgeschlagen: ${shortText(error instanceof Error ? error.message : String(error))}`);
  process.exitCode = 1;
});
