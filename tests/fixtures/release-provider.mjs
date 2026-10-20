// Loaded only by the local subprocess tests. No network or CLI fallback exists.
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const write = (path, value) => writeFileSync(join(root, path), JSON.stringify(value));
const configPath = "elevenlabs/agent_configs/Coaching-Kaltakquise-V2.0.json";
const scenario = process.env.RELEASE_TEST_SCENARIO;
const observations = { requests: [], pushes: [] };
const observe = () => write("observations.json", observations);

childProcess.spawnSync = (_command, _args, options) => {
  const registry = JSON.parse(readFileSync(join(options.cwd, "agents.json"), "utf8"));
  const config = JSON.parse(readFileSync(join(options.cwd, registry.agents[0].config), "utf8"));
  observations.pushes.push({ registry, config });
  write("remote-agent.json", config);
  observe();
  return { status: 0 };
};
syncBuiltinESMExports();

globalThis.fetch = async (url, options = {}) => {
  const path = new URL(url).pathname;
  const body = options.body ? JSON.parse(options.body) : undefined;
  observations.requests.push({ path, method: options.method, body });
  observe();
  let result;
  if (path.includes("/agent-testing/") && options.method === "GET") {
    result = read("remote-tests.json")[path.split("/").at(-1)];
    if (scenario === "test-drift") result.success_condition = "Remote drift";
  } else if (path.endsWith("/run-tests") && options.method === "POST") {
    const id = body.repeat_count === 5 ? "suite_gate" : "suite_smoke";
    result = { id };
    write(`${id}.json`, {
      id, branch_id: body.branch_id, repeat_count: body.repeat_count, bucketing_status: "completed",
      test_runs: body.tests.flatMap((test) => Array.from({ length: body.repeat_count }, (_, i) => ({
        test_id: test.test_id, test_run_id: `${test.test_id}_${i}`,
        test_invocation_id: id, agent_id: path.split("/")[4], branch_id: body.branch_id,
        test_info: read("remote-tests.json")[test.test_id],
        status: scenario === "gate-failed" ? "failed" : "passed",
      }))),
    });
  } else if (path.includes("/test-invocations/") && options.method === "GET") {
    result = read(`${path.split("/").at(-1)}.json`);
    if (scenario === "mutate") {
      const config = read(configPath);
      config.conversation_config.agent.prompt.prompt = "Untested candidate B";
      write(configPath, config);
      const registry = read("elevenlabs/tests.json");
      const test = read(`elevenlabs/${registry.tests[0].config}`);
      test.success_condition = "Untested test B";
      write(`elevenlabs/${registry.tests[0].config}`, test);
    }
    if (scenario === "wrong-branch") result.branch_id = "wrong";
    if (scenario === "wrong-repeat") result.repeat_count = 1;
    if (scenario === "missing-run") result.test_runs.pop();
    if (scenario === "extra-run") result.test_runs.push({ test_id: "test_unknown", status: "passed" });
    if (scenario === "wrong-id") result.id = "suite_other";
    if (scenario === "missing-definition") delete result.test_runs[0].test_info;
    if (scenario === "run-test-drift") result.test_runs[0].test_info.success_condition = "Changed during test";
    if (scenario === "duplicate-run") result.test_runs[1].test_run_id = result.test_runs[0].test_run_id;
    if (scenario === "interrupted") throw new Error("Simulated interruption while polling");
  } else if (path.includes("/agents/") && options.method === "GET") {
    result = read("remote-agent.json");
    if (scenario === "remote-drift") result.platform_settings.privacy.record_voice = true;
    if (scenario === "remote-extra-field") result.platform_settings.privacy.unreviewed_default = true;
    if (scenario === "remote-normalized") {
      delete result.conversation_config.agent.prompt.tools;
      result = { agent_id: "provider-metadata", ...Object.fromEntries(Object.entries(result).reverse()) };
    }
  } else {
    throw new Error(`Forbidden request in local release test: ${options.method} ${path}`);
  }
  for (const run of result?.test_runs ?? []) {
    if (run.test_info) delete run.test_info.name;
  }
  return new Response(JSON.stringify(result), { status: 200 });
};
