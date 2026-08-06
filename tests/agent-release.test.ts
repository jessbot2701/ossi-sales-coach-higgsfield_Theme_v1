import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const elevenlabsDir = join(process.cwd(), "elevenlabs");
const registry = JSON.parse(readFileSync(join(elevenlabsDir, "tests.json"), "utf8"));
const agentConfig = JSON.parse(
  readFileSync(join(elevenlabsDir, "agent_configs/Coaching-Kaltakquise-V2.0.json"), "utf8"),
);

const requiredVariables = [
  "user_first_name",
  "training_type",
  "scenario",
  "conversation_occasion",
  "context_collection_instruction",
  "session_mode",
  "session_focus",
  "available_training_focuses",
  "global_strengths",
  "global_focus_areas",
  "training_strengths",
  "training_focus_areas",
  "recent_session_summaries",
  "current_learning_goal",
];

describe("ElevenLabs V2 release simulation suite", () => {
  it("verifies the remote prompt and the exact 25-field tier limit after every push", () => {
    const releaseScript = readFileSync(
      join(process.cwd(), "scripts/elevenlabs-agent-release.mjs"),
      "utf8",
    );
    expect(releaseScript).toContain("async function verifyPushedAgent()");
    expect(releaseScript).toContain("localKeys.length !== 25");
    expect(releaseScript).toContain("remotePrompt !== localPrompt");
    expect(releaseScript).toContain("await verifyPushedAgent()");
  });

  it("provides a focused five-run objection-handling stability gate at the release threshold", () => {
    const releaseScript = readFileSync(
      join(process.cwd(), "scripts/elevenlabs-agent-release.mjs"),
      "utf8",
    );
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    expect(releaseScript).toContain("async function runObjectionGate()");
    expect(releaseScript).toContain("TEST_CONFIGS[3]");
    expect(releaseScript).toContain('action === "gate-objection"');
    expect(releaseScript).toContain("evaluateInvocation(invocation, objectionTests, REPEAT_COUNT)");
    expect(packageJson.scripts["test:agent:objection"]).toContain("gate-objection");
  });

  it("versions exactly eight multi-turn simulation tests", () => {
    expect(registry.tests).toHaveLength(8);
    expect(new Set(registry.tests.map((test: { config: string }) => test.config)).size).toBe(8);

    for (const test of registry.tests) {
      expect(test.type).toBe("simulation");
      const config = JSON.parse(readFileSync(join(elevenlabsDir, test.config), "utf8"));
      expect(config).toMatchObject({ type: "simulation", chat_history: [] });
      expect(config.name).toMatch(/^Ossi V2 \| /);
      expect(config.success_condition.length).toBeGreaterThan(100);
      expect(config.simulation_scenario.length).toBeGreaterThan(100);
      expect(config.simulation_max_turns).toBeGreaterThanOrEqual(7);
      expect(config.simulation_max_turns).toBeLessThanOrEqual(15);
      expect(Object.keys(config.dynamic_variables).sort()).toEqual([...requiredVariables].sort());
    }
  });

  it("uses no obvious real-person or production identifiers in dynamic variables", () => {
    const serializedVariables = registry.tests
      .map((test: { config: string }) => JSON.parse(readFileSync(join(elevenlabsDir, test.config), "utf8")).dynamic_variables)
      .map(JSON.stringify)
      .join(" ");

    expect(serializedVariables).not.toMatch(/agent_|agtbrch_|agtvrsn_|@|https?:\/\/|\+\d{6,}/i);
    expect(serializedVariables).toContain("synthetisch");
  });

  it("attaches every registered remote test ID to the V2 agent after sync", () => {
    const ids = registry.tests.map((test: { id?: string }) => test.id);
    const attachedIds = agentConfig.platform_settings.testing.attached_tests.map(
      (test: { test_id: string }) => test.test_id,
    );

    if (ids.every((id: string | undefined) => typeof id === "string")) {
      expect(attachedIds).toEqual(ids);
    } else {
      expect(attachedIds).toEqual([]);
    }
  });
});
