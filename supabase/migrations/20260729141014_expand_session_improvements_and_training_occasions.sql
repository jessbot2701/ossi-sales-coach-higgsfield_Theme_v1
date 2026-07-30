alter table public.scenarios
  add column is_user_selectable boolean not null default false,
  add column sort_order integer not null default 100;

insert into public.scenarios (
  id,
  training_type_id,
  slug,
  title,
  description,
  agent_config,
  is_active,
  is_user_selectable,
  sort_order
) values (
  '12000000-0000-0000-0000-000000000005',
  '10000000-0000-0000-0000-000000000001',
  'customer_event_invitation',
  'Einladung zu einer Kundenveranstaltung',
  'Trainiere, eine konkrete Kundenveranstaltung relevant und verbindlich vorzustellen.',
  '{
    "selection_mode": "agent_choice",
    "reveal_before_call": false,
    "resistance": "adaptive_challenging",
    "context_questions": "Erfrage vor der Bereitschaftsfrage zuerst den Namen und die Art der Veranstaltung und danach den konkreten Kunden- oder Gesprächskontext. Beide Angaben müssen geklärt sein.",
    "roleplay_setup": "Der Nutzer lädt einen B2B-Kontakt zu der im Startgespräch genannten Kundenveranstaltung ein. Wähle Rolle, Ausgangslage und Einwände passend zum genannten Kontext, ohne sie vorher zu verraten.",
    "allowed_roles": ["Entscheider", "SAP-Leiter", "Zentrale", "Ansprechpartner"]
  }'::jsonb,
  true,
  true,
  1
)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  agent_config = excluded.agent_config,
  is_active = excluded.is_active,
  is_user_selectable = excluded.is_user_selectable,
  sort_order = excluded.sort_order;

alter table public.session_evaluations
  drop constraint session_evaluations_improvement_complete;

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
      and (
        improvement_priority is null
        or improvement_priority between 1 and 3
      )
    )
  );

-- Existing legacy sessions remain readable. Every new or changed low score must
-- carry a complete, evidenced category improvement.
alter table public.session_evaluations
  add constraint session_evaluations_low_score_improvement_required check (
    score is null
    or score not between 1 and 3
    or (
      nullif(btrim(recommendation), '') is not null
      and nullif(btrim(alternative_formulation), '') is not null
      and nullif(btrim(improvement_evidence), '') is not null
    )
  ) not valid;

create index scenarios_user_selectable_idx
  on public.scenarios(training_type_id, sort_order, id)
  where is_active and is_user_selectable;
