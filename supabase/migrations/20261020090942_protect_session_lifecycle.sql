begin;

-- Deployment precondition: drain old sessions and let reusable legacy URLs expire.
-- Do not silently reinterpret a client-supplied legacy ID as a verified new grant.
do $$
begin
  if exists (select 1 from public.coaching_sessions
    where status in ('created', 'active') or created_at > now() - interval '16 minutes') then
    raise exception 'Drain existing voice sessions and wait at least 16 minutes after the last start before migrating';
  end if;
end $$;

create table private.voice_session_attempts (
  session_id uuid primary key, -- deliberately no FK to deletable coaching content
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_id text not null,
  created_at timestamptz not null default clock_timestamp(),
  conversation_id text unique,
  issued_at timestamptz,
  bound_at timestamptz,
  cancelled_at timestamptz,
  closed_at timestamptz
);
alter table private.voice_session_attempts enable row level security;
revoke all on private.voice_session_attempts from public, anon, authenticated;
create index voice_attempts_user_window_idx on private.voice_session_attempts(user_id, created_at);
create unique index voice_attempts_one_open_idx on private.voice_session_attempts(user_id) where closed_at is null;

-- Preserve the current hourly usage when installing the new counter.
insert into private.voice_session_attempts(session_id, user_id, agent_id, created_at, closed_at)
select s.id, s.user_id, v.elevenlabs_agent_id, s.created_at, clock_timestamp()
from public.coaching_sessions s join public.training_type_versions v on v.id = s.training_type_version_id
where s.created_at >= now() - interval '24 hours';

create function private.reserve_voice_session(
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
    and closed_at is not null and created_at < clock_timestamp() - interval '24 hours';
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

create function private.voice_session_control(
  p_action text, p_user_id uuid, p_session_id uuid default null, p_conversation_id text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a private.voice_session_attempts%rowtype;
  s public.coaching_sessions%rowtype;
  affected integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 731));
  if p_action = 'pending' then
    select * into a from private.voice_session_attempts where user_id = p_user_id and closed_at is null;
    return case when found then to_jsonb(a) else null end;
  end if;
  select * into a from private.voice_session_attempts where session_id = p_session_id and user_id = p_user_id for update;
  if not found then return jsonb_build_object('code', 'not_found'); end if;
  select * into s from public.coaching_sessions where id = p_session_id and user_id = p_user_id for update;

  if p_action = 'issue' then
    if a.closed_at is not null or a.cancelled_at is not null or a.conversation_id is not null
      or a.created_at < clock_timestamp() - interval '2 minutes'
      or s.id is null or s.status <> 'created' or p_conversation_id is null then
      return jsonb_build_object('code', 'session_conflict');
    end if;
    update private.voice_session_attempts set conversation_id = p_conversation_id, issued_at = clock_timestamp()
    where session_id = p_session_id;
    update public.coaching_sessions set elevenlabs_conversation_id = p_conversation_id where id = p_session_id;
    return jsonb_build_object('code', 'issued');
  elsif p_action = 'fail_preparation' then
    if a.conversation_id is null and a.closed_at is null then
      update private.voice_session_attempts set closed_at = clock_timestamp() where session_id = p_session_id;
      update public.coaching_sessions set status = 'failed', processing_error = 'Voice-Vorbereitung fehlgeschlagen.'
      where id = p_session_id and status = 'created';
    end if;
    return jsonb_build_object('code', 'compensated');
  elsif p_action = 'bind' then
    if s.id is null then return jsonb_build_object('code', 'not_found'); end if;
    if a.conversation_id is distinct from p_conversation_id or p_conversation_id is null
      or s.elevenlabs_conversation_id is distinct from p_conversation_id or a.cancelled_at is not null then
      return jsonb_build_object('code', 'session_conflict');
    end if;
    if s.status in ('active', 'processing', 'completed') then
      return jsonb_build_object('code', 'bound', 'duplicate', true);
    end if;
    if a.closed_at is not null then return jsonb_build_object('code', 'session_conflict'); end if;
    update public.coaching_sessions set status = 'active', started_at = clock_timestamp()
    where id = p_session_id and status = 'created' and elevenlabs_conversation_id = p_conversation_id;
    get diagnostics affected = row_count;
    if affected <> 1 then return jsonb_build_object('code', 'session_conflict'); end if;
    update private.voice_session_attempts set bound_at = clock_timestamp() where session_id = p_session_id;
    return jsonb_build_object('code', 'bound', 'duplicate', false);
  elsif p_action = 'abort' then
    if s.status in ('processing', 'completed') then return jsonb_build_object('code', 'finished'); end if;
    update private.voice_session_attempts set cancelled_at = coalesce(cancelled_at, clock_timestamp()),
      closed_at = case when conversation_id is null then coalesce(closed_at, clock_timestamp()) else closed_at end
    where session_id = p_session_id;
    update public.coaching_sessions set status = 'failed', processing_error = 'Voice-Start oder Verbindung abgebrochen.'
    where id = p_session_id and status in ('created', 'active');
    return jsonb_build_object('code', 'aborted');
  elsif p_action = 'settle' then
    -- Only called by trusted server code after a provider-confirmed end/expiry.
    if a.conversation_id is distinct from p_conversation_id or p_conversation_id is null then
      return jsonb_build_object('code', 'session_conflict');
    end if;
    update private.voice_session_attempts set closed_at = coalesce(closed_at, clock_timestamp()) where session_id = p_session_id;
    update public.coaching_sessions set status = 'failed', processing_error = 'Verbindung beendet; Auswertung gegebenenfalls noch ausstehend.'
    where id = p_session_id and status in ('created', 'active');
    return jsonb_build_object('code', 'settled');
  end if;
  raise exception 'Unsupported voice session action';
