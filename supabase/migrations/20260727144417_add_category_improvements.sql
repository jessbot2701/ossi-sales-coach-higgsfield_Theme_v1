alter table public.session_evaluations
  add column alternative_formulation text,
  add column improvement_evidence text,
  add column improvement_priority smallint;

-- The old value was a session-wide learning goal copied to every criterion.
-- It cannot be interpreted as a category-specific improvement.
update public.session_evaluations
set recommendation = null
where recommendation is not null;

alter table public.session_evaluations
  add constraint session_evaluations_improvement_complete check (
    (
      recommendation is null
      and alternative_formulation is null
      and improvement_evidence is null
      and improvement_priority is null
    )
    or (
      nullif(btrim(recommendation), '') is not null
      and nullif(btrim(alternative_formulation), '') is not null
      and nullif(btrim(improvement_evidence), '') is not null
      and improvement_priority between 1 and 3
    )
  );

create unique index session_evaluations_improvement_priority_idx
  on public.session_evaluations(session_id, improvement_priority)
  where improvement_priority is not null;

alter table public.coaching_sessions
  add column strengths jsonb not null default '[]'::jsonb,
  add constraint coaching_sessions_strengths_array check (
    jsonb_typeof(strengths) = 'array'
    and jsonb_array_length(strengths) <= 3
  );
