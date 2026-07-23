create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_roles app_role
    join public.profiles profile on profile.id = app_role.user_id
    where app_role.user_id = (select auth.uid())
      and app_role.role = 'admin'
      and profile.is_active
  );
$$;

drop policy if exists profiles_read_self_or_admin on public.profiles;
create policy profiles_read_self_or_admin on public.profiles for select to authenticated
using (private.is_active_user() and (id = (select auth.uid()) or private.is_admin()));

drop policy if exists app_roles_read_self_or_admin on public.app_roles;
create policy app_roles_read_self_or_admin on public.app_roles for select to authenticated
using (private.is_active_user() and (user_id = (select auth.uid()) or private.is_admin()));

drop policy if exists training_types_read_active_or_admin on public.training_types;
create policy training_types_read_active_or_admin on public.training_types for select to authenticated
using (private.is_active_user() and (is_active or private.is_admin()));

drop policy if exists training_versions_read_active_or_admin on public.training_type_versions;
create policy training_versions_read_active_or_admin on public.training_type_versions for select to authenticated
using (private.is_active_user() and (is_active or private.is_admin()));

drop policy if exists scenarios_read_active_or_admin on public.scenarios;
create policy scenarios_read_active_or_admin on public.scenarios for select to authenticated
using (private.is_active_user() and (is_active or private.is_admin()));

drop policy if exists competencies_read_all on public.competencies;
create policy competencies_read_all on public.competencies for select to authenticated
using (private.is_active_user());

drop policy if exists criteria_read_active_or_admin on public.evaluation_criteria;
create policy criteria_read_active_or_admin on public.evaluation_criteria for select to authenticated
using (private.is_active_user() and (is_active or private.is_admin()));

drop policy if exists sessions_read_own_or_admin on public.coaching_sessions;
create policy sessions_read_own_or_admin on public.coaching_sessions for select to authenticated
using (private.is_active_user() and (user_id = (select auth.uid()) or private.is_admin()));

drop policy if exists evaluations_read_own_or_admin on public.session_evaluations;
create policy evaluations_read_own_or_admin on public.session_evaluations for select to authenticated
using (
  private.is_active_user() and (
    private.is_admin() or exists (
      select 1 from public.coaching_sessions session
      where session.id = session_id and session.user_id = (select auth.uid())
    )
  )
);

drop policy if exists progress_read_own_or_admin on public.user_competency_progress;
create policy progress_read_own_or_admin on public.user_competency_progress for select to authenticated
using (private.is_active_user() and (user_id = (select auth.uid()) or private.is_admin()));

drop policy if exists learning_profiles_read_own_or_admin on public.learning_profiles;
create policy learning_profiles_read_own_or_admin on public.learning_profiles for select to authenticated
using (private.is_active_user() and (user_id = (select auth.uid()) or private.is_admin()));
