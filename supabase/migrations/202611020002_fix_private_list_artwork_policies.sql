begin;

-- Forward correction only. The original migration remains immutable.
-- Use a positional argument so neither lists.name nor any future column can
-- shadow the outer Storage object path inside the ownership subquery.
create function public.watchflow_user_owns_list_artwork_path(p_object_name text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce(
    (select auth.uid()) is not null
    and public.watchflow_owns_artwork_path($1)
    and pg_catalog.split_part($1, '/', 1) = 'list-thumbnails'
    and exists (
      select 1 from public.lists l
      where l.id::text = pg_catalog.split_part($1, '/', 3)
        and l.user_id = (select auth.uid())
    ), false
  );
$$;
revoke all on function public.watchflow_user_owns_list_artwork_path(text) from public, anon, authenticated;
grant execute on function public.watchflow_user_owns_list_artwork_path(text) to authenticated;

alter policy watchflow_artwork_list_insert_guard on storage.objects
with check (bucket_id <> 'watchflow-artwork' or
  (pg_catalog.split_part(name, '/', 1) = 'avatars'
    or public.watchflow_user_owns_list_artwork_path(name)));

alter policy watchflow_artwork_insert_own on storage.objects
with check (bucket_id = 'watchflow-artwork' and public.watchflow_owns_artwork_path(name)
  and (pg_catalog.split_part(name, '/', 1) = 'avatars'
    or public.watchflow_user_owns_list_artwork_path(name)));

commit;
