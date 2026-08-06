create or replace function public.user_has_storage_objects(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from storage.objects
    where owner_id = target_user_id::text
  );
$$;

revoke all on function public.user_has_storage_objects(uuid) from public, anon, authenticated;
grant execute on function public.user_has_storage_objects(uuid) to service_role;
