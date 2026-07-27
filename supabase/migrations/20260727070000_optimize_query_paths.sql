create index if not exists app_roles_granted_by_idx
  on public.app_roles(granted_by);

create index if not exists coaching_sessions_scenario_idx
  on public.coaching_sessions(scenario_id);

create index if not exists coaching_sessions_training_version_idx
  on public.coaching_sessions(training_type_version_id);

create index if not exists evaluation_criteria_competency_idx
  on public.evaluation_criteria(competency_id);

create index if not exists learning_profiles_source_session_idx
  on public.learning_profiles(source_session_id);

create index if not exists learning_profiles_training_type_idx
  on public.learning_profiles(training_type_id);

create index if not exists user_competency_progress_competency_idx
  on public.user_competency_progress(competency_id);

create index if not exists coaching_sessions_user_completed_idx
  on public.coaching_sessions(user_id, completed_at desc)
  include (training_type_version_id)
  where status = 'completed' and completed_at is not null;

drop index if exists public.learning_profiles_scope_idx;
create unique index learning_profiles_scope_idx
  on public.learning_profiles(user_id, training_type_id) nulls not distinct;

alter policy profiles_read_self_or_admin on public.profiles
  using (
    (select private.is_active_user())
    and (id = (select auth.uid()) or (select private.is_admin()))
  );

alter policy profiles_update_self on public.profiles
  using (id = (select auth.uid()) and (select private.is_active_user()))
  with check (id = (select auth.uid()) and (select private.is_active_user()));

alter policy app_roles_read_self_or_admin on public.app_roles
  using (
    (select private.is_active_user())
    and (user_id = (select auth.uid()) or (select private.is_admin()))
  );

alter policy training_types_read_active_or_admin on public.training_types
  using (
    (select private.is_active_user())
    and (is_active or (select private.is_admin()))
  );

alter policy training_versions_read_active_or_admin on public.training_type_versions
  using (
    (select private.is_active_user())
    and (is_active or (select private.is_admin()))
  );

alter policy scenarios_read_active_or_admin on public.scenarios
  using (
    (select private.is_active_user())
    and (is_active or (select private.is_admin()))
  );

alter policy competencies_read_all on public.competencies
  using ((select private.is_active_user()));

alter policy criteria_read_active_or_admin on public.evaluation_criteria
  using (
    (select private.is_active_user())
    and (is_active or (select private.is_admin()))
  );

alter policy sessions_read_own_or_admin on public.coaching_sessions
  using (
    (select private.is_active_user())
    and (user_id = (select auth.uid()) or (select private.is_admin()))
  );

alter policy evaluations_read_own_or_admin on public.session_evaluations
  using (
    (select private.is_active_user())
    and (
      (select private.is_admin())
      or exists (
        select 1
        from public.coaching_sessions session
        where session.id = session_id
          and session.user_id = (select auth.uid())
      )
    )
  );

alter policy progress_read_own_or_admin on public.user_competency_progress
  using (
    (select private.is_active_user())
    and (user_id = (select auth.uid()) or (select private.is_admin()))
  );

alter policy learning_profiles_read_own_or_admin on public.learning_profiles
  using (
    (select private.is_active_user())
    and (user_id = (select auth.uid()) or (select private.is_admin()))
  );
