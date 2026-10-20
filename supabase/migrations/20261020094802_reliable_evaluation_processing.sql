begin;

-- Deploy with writers drained: the old untokened receipt API must not coexist.
drop function public.claim_webhook_receipt(text,text);
drop function public.finish_webhook_receipt(text,text,text);
alter table private.webhook_receipts enable row level security;
revoke all on private.webhook_receipts from service_role, anon, authenticated;
alter table private.webhook_receipts
  add column attempt_token uuid,
  add column lease_until timestamptz,
  add column attempt_count integer not null default 0,
  add column failure_count integer not null default 0;
create index webhook_receipts_pending_idx on private.webhook_receipts(lease_until) where status = 'processing';

alter table public.coaching_sessions
  add column evaluation_revision bigint not null default 0,
  add column recovery_plan_id uuid;
create function private.bump_session_revision() returns trigger
language plpgsql set search_path = '' as $$
begin new.evaluation_revision := old.evaluation_revision + 1; return new; end $$;
create trigger session_revision before update on public.coaching_sessions
for each row execute function private.bump_session_revision();
create function private.bump_evaluation_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.coaching_sessions set evaluation_revision = evaluation_revision + 1
  where id = case when tg_op = 'DELETE' then old.session_id else new.session_id end;
  return null;
end $$;
create trigger evaluation_revision after insert or update or delete on public.session_evaluations
for each row execute function private.bump_evaluation_revision();

create function private.claim_evaluation(p_conversation_id text, p_payload_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r private.webhook_receipts%rowtype; token uuid := gen_random_uuid();
begin
  insert into private.webhook_receipts(conversation_id,payload_hash,status)
  values(p_conversation_id,p_payload_hash,'failed') on conflict do nothing;
  select * into r from private.webhook_receipts where conversation_id=p_conversation_id for update;
  -- Legacy terminal receipts remain terminal; legacy unfinished receipts can migrate
  -- from a raw-body hash to the normalized provider-data hash once.
  if r.status in ('processed','ignored') then
    if r.attempt_token is not null and r.payload_hash <> p_payload_hash then
      return jsonb_build_object('code','conflict');
    end if;
    return jsonb_build_object('code','duplicate');
  end if;
  if r.attempt_token is not null and r.payload_hash <> p_payload_hash then
    return jsonb_build_object('code','conflict');
  end if;
  if r.status='processing' and r.lease_until > clock_timestamp() then
    return jsonb_build_object('code','busy');
  end if;
  update private.webhook_receipts set status='processing', payload_hash=p_payload_hash,
    attempt_token=token, lease_until=clock_timestamp()+interval '2 minutes',
    attempt_count=attempt_count+1, error=null, processed_at=null
  where conversation_id=p_conversation_id;
  return jsonb_build_object('code','claimed','token',token,'received_at',r.received_at);
end $$;

-- All rows stay inside PostgreSQL: no PostgREST row limit, deterministic ties.
create function private.competency_aggregates(p_user_id uuid, p_type_id uuid default null)
returns table(competency_id uuid, name text, session_count integer, average_score numeric,
  latest_score numeric, trend text)
language sql stable set search_path = '' as $$
  with ranked as (
    select c.id, c.name, e.score,
      row_number() over(partition by c.id order by s.completed_at desc,s.id desc,e.criterion_id desc) n
    from public.session_evaluations e
    join public.coaching_sessions s on s.id=e.session_id
    join public.training_type_versions v on v.id=s.training_type_version_id
    join public.evaluation_criteria ec on ec.id=e.criterion_id
    join public.competencies c on c.id=ec.competency_id
    where s.user_id=p_user_id and s.status='completed' and s.completed_at is not null
      and e.score is not null and (p_type_id is null or v.training_type_id=p_type_id)
  )
  select id,name,count(*)::integer,round(avg(score),2),max(score) filter(where n=1)::numeric,
    case when count(*)<6 then 'insufficient_data'
      when avg(score) filter(where n<=3)-avg(score) filter(where n between 4 and 6)>=0.35 then 'up'
      when avg(score) filter(where n between 4 and 6)-avg(score) filter(where n<=3)>=0.35 then 'down'
      else 'stable' end
  from ranked group by id,name;
$$;

create function private.rebuild_learning_profiles(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare scope record; src uuid; goal text; strong jsonb; focus jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,731));
  delete from public.user_competency_progress where user_id=p_user_id;
  insert into public.user_competency_progress(user_id,competency_id,session_count,average_score,latest_score,trend)
  select p_user_id,competency_id,session_count,average_score,latest_score,trend
  from private.competency_aggregates(p_user_id);
  delete from public.learning_profiles where user_id=p_user_id;
  for scope in
    select null::uuid id union
    select distinct v.training_type_id from public.coaching_sessions s
    join public.training_type_versions v on v.id=s.training_type_version_id
    where s.user_id=p_user_id and s.status='completed'
  loop
    select s.id, case when scope.id is not null then nullif(trim(s.next_learning_goal),'') end
    into src,goal from public.coaching_sessions s
    join public.training_type_versions v on v.id=s.training_type_version_id
    where s.user_id=p_user_id and s.status='completed' and s.completed_at is not null
      and (scope.id is null or v.training_type_id=scope.id)
      and exists(select 1 from public.session_evaluations e where e.session_id=s.id and e.score is not null)
    order by s.completed_at desc,s.id desc limit 1;
    if src is null then continue; end if;
    select coalesce(jsonb_agg(name order by average_score desc,competency_id)
      filter(where session_count>=3 and average_score>=4),'[]'::jsonb)
    into strong from private.competency_aggregates(p_user_id,scope.id);
    select jsonb_agg(name order by latest_score,average_score,competency_id)
    into focus from (select * from private.competency_aggregates(p_user_id,scope.id)
      order by latest_score,average_score,competency_id limit 2) a;
    insert into public.learning_profiles(user_id,training_type_id,strengths,focus_areas,next_learning_goal,source_session_id)
    values(p_user_id,scope.id,strong,focus,
      coalesce(goal,(focus->>0)||' in der nächsten Session gezielt trainieren.'),src);
  end loop;
