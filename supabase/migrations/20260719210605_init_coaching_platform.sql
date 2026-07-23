create extension if not exists pgcrypto;
create extension if not exists pg_cron;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  is_active boolean not null default true,
  coaching_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(display_name) <= 120),
  constraint profiles_preferences_object check (jsonb_typeof(coaching_preferences) = 'object')
);

create table public.app_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user',
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null,
  constraint app_roles_valid_role check (role in ('user', 'admin'))
);

create table public.training_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  is_active boolean not null default true,
  display jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_types_slug_format check (slug ~ '^[a-z][a-z0-9_]*$'),
  constraint training_types_display_object check (jsonb_typeof(display) = 'object')
);

create table public.training_type_versions (
  id uuid primary key default gen_random_uuid(),
  training_type_id uuid not null references public.training_types(id) on delete restrict,
  version_number integer not null,
  elevenlabs_agent_id text not null,
  elevenlabs_agent_version text,
  elevenlabs_branch_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint training_type_versions_positive check (version_number > 0),
  constraint training_type_versions_agent_format check (elevenlabs_agent_id ~ '^agent_[A-Za-z0-9]+$'),
  unique (training_type_id, version_number)
);

create unique index training_type_versions_one_active_idx
  on public.training_type_versions(training_type_id) where is_active;

create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  training_type_id uuid not null references public.training_types(id) on delete restrict,
  slug text not null,
  title text not null,
  description text not null default '',
  agent_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scenarios_slug_format check (slug ~ '^[a-z][a-z0-9_]*$'),
  constraint scenarios_agent_config_object check (jsonb_typeof(agent_config) = 'object'),
  unique (training_type_id, slug)
);

create table public.competencies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  constraint competencies_slug_format check (slug ~ '^[a-z][a-z0-9_]*$')
);

create table public.evaluation_criteria (
  id uuid primary key default gen_random_uuid(),
  training_type_id uuid not null references public.training_types(id) on delete restrict,
  competency_id uuid not null references public.competencies(id) on delete restrict,
  criteria_version integer not null,
  slug text not null,
  name text not null,
  description text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint evaluation_criteria_version_positive check (criteria_version > 0),
  constraint evaluation_criteria_slug_format check (slug ~ '^[a-z][a-z0-9_]*$'),
  unique (training_type_id, criteria_version, slug)
);

create table public.coaching_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  training_type_version_id uuid not null references public.training_type_versions(id) on delete restrict,
  scenario_id uuid not null references public.scenarios(id) on delete restrict,
  elevenlabs_conversation_id text unique,
  status text not null default 'created',
  consent_version text not null,
  consented_at timestamptz not null,
  scenario_snapshot jsonb not null,
  duration_seconds integer,
  title text,
  summary text,
  transcript jsonb,
  expires_at timestamptz not null default (now() + interval '12 months'),
  transcript_deleted_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint coaching_sessions_status check (status in ('created', 'active', 'processing', 'completed', 'failed')),
  constraint coaching_sessions_duration check (duration_seconds is null or duration_seconds >= 0),
  constraint coaching_sessions_snapshot_object check (jsonb_typeof(scenario_snapshot) = 'object'),
  constraint coaching_sessions_transcript_array check (transcript is null or jsonb_typeof(transcript) = 'array'),
  constraint coaching_sessions_consent_present check (char_length(trim(consent_version)) > 0)
);

create table public.session_evaluations (
  session_id uuid not null references public.coaching_sessions(id) on delete cascade,
  criterion_id uuid not null references public.evaluation_criteria(id) on delete restrict,
  score smallint,
  reasoning text,
  evidence text,
  recommendation text,
  created_at timestamptz not null default now(),
  primary key (session_id, criterion_id),
  constraint session_evaluations_score_range check (score is null or score between 1 and 5)
);

create table public.user_competency_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  competency_id uuid not null references public.competencies(id) on delete cascade,
  session_count integer not null default 0,
  average_score numeric(3,2),
  latest_score numeric(3,2),
  trend text not null default 'stable',
  updated_at timestamptz not null default now(),
  primary key (user_id, competency_id),
  constraint competency_progress_count check (session_count >= 0),
  constraint competency_progress_average check (average_score is null or average_score between 1 and 5),
  constraint competency_progress_latest check (latest_score is null or latest_score between 1 and 5),
  constraint competency_progress_trend check (trend in ('up', 'stable', 'down', 'insufficient_data'))
);

create table public.learning_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  training_type_id uuid references public.training_types(id) on delete cascade,
  strengths jsonb not null default '[]'::jsonb,
  focus_areas jsonb not null default '[]'::jsonb,
  next_learning_goal text,
  source_session_id uuid references public.coaching_sessions(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint learning_profiles_strengths_array check (jsonb_typeof(strengths) = 'array'),
  constraint learning_profiles_focus_array check (jsonb_typeof(focus_areas) = 'array')
);

