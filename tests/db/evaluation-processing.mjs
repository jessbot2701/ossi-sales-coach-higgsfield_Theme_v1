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

const root = resolve("artifacts/package-d-2026-10-20");
const tools = resolve("artifacts/package-c-2026-10-20/db-tools");
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

  const migrations = (await readdir("supabase/migrations")).filter(f => f.endsWith(".sql")).sort();
  const target = "20261020094802_reliable_evaluation_processing.sql";
  for (const f of migrations.filter(f => f < target)) await query((await readFile(join("supabase/migrations",f),"utf8")).replace("create extension if not exists pg_cron;","-- scheduler stub"));
  await query("select public.claim_webhook_receipt('conv_crashed','legacy_hash')");
  await query("update private.webhook_receipts set received_at=now()-interval '1 day' where conversation_id='conv_crashed'");
  assert.equal((await query("select public.claim_webhook_receipt('conv_crashed','legacy_hash') result")).rows[0].result,"duplicate");
  check("original receipt reproduces permanent duplicate after a crashed one-day-old claim");
  await query(await readFile(join("supabase/migrations",target),"utf8"));
  const service = async (name,args=[]) => {
    const client=await pool.connect();
    try {
      await client.query("begin"); await client.query("set local role service_role");
      const r=await client.query("select public."+name+"("+args.map((_,i)=>"$"+(i+1)).join(",")+") result",args);
      await client.query("commit"); return r.rows[0].result;
    } catch(e) {await client.query("rollback");throw e;} finally {client.release();}
  };
  const version=(await query("select id,training_type_id,elevenlabs_agent_id from public.training_type_versions where is_active limit 1")).rows[0];
  const scenario=(await query("select id from public.scenarios where training_type_id=$1 limit 1",[version.training_type_id])).rows[0].id;
  const criterion=(await query("select id,competency_id from public.evaluation_criteria where training_type_id=$1 and is_active order by sort_order limit 1",[version.training_type_id])).rows[0];
  const newUser=async()=>{const id=randomUUID();await query("insert into auth.users(id) values($1)",[id]);return id;};
  const fixture=async(owner)=>{
    owner ??= await newUser();
    const id=randomUUID(),conv="conv_"+randomUUID().replaceAll("-","");
    await query("insert into public.coaching_sessions(id,user_id,training_type_version_id,scenario_id,consent_version,consented_at,scenario_snapshot,status,elevenlabs_conversation_id) values($1,$2,$3,$4,'test',now(),'{}','failed',$5)",[id,owner,version.id,scenario,conv]);
    await query("insert into private.voice_session_attempts(session_id,user_id,agent_id,conversation_id,issued_at) values($1,$2,$3,$4,now())",[id,owner,version.elevenlabs_agent_id,conv]);
    return {id,owner,conv};
  };
  const result=(score=4)=>({evaluations:[{criterion_id:criterion.id,score,reasoning:'Begr?ndung',evidence:'Beleg'}],session:{duration_seconds:30,title:'Test',summary:'Zusammenfassung',strengths:[],next_learning_goal:'Gezielt ?ben.',transcript:[],completed_at:'2026-10-20T08:00:00Z',expires_at:'2027-10-20T08:00:00Z'}});
  const revision=async(f)=>(await query("select evaluation_revision from public.coaching_sessions where id=$1",[f.id])).rows[0]?.evaluation_revision;
  const claim=f=>service("claim_evaluation",[f.conv,'hash']);
  const complete=async(f,c,r=result())=>service("complete_evaluation",[f.conv,c.token,version.elevenlabs_agent_id,await revision(f),r]);
  const recovered=await service("claim_evaluation",['conv_crashed','normalized']);
  assert.equal(recovered.code,'claimed');
  check("legacy unfinished claim is reclaimable after migration");
  const f=await fixture();
  const claims=await Promise.all(Array.from({length:12},()=>claim(f)));
  assert.equal(claims.filter(c=>c.code==='claimed').length,1);
  assert.equal(claims.filter(c=>c.code==='busy').length,11);
  const old=claims.find(c=>c.token);
  await query("update private.webhook_receipts set lease_until=now()-interval '1 second' where conversation_id=$1",[f.conv]);
  const next=await claim(f); assert.notEqual(next.token,old.token);
  assert.equal((await complete(f,old)).code,'stale');
  assert.equal(await service('fail_evaluation',[f.conv,old.token,'old_failure']),false);
  assert.equal((await complete(f,next)).code,'processed');
  assert.equal((await claim(f)).code,'duplicate');
  assert.equal((await service('claim_evaluation',[f.conv,'altered'])).code,'conflict');
  check("concurrent claims, crash reclaim, stale success/failure fencing and idempotent completion");

  const snapshot=async(f)=> (await query(
    "select jsonb_build_object('session',(select to_jsonb(s) from public.coaching_sessions s where id=$1),'evaluations',(select jsonb_agg(to_jsonb(e) order by criterion_id) from public.session_evaluations e where session_id=$1),'progress',(select jsonb_agg(to_jsonb(p) order by competency_id) from public.user_competency_progress p where user_id=$2),'profiles',(select jsonb_agg(to_jsonb(p) order by id) from public.learning_profiles p where user_id=$2),'receipt',(select to_jsonb(r) from private.webhook_receipts r where conversation_id=$3),'attempt',(select to_jsonb(a) from private.voice_session_attempts a where session_id=$1)) result",[f.id,f.owner,f.conv])).rows[0].result;
  await query("create function private.inject_failure() returns trigger language plpgsql as $$ begin raise exception 'injected write failure'; end $$");
  for(const table of ['public.session_evaluations','public.coaching_sessions','public.user_competency_progress','public.learning_profiles','private.voice_session_attempts','private.webhook_receipts']) {
    const x=await fixture(), c=await claim(x), before=await snapshot(x);
    await query("create trigger injected before insert or update on "+table+" for each row execute function private.inject_failure()");
    try {await assert.rejects(complete(x,c),/injected write failure/);} finally {await query("drop trigger injected on "+table);}
    assert.deepEqual(await snapshot(x),before);
    assert.equal((await complete(x,c)).code,'processed');
    check("atomic rollback and same-token retry for "+table);
  }
  const owner=await newUser();
  const a=await fixture(owner); await complete(a,await claim(a));
  const b=await fixture(owner); const bClaim=await claim(b);
  await Promise.all([complete(b,bClaim,result(5)),service('delete_session_consistently',[a.id,owner])]);
  const progress=(await query("select session_count,average_score,latest_score from public.user_competency_progress where user_id=$1",[owner])).rows[0];
  assert.deepEqual(progress,{session_count:1,average_score:'5.00',latest_score:'5.00'});
  await query("create trigger injected before insert on public.learning_profiles for each row execute function private.inject_failure()");
  const beforeDelete=await snapshot(b);
  // Delete of the last session produces no insert; fail the progress DELETE instead.
  await query("drop trigger injected on public.learning_profiles");
  await query("create trigger injected before delete on public.user_competency_progress for each row execute function private.inject_failure()");
  try {await assert.rejects(service('delete_session_consistently',[b.id,owner]),/injected/);} finally {await query("drop trigger injected on public.user_competency_progress");}
  assert.deepEqual(await snapshot(b),beforeDelete);
  assert.equal(await service('delete_session_consistently',[b.id,owner]),'deleted');
  await service('rebuild_learning_profiles',[owner]);
  assert.equal((await query("select count(*)::int n from public.learning_profiles where user_id=$1",[owner])).rows[0].n,0);
  check("concurrent completion/delete, rollback on delete failure, and repair without source session");

  const parallelOwner=await newUser();
  const p1=await fixture(parallelOwner);
  await query("update private.voice_session_attempts set closed_at=now() where session_id=$1",[p1.id]);
  const p2=await fixture(parallelOwner);
  const [pc1,pc2]=await Promise.all([claim(p1),claim(p2)]);
  await Promise.all([complete(p1,pc1),complete(p2,pc2,result(5))]);
  assert.equal((await query("select session_count from public.user_competency_progress where user_id=$1",[parallelOwner])).rows[0].session_count,2);
  const same=await fixture(), sameClaim=await claim(same);
  await Promise.all([complete(same,sameClaim),service('delete_session_consistently',[same.id,same.owner])]);
  assert.equal((await query("select count(*)::int n from public.coaching_sessions where id=$1",[same.id])).rows[0].n,0);
  assert.equal((await query("select count(*)::int n from public.user_competency_progress where user_id=$1",[same.owner])).rows[0].n,0);
  check("parallel webhooks preserve both contributions; concurrent deletion never restores content");

  const legacyDone=await fixture();
  await complete(legacyDone,await claim(legacyDone));
  await query("delete from public.user_competency_progress where user_id=$1",[legacyDone.owner]);
  await query("delete from public.learning_profiles where user_id=$1",[legacyDone.owner]);
  await query("update private.webhook_receipts set status='failed',attempt_token=null where conversation_id=$1",[legacyDone.conv]);
  assert.equal((await complete(legacyDone,await claim(legacyDone),result(5))).code,'processed');
  assert.equal((await query("select latest_score from public.user_competency_progress where user_id=$1",[legacyDone.owner])).rows[0].latest_score,'4.00');
  check("legacy completed content is preserved while a retried receipt repairs incomplete aggregates");

  const typeB=randomUUID(), versionB=randomUUID(), criterionB=randomUUID();
  await query("insert into public.training_types(id,slug,name) values($1,'test_secondary','Secondary')",[typeB]);
  await query("insert into public.training_type_versions(id,training_type_id,version_number,elevenlabs_agent_id) values($1,$2,1,$3)",[versionB,typeB,version.elevenlabs_agent_id]);
  await query("insert into public.evaluation_criteria(id,training_type_id,competency_id,criteria_version,slug,name,description) values($1,$2,$3,1,'closing','Abschluss','Test')",[criterionB,typeB,criterion.competency_id]);
  const scopeOwner=await newUser();
  const scopeA=await fixture(scopeOwner); await complete(scopeA,await claim(scopeA));
  const scopeB=await fixture(scopeOwner);
  await query("update public.coaching_sessions set training_type_version_id=$2 where id=$1",[scopeB.id,versionB]);
  const bResult=result(5); bResult.evaluations[0].criterion_id=criterionB;
  await complete(scopeB,await claim(scopeB),bResult);
  assert.equal((await query("select count(*)::int n from public.learning_profiles where user_id=$1",[scopeOwner])).rows[0].n,3);
  await service('delete_session_consistently',[scopeB.id,scopeOwner]);
  const scopes=(await query("select training_type_id from public.learning_profiles where user_id=$1",[scopeOwner])).rows.map(r=>r.training_type_id);
  assert.equal(scopes.length,2); assert.ok(scopes.includes(null)); assert.ok(scopes.includes(version.training_type_id));
  check("rebuild includes all training scopes and removes only the deleted scope's contributions");

  const retained=await fixture();
  await query("update private.voice_session_attempts set created_at=now()-interval '2 days',closed_at=now() where session_id=$1",[retained.id]);
  const outstanding=await claim(retained);
  await service('reserve_voice_session',[retained.owner,version.id,scenario,'test',{}]);
  assert.equal((await service('read_evaluation_context',[retained.conv,version.elevenlabs_agent_id])).code,'accepted');
  assert.equal((await complete(retained,outstanding)).code,'processed');
  check("opportunistic usage cleanup retains verified mappings for outstanding evaluation");

  const history=await newUser();
  for(const [start,end] of [[1,999],[1000,1000],[1001,1002]]) {
    await query("insert into public.coaching_sessions(id,user_id,training_type_version_id,scenario_id,consent_version,consented_at,scenario_snapshot,status,completed_at) select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$1,$2,$3,'test',now(),'{}','completed','2026-10-20' from generate_series($4::int,$5::int) n",[history,version.id,scenario,start,end]);
    await query("insert into public.session_evaluations(session_id,criterion_id,score,reasoning,evidence) select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$1,case when n>=1000 then 5 else 4 end,'reason','quote' from generate_series($2::int,$3::int) n",[criterion.id,start,end]);
    await service('rebuild_learning_profiles',[history]);
    const row=(await query("select session_count,average_score,latest_score,trend from public.user_competency_progress where user_id=$1",[history])).rows[0];
    assert.equal(row.session_count,end);
    assert.equal(Number(row.average_score),Math.round((999*4+Math.max(0,end-999)*5)/end*100)/100);
    assert.equal(Number(row.latest_score),end>=1000?5:4);
    assert.equal(row.trend,end===1002?'up':'stable');
  }
  check("999/1000/1002 ratings: complete counts, means, latest scores and deterministic equal-time trends");

  const recovery=await fixture(); const plan=randomUUID(); const rev=await revision(recovery);
  await query("update public.coaching_sessions set summary='changed after preview' where id=$1",[recovery.id]);
  const apply=revision=>service('apply_evaluation_recovery',[recovery.id,revision,plan,'hash',version.elevenlabs_agent_id,result()]);
  assert.equal((await apply(rev)).code,'changed');
  assert.equal((await apply(await revision(recovery))).code,'processed');
  assert.equal((await apply(rev)).code,'duplicate');
  assert.equal((await service('apply_evaluation_recovery',[recovery.id,rev,randomUUID(),'hash',version.elevenlabs_agent_id,result()])).code,'protected');
  check("recovery CAS rejects changed previews and completed sessions; exact applied plan replays safely");

  const fail=await fixture();
  for(let i=0;i<3;i++){const c=await claim(fail); assert.equal(await service('fail_evaluation',[fail.conv,c.token,'synthetic_failure']),true);}
  const stuck=await fixture(); await claim(stuck);
  await query("update private.webhook_receipts set lease_until=now()-interval '1 minute' where conversation_id=$1",[stuck.conv]);
  const health=await service('evaluation_health',[3]);
  assert.ok(health.overdue>=1); assert.equal(health.repeated_failures,1);
  assert.equal((await service('evaluation_health',[4])).repeated_failures,0);
  check("overdue and repeated failure signals use configurable thresholds");
  for(const role of ['anon','authenticated']) {
    const client=await pool.connect();
    try {await client.query('set role '+role);
      await assert.rejects(client.query("select public.claim_evaluation('x','x')"),/permission denied/);
      await assert.rejects(client.query("select public.rebuild_learning_profiles($1)",[owner]),/permission denied/);
      await assert.rejects(client.query("select public.evaluation_health()"),/permission denied/);
      await assert.rejects(client.query("select * from private.webhook_receipts"),/permission denied/);
    } finally {await client.query('reset role');client.release();}
  }
  check("anon/authenticated cannot claim, rebuild, monitor or read private receipts");
  console.log(checks+" PostgreSQL behavior checks passed; "+cluster);
} finally {
  if(pool) await pool.end();
  if(running) exec(pg_ctl,["-D",data,"-m","fast","-w","stop"]);
}