end $$;

create function private.read_evaluation_context(p_conversation_id text,p_agent_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a private.voice_session_attempts%rowtype; s public.coaching_sessions%rowtype; t uuid;
begin
  select * into a from private.voice_session_attempts where conversation_id=p_conversation_id;
  if not found then return jsonb_build_object('code','ignored'); end if;
  if a.agent_id<>p_agent_id then return jsonb_build_object('code','agent_mismatch'); end if;
  select * into s from public.coaching_sessions where id=a.session_id;
  if not found or a.cancelled_at is not null then return jsonb_build_object('code','ignored'); end if;
  select training_type_id into t from public.training_type_versions where id=s.training_type_version_id;
  return jsonb_build_object('code','accepted','session',to_jsonb(s),'training_type_id',t,
    'received_at',(select received_at from private.webhook_receipts where conversation_id=p_conversation_id));
end $$;

create function private.complete_evaluation(p_conversation_id text,p_token uuid,p_agent_id text,
  p_expected_revision bigint,p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r private.webhook_receipts%rowtype; a private.voice_session_attempts%rowtype;
  s public.coaching_sessions%rowtype; type_id uuid; outcome text := 'processed';
begin
  select * into a from private.voice_session_attempts where conversation_id=p_conversation_id;
  if a.user_id is not null then perform pg_advisory_xact_lock(hashtextextended(a.user_id::text,731)); end if;
  select * into r from private.webhook_receipts where conversation_id=p_conversation_id for update;
  if r.attempt_token is distinct from p_token or p_token is null or r.status<>'processing'
    or r.lease_until<=clock_timestamp() then return jsonb_build_object('code','stale'); end if;
  select * into a from private.voice_session_attempts where conversation_id=p_conversation_id for update;
  if a.agent_id is not null and a.agent_id<>p_agent_id then return jsonb_build_object('code','agent_mismatch'); end if;
  select * into s from public.coaching_sessions where id=a.session_id for update;
  if a.session_id is null or a.cancelled_at is not null or s.id is null then
    outcome := 'ignored';
  elsif s.status='completed' then
    -- Never overwrite an already committed result with a different worker/input.
    -- A legacy failed receipt may have completed content but incomplete aggregates.
    perform private.rebuild_learning_profiles(s.user_id);
    outcome := 'processed';
  else
    if s.evaluation_revision is distinct from p_expected_revision then return jsonb_build_object('code','changed'); end if;
    if p_result is null then return jsonb_build_object('code','changed'); end if;
    select training_type_id into type_id from public.training_type_versions where id=s.training_type_version_id;
    if jsonb_typeof(p_result->'evaluations') is distinct from 'array'
      or jsonb_array_length(p_result->'evaluations')<1
      or p_result->'session'->>'completed_at' is null or exists(
      select 1 from jsonb_array_elements(p_result->'evaluations') e
      where not exists(select 1 from public.evaluation_criteria c
        where c.id=(e->>'criterion_id')::uuid and c.training_type_id=type_id)
    ) then raise exception 'invalid evaluation criteria'; end if;
    delete from public.session_evaluations where session_id=s.id;
    insert into public.session_evaluations(session_id,criterion_id,score,reasoning,evidence,recommendation,
      alternative_formulation,improvement_evidence,improvement_priority)
    select s.id,e.criterion_id,e.score,e.reasoning,e.evidence,e.recommendation,
      e.alternative_formulation,e.improvement_evidence,e.improvement_priority
    from jsonb_to_recordset(p_result->'evaluations') as e(criterion_id uuid,score smallint,reasoning text,
      evidence text,recommendation text,alternative_formulation text,improvement_evidence text,improvement_priority integer);
    update public.coaching_sessions set status='completed',
      duration_seconds=(p_result->'session'->>'duration_seconds')::integer,
      title=p_result->'session'->>'title', summary=p_result->'session'->>'summary',
      strengths=p_result->'session'->'strengths', next_learning_goal=p_result->'session'->>'next_learning_goal',
      transcript=p_result->'session'->'transcript',
      completed_at=(p_result->'session'->>'completed_at')::timestamptz,
      expires_at=(p_result->'session'->>'expires_at')::timestamptz,processing_error=null
    where id=s.id;
    perform private.rebuild_learning_profiles(s.user_id);
  end if;
  update private.voice_session_attempts set closed_at=coalesce(closed_at,clock_timestamp()) where session_id=a.session_id;
  update private.webhook_receipts set status=outcome,processed_at=clock_timestamp(),lease_until=null,error=null
  where conversation_id=p_conversation_id;
  return jsonb_build_object('code',outcome,'session_id',s.id);
end $$;

create function private.fail_evaluation(p_conversation_id text,p_token uuid,p_error_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update private.webhook_receipts set status='failed',lease_until=null,
    failure_count=failure_count+1,error=left(p_error_code,80)
  where conversation_id=p_conversation_id and attempt_token=p_token and status='processing'
    and lease_until>clock_timestamp();
  return found;
end $$;

create function private.delete_session_consistently(p_session_id uuid,p_actor_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare s public.coaching_sessions%rowtype;
begin
  select * into s from public.coaching_sessions where id=p_session_id;
  if not found or (s.user_id<>p_actor_id and not exists(
    select 1 from public.app_roles where user_id=p_actor_id and role='admin')) then return 'not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(s.user_id::text,731));
  select * into s from public.coaching_sessions where id=p_session_id for update;
  if not found then return 'not_found'; end if;
  if s.status not in ('completed','failed') then return 'session_not_closed'; end if;
  delete from public.coaching_sessions where id=p_session_id;
  perform private.rebuild_learning_profiles(s.user_id);
  return 'deleted';
end $$;

create function private.apply_evaluation_recovery(p_session_id uuid,p_expected_revision bigint,
  p_plan_id uuid,p_payload_hash text,p_agent_id text,p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.coaching_sessions%rowtype; c jsonb; result jsonb;
begin
  select * into s from public.coaching_sessions where id=p_session_id;
  if not found then return jsonb_build_object('code','not_found'); end if;
  perform pg_advisory_xact_lock(hashtextextended(s.user_id::text,731));
  select * into s from public.coaching_sessions where id=p_session_id for update;
  if not found then return jsonb_build_object('code','not_found'); end if;
  if s.status='completed' then
    return jsonb_build_object('code',case when s.recovery_plan_id=p_plan_id then 'duplicate' else 'protected' end);
  end if;
  if s.status not in ('created','active','failed','processing') then return jsonb_build_object('code','protected'); end if;
  if s.evaluation_revision<>p_expected_revision then return jsonb_build_object('code','changed'); end if;
  if (private.read_evaluation_context(s.elevenlabs_conversation_id,p_agent_id)->>'code')<>'accepted'
    then return jsonb_build_object('code','unverified'); end if;
  c := private.claim_evaluation(s.elevenlabs_conversation_id,p_payload_hash);
  if c->>'code'<>'claimed' then return c; end if;
  result := private.complete_evaluation(s.elevenlabs_conversation_id,(c->>'token')::uuid,
    p_agent_id,p_expected_revision,p_result);
  if result->>'code'<>'processed' then raise exception 'Recovery commit rejected'; end if;
  update public.coaching_sessions set recovery_plan_id=p_plan_id where id=s.id;
  return result;
end $$;

create function private.evaluation_health(p_failure_threshold integer default 3)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'overdue',count(*) filter(where status='processing' and (lease_until is null or lease_until<now())),
    'repeated_failures',count(*) filter(where status='failed' and failure_count>=greatest(p_failure_threshold,1)),
    'failed',count(*) filter(where status='failed'),
    'processing',count(*) filter(where status='processing'),
    'oldest_overdue_seconds',coalesce(max(extract(epoch from now()-coalesce(lease_until,received_at)))
      filter(where status='processing' and (lease_until is null or lease_until<now())),0))
  from private.webhook_receipts;
$$;

-- Keep verified mappings while evaluation or recovery is outstanding.
create or replace function private.reserve_voice_session(
  p_user_id uuid, p_version_id uuid, p_scenario_id uuid, p_consent_version text, p_snapshot jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_session_id uuid := gen_random_uuid();
  v_agent_id text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 731));
  if not exists (select 1 from public.profiles where id = p_user_id and is_active) then
    return jsonb_build_object('code', 'user_inactive');
  end if;
  -- A reservation with no issued grant can expire safely: late issue is fenced below.
  update public.coaching_sessions s set status = 'failed', processing_error = 'Vorbereitung abgelaufen.'
  from private.voice_session_attempts a
  where a.user_id = p_user_id and a.session_id = s.id and a.closed_at is null
    and a.conversation_id is null and a.created_at < clock_timestamp() - interval '2 minutes'
    and s.status = 'created';
  update private.voice_session_attempts set closed_at = clock_timestamp()
  where user_id = p_user_id and closed_at is null and conversation_id is null
    and created_at < clock_timestamp() - interval '2 minutes';
  delete from private.voice_session_attempts where user_id = p_user_id
    and closed_at is not null and created_at < clock_timestamp() - interval '24 hours'
    and not exists(select 1 from private.webhook_receipts r
      where r.conversation_id=voice_session_attempts.conversation_id and r.status in ('processing','failed'))
    and not exists(select 1 from public.coaching_sessions s
      where s.id=voice_session_attempts.session_id and s.status<>'completed' and voice_session_attempts.cancelled_at is null);
  if exists (select 1 from private.voice_session_attempts where user_id = p_user_id and closed_at is null) then
    return jsonb_build_object('code', 'session_already_open');
  end if;
  if (select count(*) from private.voice_session_attempts
    where user_id = p_user_id and created_at >= clock_timestamp() - interval '1 hour') >= 10 then
    return jsonb_build_object('code', 'session_rate_limited');
  end if;
  select elevenlabs_agent_id into v_agent_id from public.training_type_versions
  where id = p_version_id and is_active;
  if v_agent_id is null then return jsonb_build_object('code', 'agent_unavailable'); end if;
  insert into public.coaching_sessions(id, user_id, training_type_version_id, scenario_id,
    consent_version, consented_at, scenario_snapshot)
  values(v_session_id, p_user_id, p_version_id, p_scenario_id, p_consent_version, clock_timestamp(), p_snapshot);
  insert into private.voice_session_attempts(session_id, user_id, agent_id)
  values(v_session_id, p_user_id, v_agent_id);
  return jsonb_build_object('code', 'reserved', 'session_id', v_session_id);
end $$;


-- Invoker wrappers expose only the selected API; no direct receipt privileges.
create function public.claim_evaluation(p_conversation_id text,p_payload_hash text)
returns jsonb language sql security invoker set search_path='' as $$ select private.claim_evaluation(p_conversation_id,p_payload_hash) $$;
create function public.read_evaluation_context(p_conversation_id text,p_agent_id text)
returns jsonb language sql security invoker set search_path='' as $$ select private.read_evaluation_context(p_conversation_id,p_agent_id) $$;
create function public.complete_evaluation(p_conversation_id text,p_token uuid,p_agent_id text,p_expected_revision bigint,p_result jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.complete_evaluation(p_conversation_id,p_token,p_agent_id,p_expected_revision,p_result) $$;
create function public.fail_evaluation(p_conversation_id text,p_token uuid,p_error_code text)
returns boolean language sql security invoker set search_path='' as $$ select private.fail_evaluation(p_conversation_id,p_token,p_error_code) $$;
create function public.delete_session_consistently(p_session_id uuid,p_actor_id uuid)
returns text language sql security invoker set search_path='' as $$ select private.delete_session_consistently(p_session_id,p_actor_id) $$;
create function public.rebuild_learning_profiles(p_user_id uuid)
returns void language sql security invoker set search_path='' as $$ select private.rebuild_learning_profiles(p_user_id) $$;
create function public.apply_evaluation_recovery(p_session_id uuid,p_expected_revision bigint,p_plan_id uuid,p_payload_hash text,p_agent_id text,p_result jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.apply_evaluation_recovery(p_session_id,p_expected_revision,p_plan_id,p_payload_hash,p_agent_id,p_result) $$;
create function public.evaluation_health(p_failure_threshold integer default 3)
returns jsonb language sql security invoker set search_path='' as $$ select private.evaluation_health(p_failure_threshold) $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.proname in (
      'claim_evaluation','read_evaluation_context','complete_evaluation','fail_evaluation',
      'delete_session_consistently','rebuild_learning_profiles','apply_evaluation_recovery','evaluation_health',
      'competency_aggregates','bump_evaluation_revision','bump_session_revision')
  loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