create unique index learning_profiles_scope_idx
  on public.learning_profiles(user_id, coalesce(training_type_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table private.webhook_receipts (
  conversation_id text primary key,
  payload_hash text not null,
  status text not null default 'processing',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  constraint webhook_receipts_status check (status in ('processing', 'processed', 'failed', 'ignored'))
);

create index coaching_sessions_user_created_idx on public.coaching_sessions(user_id, created_at desc);
create index coaching_sessions_expiry_idx on public.coaching_sessions(expires_at) where transcript is not null;
create index session_evaluations_criterion_idx on public.session_evaluations(criterion_id);
create index evaluation_criteria_training_idx on public.evaluation_criteria(training_type_id, criteria_version, sort_order);

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_roles
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and is_active
  );
$$;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'name', ''), 120));
  insert into public.app_roles (user_id, role) values (new.id, 'user');
  return new;
end;
$$;

create or replace function private.purge_expired_transcripts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  update public.coaching_sessions
  set transcript = null, transcript_deleted_at = now()
  where transcript is not null and expires_at <= now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function private.is_admin() from public, anon, authenticated;
revoke all on function private.is_active_user() from public, anon, authenticated;
revoke all on function private.purge_expired_transcripts() from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_active_user() to authenticated;

create or replace function public.claim_webhook_receipt(receipt_conversation_id text, receipt_payload_hash text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing private.webhook_receipts%rowtype;
begin
  insert into private.webhook_receipts (conversation_id, payload_hash)
  values (receipt_conversation_id, receipt_payload_hash)
  on conflict (conversation_id) do nothing;

  if found then return 'claimed'; end if;
  select * into existing from private.webhook_receipts where conversation_id = receipt_conversation_id for update;
  if existing.payload_hash <> receipt_payload_hash then return 'conflict'; end if;
  if existing.status in ('processed', 'ignored', 'processing') then return 'duplicate'; end if;
  update private.webhook_receipts set status = 'processing', error = null
  where conversation_id = receipt_conversation_id;
  return 'claimed';
end;
$$;

create or replace function public.finish_webhook_receipt(receipt_conversation_id text, receipt_status text, receipt_error text default null)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if receipt_status not in ('processed', 'failed', 'ignored') then raise exception 'invalid receipt status'; end if;
  update private.webhook_receipts
  set status = receipt_status,
      processed_at = case when receipt_status in ('processed', 'ignored') then now() else null end,
      error = receipt_error
  where conversation_id = receipt_conversation_id;
end;
$$;

revoke all on function public.claim_webhook_receipt(text, text) from public, anon, authenticated;
revoke all on function public.finish_webhook_receipt(text, text, text) from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update on private.webhook_receipts to service_role;
grant execute on function public.claim_webhook_receipt(text, text) to service_role;
grant execute on function public.finish_webhook_receipt(text, text, text) to service_role;

create trigger profiles_updated_at before update on public.profiles
for each row execute function private.set_updated_at();
create trigger training_types_updated_at before update on public.training_types
for each row execute function private.set_updated_at();
create trigger scenarios_updated_at before update on public.scenarios
for each row execute function private.set_updated_at();

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.app_roles enable row level security;
alter table public.training_types enable row level security;
alter table public.training_type_versions enable row level security;
alter table public.scenarios enable row level security;
alter table public.competencies enable row level security;
alter table public.evaluation_criteria enable row level security;
alter table public.coaching_sessions enable row level security;
alter table public.session_evaluations enable row level security;
alter table public.user_competency_progress enable row level security;
alter table public.learning_profiles enable row level security;
alter table private.webhook_receipts enable row level security;

create policy profiles_read_self_or_admin on public.profiles for select to authenticated
using (id = (select auth.uid()) or private.is_admin());
create policy profiles_update_self on public.profiles for update to authenticated
using (id = (select auth.uid()) and private.is_active_user())
with check (id = (select auth.uid()) and private.is_active_user());

create policy app_roles_read_self_or_admin on public.app_roles for select to authenticated
using (user_id = (select auth.uid()) or private.is_admin());

create policy training_types_read_active_or_admin on public.training_types for select to authenticated
using (is_active or private.is_admin());
create policy training_versions_read_active_or_admin on public.training_type_versions for select to authenticated
using (is_active or private.is_admin());
create policy scenarios_read_active_or_admin on public.scenarios for select to authenticated
using (is_active or private.is_admin());
create policy competencies_read_all on public.competencies for select to authenticated using (true);
create policy criteria_read_active_or_admin on public.evaluation_criteria for select to authenticated
using (is_active or private.is_admin());

create policy sessions_read_own_or_admin on public.coaching_sessions for select to authenticated
using (user_id = (select auth.uid()) or private.is_admin());
create policy evaluations_read_own_or_admin on public.session_evaluations for select to authenticated
using (
  private.is_admin() or exists (
    select 1 from public.coaching_sessions session
    where session.id = session_id and session.user_id = (select auth.uid())
  )
);
create policy progress_read_own_or_admin on public.user_competency_progress for select to authenticated
using (user_id = (select auth.uid()) or private.is_admin());
create policy learning_profiles_read_own_or_admin on public.learning_profiles for select to authenticated
using (user_id = (select auth.uid()) or private.is_admin());

revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.app_roles, public.training_types, public.training_type_versions,
  public.scenarios, public.competencies, public.evaluation_criteria, public.coaching_sessions,
  public.session_evaluations, public.user_competency_progress, public.learning_profiles to authenticated;
grant update (display_name, coaching_preferences) on public.profiles to authenticated;

insert into public.training_types (id, slug, name, description, display)
values (
  '10000000-0000-0000-0000-000000000001',
  'cold_call',
  'Kaltakquise',
  'Realistische B2B-Erstkontakte im SAP-Logistik-Umfeld.',
  '{"icon":"phone","color":"#004482"}'::jsonb
);

insert into public.training_type_versions (
  id, training_type_id, version_number, elevenlabs_agent_id, elevenlabs_agent_version, elevenlabs_branch_id
) values (
  '11000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  1,
  'agent_1901kxtjy2q5e77bp29wnkc2jnqv',
  'agtvrsn_3201kxxp5xa8ekm876ysej6dvjne',
  'agtbrch_4401kxtjy2qme72rdn3qkn5a61dg'
);

insert into public.scenarios (id, training_type_id, slug, title, description, agent_config) values
  ('12000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'open_decision_maker', 'Offener Entscheider', 'Der Ansprechpartner kennt IGZ und ist grundsätzlich offen.', '{"role":"Entscheider","resistance":"adaptive_challenging"}'),
  ('12000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'skeptical_sap_manager', 'Skeptischer SAP-Leiter', 'Ein erfahrener SAP-Verantwortlicher hinterfragt Nutzen und Relevanz.', '{"role":"SAP-Leiter","resistance":"adaptive_challenging"}'),
  ('12000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'time_pressure_gatekeeper', 'Zentrale unter Zeitdruck', 'Die Zentrale blockt ab und gibt nur bei präziser Gesprächsführung weiter.', '{"role":"Zentrale","resistance":"adaptive_challenging"}'),
  ('12000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'coach_surprise', 'Ossi überrascht dich', 'Ossi wählt Rolle, Ausgangslage und Einwände selbst und verrät das Szenario erst im Gespräch.', '{"selection_mode":"agent_choice","reveal_before_call":false,"resistance":"adaptive_challenging","allowed_roles":["Entscheider","SAP-Leiter","Zentrale","Ansprechpartner"],"allowed_situations":["kennt IGZ nicht","kein akuter Bedarf","bestehender Partner","falscher Ansprechpartner","Zeitdruck","Datenschutzblockade"]}');

insert into public.competencies (id, slug, name, description) values
  ('20000000-0000-0000-0000-000000000001', 'opening', 'Gesprächseröffnung', 'Klarer, relevanter und souveräner Gesprächseinstieg.'),
  ('20000000-0000-0000-0000-000000000002', 'questioning', 'Fragetechnik', 'Offene und zielführende Bedarfsermittlung.'),
  ('20000000-0000-0000-0000-000000000003', 'value', 'Nutzenorientierung', 'Kundenspezifischer und greifbarer Nutzen.'),
  ('20000000-0000-0000-0000-000000000004', 'objections', 'Einwandbehandlung', 'Lösungsorientierter Umgang mit Widerstand.'),
  ('20000000-0000-0000-0000-000000000005', 'closing', 'Abschlussstärke', 'Verbindliche Steuerung zum nächsten Schritt.'),
  ('20000000-0000-0000-0000-000000000006', 'language', 'Sprachwirkung', 'Positive, ruhige und professionelle Sprache.');

insert into public.evaluation_criteria (
  id, training_type_id, competency_id, criteria_version, slug, name, description, sort_order
) values
  ('21000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, 'conversation_opening', 'Gesprächseröffnung', 'Bewerte Relevanz, Klarheit und Souveränität der Eröffnung von 1 bis 5.', 1),
  ('21000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 1, 'needs_discovery', 'Fragetechnik und Bedarfsermittlung', 'Bewerte Qualität, Offenheit und Zielführung der Fragen von 1 bis 5.', 2),
  ('21000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 1, 'value_proposition', 'Nutzenargumentation', 'Bewerte Kundennähe und Greifbarkeit des Nutzens von 1 bis 5.', 3),
  ('21000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', 1, 'objection_handling', 'Einwandbehandlung', 'Bewerte Zuhören, Einordnung und Lösungsorientierung von 1 bis 5.', 4),
  ('21000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', 1, 'closing', 'Abschluss und Terminsteuerung', 'Bewerte Verbindlichkeit und Qualität des nächsten Schritts von 1 bis 5.', 5),
  ('21000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000006', 1, 'language_impact', 'Sprachwirkung und Lösungsorientierung', 'Bewerte Klarheit, Ruhe, Positivität und Lösungsorientierung von 1 bis 5.', 6);

select cron.schedule(
  'purge-expired-ossi-v2-transcripts',
  '17 2 * * *',
  'select private.purge_expired_transcripts();'
);
