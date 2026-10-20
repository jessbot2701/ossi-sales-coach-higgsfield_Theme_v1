import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const source = process.cwd();
const configPath = "elevenlabs/agent_configs/Coaching-Kaltakquise-V2.0.json";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
let root: string;
const read = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));
const write = (path: string, value: unknown) => writeFileSync(join(root, path), JSON.stringify(value));
function run(action: string, scenario = "", invocation?: string) {
  write("observations.json", { requests: [], pushes: [] });
  const result = spawnSync(process.execPath, [
    "--import", pathToFileURL(join(source, "tests/fixtures/release-provider.mjs")).href,
    join(root, "scripts/elevenlabs-agent-release.mjs"), action, ...(invocation ? [invocation] : []),
  ], {
    cwd: root, encoding: "utf8", timeout: 15_000,
    // Never inherit local provider credentials or load env files.
    env: { NODE_ENV: "test", PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ELEVENLABS_API_KEY: "synthetic",
      RELEASE_TEST_SCENARIO: scenario },
  });
  return { ...result, observations: read("observations.json") };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ossi-release-test-"));
  const registry = JSON.parse(readFileSync(join(source, "elevenlabs/tests.json"), "utf8"));
  const files = ["scripts/elevenlabs-agent-release.mjs", "elevenlabs/agents.json",
    "elevenlabs/tests.json", configPath, ...registry.tests.map((t: { config: string }) => `elevenlabs/${t.config}`)];
  for (const path of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    copyFileSync(path === "scripts/elevenlabs-agent-release.mjs" && process.env.RELEASE_RUNNER_SOURCE
      ? process.env.RELEASE_RUNNER_SOURCE : join(source, path), join(root, path));
  }
  write("remote-agent.json", read(configPath));
  write("remote-tests.json", Object.fromEntries(registry.tests.map((t: { id: string; config: string }) => [
    t.id, read(`elevenlabs/${t.config}`),
  ])));
  write("observations.json", { requests: [], pushes: [] });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("release runner with isolated files, fake provider and intercepted CLI", () => {
  it("publishes the tested snapshot even if agent and tests change during the gate", () => {
    const expected = read(configPath);
    const result = run("release", "mutate");
    expect(result.status, result.stderr).toBe(0);
    expect(result.observations.pushes).toHaveLength(1);
    expect(hash(result.observations.pushes[0].config)).toBe(hash(expected));
    expect(read(configPath)).not.toEqual(expected);
    expect(result.observations.requests.filter((r: { body?: { repeat_count: number } }) => r.body?.repeat_count === 5))
      .toHaveLength(1);
  });

  it("resumes only the saved candidate without repeating the full gate", () => {
    const expected = read(configPath);
    expect(run("gate").status).toBe(0);
    const changed = read(configPath);
    changed.conversation_config.agent.prompt.prompt = "Candidate B after gate";
    write(configPath, changed);
    const result = run("release-from-invocation", "", "suite_gate");
    expect(result.status, result.stderr).toBe(0);
    expect(hash(result.observations.pushes[0].config)).toBe(hash(expected));
    expect(result.observations.requests.filter((r: { body?: { repeat_count: number } }) => r.body?.repeat_count === 5))
      .toHaveLength(0);
  });

  it("rejects an old invocation without a snapshot before any provider call or push", () => {
    const registry = read("elevenlabs/tests.json");
    write("suite_old.json", { id: "suite_old", branch_id: read("elevenlabs/agents.json").agents[0].branch_id,
      repeat_count: 5, test_runs: registry.tests.flatMap((t: { id: string }) =>
        Array.from({ length: 5 }, () => ({ test_id: t.id, status: "passed" }))) });
    const result = run("release-from-invocation", "", "suite_old");
    expect(result.status).toBe(1);
    expect(result.observations).toEqual({ requests: [], pushes: [] });
  });

  it.each(["wrong-branch", "wrong-repeat", "missing-run", "extra-run", "wrong-id", "gate-failed", "test-drift",
    "missing-definition", "run-test-drift", "duplicate-run"])(
    "blocks a release for %s", (scenario) => {
      const result = run("release", scenario);
      expect(result.status).toBe(1);
      expect(result.observations.pushes).toHaveLength(0);
    },
  );

  it("resumes an interrupted poll using the binding written before polling", () => {
    expect(run("gate", "interrupted").status).toBe(1);
    const result = run("release-from-invocation", "", "suite_gate");
    expect(result.status, result.stderr).toBe(0);
    expect(result.observations.pushes).toHaveLength(1);
    expect(result.observations.requests.filter((r: { body?: { repeat_count: number } }) => r.body?.repeat_count === 5))
      .toHaveLength(0);
  });

  it.each(["gate-debrief", "smoke"])("does not accept %s as a full release gate", (action) => {
    expect(run(action).status).toBe(0);
    const result = run("release-from-invocation", "", action === "smoke" ? "suite_smoke" : "suite_gate");
    expect(result.status).toBe(1);
    expect(result.observations).toEqual({ requests: [], pushes: [] });
  });

  it("rejects a receipt assigned to a different invocation", () => {
    expect(run("gate").status).toBe(0);
    const path = "artifacts/test-results/release-snapshots/suite_gate.json";
    const receipt = read(path);
    receipt.invocationId = "suite_other";
    write(path, receipt);
    const result = run("release-from-invocation", "", "suite_gate");
    expect(result.status).toBe(1);
    expect(result.observations).toEqual({ requests: [], pushes: [] });
  });

  it("detects remote differences beyond prompt and collection and does not run smokes", () => {
    const result = run("release", "remote-drift");
    expect(result.status).toBe(1);
    expect(result.observations.pushes).toHaveLength(1);
    expect(result.observations.requests.filter((r: { body?: { repeat_count: number } }) => r.body?.repeat_count === 1))
      .toHaveLength(0);
    expect(read("artifacts/test-results/release-snapshots/suite_gate-published.json"))
      .toMatchObject({ status: "failed", remoteVerified: false, invocationId: "suite_gate" });
  });

  it("accepts only the documented remote normalizations", () => {
    expect(run("release", "remote-normalized").status).toBe(0);
  });

  it("fails closed for an undocumented extra setting inside the configuration", () => {
    expect(run("release", "remote-extra-field").status).toBe(1);
  });

  it("rejects a tampered snapshot before calling the provider", () => {
    expect(run("gate").status).toBe(0);
    const receipt = read("artifacts/test-results/release-snapshots/suite_gate.json");
    const path = `artifacts/test-results/release-snapshots/${receipt.snapshotHash}.json`;
    const snapshot = read(path);
    snapshot.agentConfig.tags = ["tampered"];
    write(path, snapshot);
    const result = run("release-from-invocation", "", "suite_gate");
    expect(result.status).toBe(1);
    expect(result.observations).toEqual({ requests: [], pushes: [] });
  });

  it("records hash, full gate results, publication and smoke together", () => {
    expect(run("release").status).toBe(0);
    const directory = "artifacts/test-results/release-snapshots";
    const files = readdirSync(join(root, directory));
    const publication = read(`${directory}/${files.find((file) => file.endsWith("-published.json"))}`);
    expect(publication).toMatchObject({
      invocationId: "suite_gate", smokeInvocationId: "suite_smoke", remoteVerified: true,
      snapshotHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(read(`${directory}/suite_gate-result.json`)).toMatchObject({
      snapshotHash: publication.snapshotHash, passed: true, invocation: { id: "suite_gate" },
    });
  });
});