exception when unique_violation then
  return jsonb_build_object('code', 'session_conflict');
end $$;

create function private.finish_voice_conversation(p_conversation_id text, p_agent_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a private.voice_session_attempts%rowtype;
begin
  select * into a from private.voice_session_attempts where conversation_id = p_conversation_id;
  if not found then return jsonb_build_object('code', 'ignored'); end if;
  if a.agent_id <> p_agent_id then return jsonb_build_object('code', 'agent_mismatch'); end if;
  perform pg_advisory_xact_lock(hashtextextended(a.user_id::text, 731));
  select * into a from private.voice_session_attempts where session_id = a.session_id for update;
  update private.voice_session_attempts set closed_at = coalesce(closed_at, clock_timestamp()) where session_id = a.session_id;
  if a.cancelled_at is not null or not exists(select 1 from public.coaching_sessions where id = a.session_id) then
    return jsonb_build_object('code', 'ignored');
  end if;
  update public.coaching_sessions set status = 'processing', processing_error = null
  where id = a.session_id and status in ('created', 'active', 'failed');
  return jsonb_build_object('code', 'accepted', 'session_id', a.session_id);
end $$;

-- Exposed wrappers are invoker-only. Only the server service role can invoke them.
create function public.reserve_voice_session(p_user_id uuid, p_version_id uuid, p_scenario_id uuid, p_consent_version text, p_snapshot jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.reserve_voice_session(p_user_id, p_version_id, p_scenario_id, p_consent_version, p_snapshot);
$$;
create function public.voice_session_control(p_action text, p_user_id uuid, p_session_id uuid default null, p_conversation_id text default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.voice_session_control(p_action, p_user_id, p_session_id, p_conversation_id);
$$;
create function public.finish_voice_conversation(p_conversation_id text, p_agent_id text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.finish_voice_conversation(p_conversation_id, p_agent_id);
$$;
revoke all on function private.reserve_voice_session(uuid,uuid,uuid,text,jsonb), public.reserve_voice_session(uuid,uuid,uuid,text,jsonb),
  private.voice_session_control(text,uuid,uuid,text), public.voice_session_control(text,uuid,uuid,text),
  private.finish_voice_conversation(text,text), public.finish_voice_conversation(text,text) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.reserve_voice_session(uuid,uuid,uuid,text,jsonb), public.reserve_voice_session(uuid,uuid,uuid,text,jsonb),
  private.voice_session_control(text,uuid,uuid,text), public.voice_session_control(text,uuid,uuid,text),
  private.finish_voice_conversation(text,text), public.finish_voice_conversation(text,text) to service_role;
commit;
