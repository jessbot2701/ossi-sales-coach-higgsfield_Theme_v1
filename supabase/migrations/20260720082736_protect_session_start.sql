with ranked_open_sessions as (
  select
    id,
    row_number() over (partition by user_id order by created_at desc, id desc) as row_rank
  from public.coaching_sessions
  where status in ('created', 'active')
)
update public.coaching_sessions session
set
  status = 'failed',
  processing_error = 'Closed while enabling the single-open-session constraint'
from ranked_open_sessions ranked
where session.id = ranked.id
  and ranked.row_rank > 1;

create unique index coaching_sessions_one_open_per_user_idx
on public.coaching_sessions(user_id)
where status in ('created', 'active');
