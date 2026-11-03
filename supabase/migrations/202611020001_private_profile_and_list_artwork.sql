begin;

do $$ begin
  if not coalesce((select relrowsecurity from pg_catalog.pg_class
    where oid = 'storage.objects'::regclass), false) then
    raise exception 'Storage RLS must be enabled before artwork is installed';
  end if;
end; $$;

-- Reuse profiles.avatar_url as a private object reference; no binary DB data.
alter table public.lists add column thumbnail_path text;
alter table public.lists add constraint lists_thumbnail_owner_path check (
  thumbnail_path is null or thumbnail_path ~ (
    '^list-thumbnails/' || user_id::text || '/' || id::text ||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
  )
);
grant update (thumbnail_path) on public.lists to authenticated;

-- Validate changed references only, so legacy external avatar URLs do not
-- prevent unrelated profile edits. Rendering never fetches legacy URLs.
create function public.watchflow_validate_avatar_reference()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.avatar_url is distinct from old.avatar_url and new.avatar_url is not null
    and new.avatar_url !~ ('^avatars/' || new.id::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$') then
    raise exception using errcode = '22023', message = 'Invalid avatar reference';
  end if;
  return new;
end;
$$;
revoke all on function public.watchflow_validate_avatar_reference() from public, anon, authenticated;
create trigger watchflow_profiles_avatar_reference
before update of avatar_url on public.profiles for each row
execute function public.watchflow_validate_avatar_reference();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('watchflow-artwork', 'watchflow-artwork', false, 2097152, array['image/webp']);

-- Immutable random-version objects. No UPDATE policy: replacement is a new
-- object followed by an owner-filtered reference update and old-file cleanup.
create function public.watchflow_owns_artwork_path(p_name text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select (select auth.uid()) is not null
    and pg_catalog.split_part(p_name, '/', 2) = (select auth.uid())::text
    and (p_name ~ '^avatars/[0-9a-f-]{36}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
      or p_name ~ '^list-thumbnails/[0-9a-f-]{36}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$');
$$;
revoke all on function public.watchflow_owns_artwork_path(text) from public, anon;
-- Anonymous policy evaluation can only return false (no auth.uid()).
grant execute on function public.watchflow_owns_artwork_path(text) to anon, authenticated;

-- Restrictive, bucket-specific boundaries also protect against unrelated older
-- permissive policies. Other buckets retain their existing policy behavior.
create policy watchflow_artwork_boundary on storage.objects as restrictive for all to public
using (bucket_id <> 'watchflow-artwork' or public.watchflow_owns_artwork_path(name))
with check (bucket_id <> 'watchflow-artwork' or public.watchflow_owns_artwork_path(name));
-- Keep list-table permission checks in the authenticated INSERT policy only;
-- anonymous operations on other buckets must not acquire a lists dependency.
create policy watchflow_artwork_list_insert_guard on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'watchflow-artwork' or
  (pg_catalog.split_part(name, '/', 1) = 'avatars' or exists (
    select 1 from public.lists l where l.id::text = pg_catalog.split_part(name, '/', 3)
      and l.user_id = (select auth.uid())
  )));
create policy watchflow_artwork_no_overwrite on storage.objects as restrictive for update to public
using (bucket_id <> 'watchflow-artwork') with check (bucket_id <> 'watchflow-artwork');

create policy watchflow_artwork_select_own on storage.objects for select to authenticated
using (bucket_id = 'watchflow-artwork' and public.watchflow_owns_artwork_path(name));
create policy watchflow_artwork_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'watchflow-artwork' and public.watchflow_owns_artwork_path(name)
  and (pg_catalog.split_part(name, '/', 1) = 'avatars' or exists (
    select 1 from public.lists l where l.id::text = pg_catalog.split_part(name, '/', 3)
      and l.user_id = (select auth.uid())
  )));
-- Owner-only deletion also permits cleanup after the parent list is deleted.
create policy watchflow_artwork_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'watchflow-artwork' and public.watchflow_owns_artwork_path(name));

-- Account deletion must remove owned Storage objects before deleting Auth user.
-- Bounded path listing only: byte deletion still goes through the Storage API.
create function public.watchflow_owned_artwork_paths()
returns setof text language sql stable security invoker set search_path = '' as $$
  select name from storage.objects where bucket_id = 'watchflow-artwork'
    and public.watchflow_owns_artwork_path(name) order by name limit 500;
$$;
revoke all on function public.watchflow_owned_artwork_paths() from public, anon;
grant execute on function public.watchflow_owned_artwork_paths() to authenticated;

commit;
