// Dedicated real-PostgreSQL test. Creates its own cluster; never accepts a DB URL.
// npm install --prefix artifacts/package-c-2026-10-20/db-tools --ignore-scripts --no-audit --no-fund @embedded-postgres/windows-x64@17.10.0-beta.17 pg@8.23.1
// node tests/db/session-lifecycle.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const root = resolve("artifacts/package-c-2026-10-20");
const tools = join(root, "db-tools");
const require = createRequire(join(tools, "package.json"));
const { Pool } = require("pg");
const { initdb, pg_ctl } = await import(pathToFileURL(join(tools, "node_modules/@embedded-postgres/windows-x64/dist/index.js")).href);
await mkdir(root, { recursive: true });
const cluster = await mkdtemp(join(root, "postgres-"));
const data = join(cluster, "data");
const exec = (command, args) => {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true, timeout: 60_000 });
  if (result.status !== 0) throw new Error(`${command}: ${result.stderr || result.stdout || result.error}`);
};
const listener = createServer();
await new Promise((done) => listener.listen(0, "127.0.0.1", done));
const port = listener.address().port;
await new Promise((done) => listener.close(done));
let running = false;
let pool;
let checks = 0;
const check = (name) => { checks++; console.log(`PASS ${name}`); };
try {
  exec(initdb, ["-D", data, "-U", "postgres", "-A", "trust", "--encoding=UTF8", "--locale=C"]);
  exec(pg_ctl, ["-D", data, "-l", join(cluster, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"]);
  running = true;
  pool = new Pool({ host: "127.0.0.1", port, user: "postgres", database: "postgres", max: 16 });
  const query = (sql, args) => pool.query(sql, args);
  await query(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    grant usage on schema auth to anon, authenticated, service_role;
    create schema storage; create table storage.objects(id uuid, owner_id text);
    create schema cron;
    create function cron.schedule(text,text,text) returns bigint language sql as 'select 1::bigint';
  `);
  const migrations = (await readdir("supabase/migrations")).filter((file) => file.endsWith(".sql")).sort();
  const target = "20261020090942_protect_session_lifecycle.sql";
  for (const file of migrations.filter((file) => file < target)) {
    const sql = (await readFile(join("supabase/migrations", file), "utf8"))
      .replace("create extension if not exists pg_cron;", "-- pg_cron scheduling is a test stub.");
    await query(sql);
  }
  const version = (await query("select id from public.training_type_versions where is_active limit 1")).rows[0].id;
  const scenario = (await query("select s.id from public.scenarios s join public.training_type_versions v on v.training_type_id=s.training_type_id where v.id=$1 limit 1", [version])).rows[0].id;
  const user = async () => { const id = randomUUID(); await query("insert into auth.users(id) values($1)", [id]); return id; };
  const baselineUser = await user();
  const legacyInsert = () => query(`insert into public.coaching_sessions(user_id,training_type_version_id,scenario_id,consent_version,consented_at,scenario_snapshot)
    values($1,$2,$3,'test',now(),'{}') returning id`, [baselineUser, version, scenario]);
  const legacy = (await legacyInsert()).rows[0].id;
  await query("delete from public.coaching_sessions where id=$1", [legacy]);
  assert.equal((await query("select count(*)::int n from public.coaching_sessions where user_id=$1 and created_at>now()-interval '1 hour'", [baselineUser])).rows[0].n, 0);
  check("original schema reproduces Start → Delete → zero hourly count");
  await legacyInsert();
  const migration = await readFile(join("supabase/migrations", target), "utf8");
  const migrationClient = await pool.connect();
  try {
    await assert.rejects(migrationClient.query(migration), /Drain existing/);
    await migrationClient.query("rollback");
  } finally { migrationClient.release(); }
  check("migration refuses live/legacy grants without changing existing rows");
  await query("update public.coaching_sessions set status='completed',created_at=now()-interval '20 minutes' where user_id=$1", [baselineUser]);
  await query(migration);
  for (const file of migrations.filter((file) => file > target)) await query(await readFile(join("supabase/migrations", file), "utf8"));
  assert.equal((await query("select count(*)::int n from private.voice_session_attempts where user_id=$1", [baselineUser])).rows[0].n, 1);
  check("migration preserves recent historical usage");
  const service = async (sql, args) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role service_role");
      const result = await client.query(sql, args);
      await client.query("commit");
      return result.rows[0].result;
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
  };
  const reserve = (id) => service("select public.reserve_voice_session($1,$2,$3,'test','{}') result", [id, version, scenario]);
  const control = (action, id, sessionId = null, conversationId = null) =>
    service("select public.voice_session_control($1,$2,$3,$4) result", [action, id, sessionId, conversationId]);
  const finish = (conversationId, agentId) =>
    service("select public.finish_voice_conversation($1,$2) result", [conversationId, agentId]);
  const id = await user();
  const concurrent = await Promise.all(Array.from({ length: 12 }, () => reserve(id)));
  assert.equal(concurrent.filter((r) => r.code === "reserved").length, 1);
  assert.equal(concurrent.filter((r) => r.code === "session_already_open").length, 11);
  const first = concurrent.find((r) => r.code === "reserved").session_id;
  check("12 simultaneous starts admit exactly one");
  await control("fail_preparation", id, first);
  await query("delete from public.coaching_sessions where id=$1", [first]);
  for (let n = 1; n < 9; n++) {
    const r = await reserve(id);
    assert.equal(r.code, "reserved");
    await control("fail_preparation", id, r.session_id);
    await query("delete from public.coaching_sessions where id=$1", [r.session_id]);
  }
  const lastSlot = await Promise.all(Array.from({ length: 12 }, () => reserve(id)));
  assert.equal(lastSlot.filter((r) => r.code === "reserved").length, 1);
  const last = lastSlot.find((r) => r.code === "reserved").session_id;
  await control("fail_preparation", id, last);
  await query("delete from public.coaching_sessions where id=$1", [last]);
  assert.equal((await reserve(id)).code, "session_rate_limited");
  assert.equal((await query("select count(*)::int n from private.voice_session_attempts where user_id=$1", [id])).rows[0].n, 10);
  check("deletion preserves quota; concurrent last-slot requests never exceed ten");

  const owner = await user();
  const session = (await reserve(owner)).session_id;
  assert.equal((await control("issue", owner, session, "conv_owned")).code, "issued");
  const binds = await Promise.all([
    control("bind", owner, session, "conv_owned"), control("bind", owner, session, "conv_foreign"),
    control("bind", owner, session, "conv_owned"),
  ]);
  assert.equal(binds[0].code, "bound");
  assert.equal(binds[1].code, "session_conflict");
  assert.equal(binds[2].code, "bound");
  assert.equal([binds[0], binds[2]].filter((r) => r.duplicate === false).length, 1);
  check("parallel binds accept only the server-reserved ID; identical retries are idempotent");
  assert.equal((await control("bind", await user(), session, "conv_owned")).code, "not_found");
  await control("fail_preparation", owner, session);
  assert.equal((await query("select status from public.coaching_sessions where id=$1", [session])).rows[0].status, "active");
  check("foreign owner and stale preparation compensation cannot change an active session");
  await control("abort", owner, session);
  await query("delete from public.coaching_sessions where id=$1", [session]);
  assert.equal((await reserve(owner)).code, "session_already_open");
  assert.equal((await control("bind", owner, session, "conv_owned")).code, "not_found");
  const pending = await control("pending", owner);
  assert.equal((await finish("conv_owned", "agent_wrong")).code, "agent_mismatch");
  assert.equal((await finish("conv_owned", pending.agent_id)).code, "ignored");
  assert.equal((await query("select count(*)::int n from public.coaching_sessions where id=$1", [session])).rows[0].n, 0);
  assert.equal((await reserve(owner)).code, "reserved");
  check("abort/delete retains the lease; a verified late webhook closes it without restoring content");

  const replayUser = await user();
  const replaySession = (await reserve(replayUser)).session_id;
  assert.equal((await control("issue", replayUser, replaySession, "conv_owned")).code, "session_conflict");
  assert.equal((await control("pending", replayUser)).conversation_id, null);
  assert.equal((await control("issue", replayUser, replaySession, "conv_early_webhook")).code, "issued");
  const early = await control("pending", replayUser);
  assert.equal((await finish("conv_early_webhook", early.agent_id)).code, "accepted");
  assert.equal((await control("bind", replayUser, replaySession, "conv_early_webhook")).duplicate, true);
  assert.equal((await finish("conv_early_webhook", early.agent_id)).session_id, replaySession);
  assert.equal((await query("select status from public.coaching_sessions where id=$1", [replaySession])).rows[0].status, "processing");
  check("reused grants are rejected; early and repeated webhooks retain the verified mapping");

  const expiring = await user();
  const stale = (await reserve(expiring)).session_id;
  await query("update private.voice_session_attempts set created_at=now()-interval '3 minutes' where session_id=$1", [stale]);
  const replacement = await reserve(expiring);
  assert.equal(replacement.code, "reserved");
  assert.equal((await control("issue", expiring, stale, "conv_late")).code, "session_conflict");
  assert.equal((await control("pending", expiring)).session_id, replacement.session_id);
  check("expired preparation fences a late provider answer without changing its replacement");

  const racing = await user();
  const raced = (await reserve(racing)).session_id;
  await control("issue", racing, raced, "conv_racing");
  await Promise.all([control("bind", racing, raced, "conv_racing"), control("abort", racing, raced)]);
  assert.equal((await query("select status from public.coaching_sessions where id=$1", [raced])).rows[0].status, "failed");
  assert.equal((await control("bind", racing, raced, "conv_racing")).code, "session_conflict");
  assert.equal((await reserve(racing)).code, "session_already_open");
  check("concurrent abort/bind never resurrects a cancelled session or frees a live grant");

  const inactive = await user();
  await query("update public.profiles set is_active=false where id=$1", [inactive]);
  assert.equal((await reserve(inactive)).code, "user_inactive");
  check("database independently rejects an inactive user");

  for (const role of ["anon", "authenticated"]) {
    const client = await pool.connect();
    try {
      await client.query(`set role ${role}`);
      await assert.rejects(client.query("select * from private.voice_session_attempts"), /permission denied/);
      await assert.rejects(client.query("select public.reserve_voice_session($1,$2,$3,'test','{}')", [id, version, scenario]), /permission denied/);
      await assert.rejects(client.query("select public.voice_session_control('pending',$1)", [id]), /permission denied/);
      await assert.rejects(client.query("select public.finish_voice_conversation('conv_owned','agent_fake')"), /permission denied/);
    } finally { await client.query("reset role"); client.release(); }
  }
  check("anon/authenticated cannot read the ledger or invoke privileged lifecycle functions");
  const client = await pool.connect();
  try {
    await client.query("set role authenticated");
    await client.query("select set_config('request.jwt.claim.sub',$1,false)", [racing]);
    const visible = (await client.query("select id from public.coaching_sessions")).rows.map((r) => r.id);
    assert.deepEqual(visible, [raced]);
  } finally { await client.query("reset role"); client.release(); }
  check("real RLS exposes only the authenticated user's own sessions");
  console.log(`${checks} PostgreSQL behavior checks passed; ${cluster}`);
} finally {
  if (pool) await pool.end();
  if (running) exec(pg_ctl, ["-D", data, "-m", "fast", "-w", "stop"]);
}
