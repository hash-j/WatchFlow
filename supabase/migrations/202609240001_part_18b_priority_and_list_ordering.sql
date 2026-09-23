begin;

-- Watch Next remains an owner-scoped, contiguous manual queue. Priority is an
-- existing personal field: it now determines the primary display order, with
-- queue_position retaining stable manual ordering inside each priority level.
create or replace function public.watchflow_normalize_queue()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_queue_ids uuid[];
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  perform 1
  from public.user_movies
  where user_id = v_user_id
    and status = 'watch_next'
  order by priority desc, queue_position asc nulls last, created_at asc, id asc
  for update;

  select coalesce(
    pg_catalog.array_agg(
      id order by priority desc, queue_position asc nulls last, created_at asc, id asc
    ),
    array[]::uuid[]
  )
  into v_queue_ids
  from public.user_movies
  where user_id = v_user_id
    and status = 'watch_next';

  update public.user_movies
  set queue_position = null
  where user_id = v_user_id
    and queue_position is not null;

  update public.user_movies as user_movie
  set queue_position = ordered.position::integer
  from pg_catalog.unnest(v_queue_ids) with ordinality
    as ordered(id, position)
  where user_movie.id = ordered.id
    and user_movie.user_id = v_user_id
    and user_movie.status = 'watch_next';
end;
$$;

comment on function public.watchflow_normalize_queue() is
  'Compacts the authenticated Watch Next queue by priority then manual order.';

create or replace function public.move_watch_queue_item(
  p_user_movie_id uuid,
  p_direction text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_queue_ids uuid[];
  v_current_index integer;
  v_target_index integer;
  v_temporary_id uuid;
  v_current_priority smallint;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  if p_direction not in ('up', 'down') then
    raise exception using
      errcode = '22023',
      message = 'Invalid queue direction';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  perform 1
  from public.user_movies
  where user_id = v_user_id
    and status = 'watch_next'
  order by priority desc, queue_position asc nulls last, created_at asc, id asc
  for update;

  select coalesce(
    pg_catalog.array_agg(
      id order by priority desc, queue_position asc nulls last, created_at asc, id asc
    ),
    array[]::uuid[]
  )
  into v_queue_ids
  from public.user_movies
  where user_id = v_user_id
    and status = 'watch_next';

  v_current_index := pg_catalog.array_position(
    v_queue_ids,
    p_user_movie_id
  );

  if v_current_index is null then
    return pg_catalog.jsonb_build_object(
      'success', false,
      'moved', false,
      'reason', 'not_found'
    );
  end if;

  v_target_index := case
    when p_direction = 'up' then v_current_index - 1
    else v_current_index + 1
  end;

  if v_target_index < 1
    or v_target_index > pg_catalog.cardinality(v_queue_ids) then
    return pg_catalog.jsonb_build_object(
      'success', true,
      'moved', false,
      'position', v_current_index
    );
  end if;

  select priority
  into v_current_priority
  from public.user_movies
  where id = p_user_movie_id
    and user_id = v_user_id
    and status = 'watch_next';

  if (
    select priority
    from public.user_movies
    where id = v_queue_ids[v_target_index]
      and user_id = v_user_id
      and status = 'watch_next'
  ) is distinct from v_current_priority then
    return pg_catalog.jsonb_build_object(
      'success', true,
      'moved', false,
      'position', v_current_index
    );
  end if;

  v_temporary_id := v_queue_ids[v_target_index];
  v_queue_ids[v_target_index] := v_queue_ids[v_current_index];
  v_queue_ids[v_current_index] := v_temporary_id;

  update public.user_movies
  set queue_position = null
  where user_id = v_user_id
    and queue_position is not null;

  update public.user_movies as user_movie
  set queue_position = ordered.position::integer,
      updated_at = pg_catalog.now()
  from pg_catalog.unnest(v_queue_ids) with ordinality
    as ordered(id, position)
  where user_movie.id = ordered.id
    and user_movie.user_id = v_user_id
    and user_movie.status = 'watch_next';

  return pg_catalog.jsonb_build_object(
    'success', true,
    'moved', true,
    'position', v_target_index
  );
end;
$$;

comment on function public.move_watch_queue_item(uuid, text) is
  'Moves one authenticated Watch Next item in priority-aware display order.';

create or replace function public.watchflow_bulk_update_library_status(
  p_user_movie_ids uuid[],
  p_status text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_requested integer;
  v_matched integer;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  v_requested := coalesce(pg_catalog.cardinality(p_user_movie_ids), 0);

  if v_requested = 0
    or v_requested > 100
    or pg_catalog.array_position(p_user_movie_ids, null) is not null
    or (
      select pg_catalog.count(distinct selected_id)
      from pg_catalog.unnest(p_user_movie_ids) as selected(selected_id)
    ) <> v_requested then
    raise exception using
      errcode = '22023',
      message = 'Invalid library selection';
  end if;

  if p_status is null or p_status not in (
    'want_to_watch',
    'watch_next',
    'currently_watching',
    'watched',
    'on_hold',
    'dropped'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid bulk status';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  perform 1
  from public.user_movies
  where user_id = v_user_id
    and (status = 'watch_next' or id = any (p_user_movie_ids))
  order by priority desc, queue_position asc nulls last, created_at asc, id asc
  for update;

  select pg_catalog.count(*)
  into v_matched
  from public.user_movies
  where user_id = v_user_id
    and id = any (p_user_movie_ids);

  if v_matched <> v_requested then
    return pg_catalog.jsonb_build_object(
      'success', false,
      'requested', v_requested,
      'matched', v_matched,
      'updated', 0,
      'skipped', v_requested - v_matched,
      'failed', 0,
      'reason', 'selection_changed'
    );
  end if;

  update public.user_movies
  set status = p_status,
      queue_position = null,
      updated_at = pg_catalog.now()
  where user_id = v_user_id
    and id = any (p_user_movie_ids);

  perform public.watchflow_normalize_queue();

  return pg_catalog.jsonb_build_object(
    'success', true,
    'requested', v_requested,
    'matched', v_matched,
    'updated', v_matched,
    'skipped', 0,
    'failed', 0
  );
end;
$$;

comment on function public.watchflow_bulk_update_library_status(uuid[], text) is
  'Bulk-updates owned statuses and compacts the priority-aware Watch Next queue.';

create or replace function public.watchflow_set_watch_next_priority(
  p_user_movie_id uuid,
  p_priority smallint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  if p_user_movie_id is null or p_priority is null
    or p_priority < 0 or p_priority > 5 then
    raise exception using
      errcode = '22023',
      message = 'Invalid Watch Next priority';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  perform 1
  from public.user_movies
  where id = p_user_movie_id
    and user_id = v_user_id
    and status = 'watch_next'
  for update;

  if not found then
    return pg_catalog.jsonb_build_object(
      'success', false,
      'reason', 'not_found'
    );
  end if;

  update public.user_movies
  set priority = p_priority,
      updated_at = pg_catalog.now()
  where id = p_user_movie_id
    and user_id = v_user_id
    and status = 'watch_next';

  perform public.watchflow_normalize_queue();

  return pg_catalog.jsonb_build_object(
    'success', true,
    'priority', p_priority
  );
end;
$$;

comment on function public.watchflow_set_watch_next_priority(uuid, smallint) is
  'Sets an owned Watch Next priority and rewrites queue positions atomically.';

-- List membership ordering is intentionally separate. This position orders
-- private list cards only; list_movies.position remains untouched.
alter table public.lists
  add column sort_position integer;

with ordered_lists as (
  select
    id,
    row_number() over (
      partition by user_id
      order by updated_at desc, id asc
    )::integer as sort_position
  from public.lists
)
update public.lists as list
set sort_position = ordered_lists.sort_position
from ordered_lists
where list.id = ordered_lists.id;

alter table public.lists
  alter column sort_position set not null,
  add constraint lists_sort_position_positive check (sort_position >= 1),
  add constraint lists_user_sort_position_key
    unique (user_id, sort_position) deferrable initially immediate;

comment on column public.lists.sort_position is
  'One-based owner-scoped order for private list cards; unrelated to list_movies.position.';

create or replace function public.watchflow_assign_list_sort_position()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or new.user_id <> auth.uid() then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  if new.sort_position is not null then
    raise exception using
      errcode = '22023',
      message = 'Custom list order is assigned automatically';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('watchflow:list-order:' || new.user_id::text, 0)
  );

  select coalesce(max(sort_position), 0) + 1
  into new.sort_position
  from public.lists
  where user_id = new.user_id;

  return new;
end;
$$;

drop trigger if exists watchflow_lists_assign_sort_position on public.lists;
create trigger watchflow_lists_assign_sort_position
before insert on public.lists
for each row
execute function public.watchflow_assign_list_sort_position();

create or replace function public.watchflow_normalize_list_order()
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_list_ids uuid[];
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('watchflow:list-order:' || v_user_id::text, 0)
  );

  perform 1
  from public.lists
  where user_id = v_user_id
  order by sort_position asc, created_at asc, id asc
  for update;

  select coalesce(
    array_agg(id order by sort_position asc, created_at asc, id asc),
    array[]::uuid[]
  )
  into v_list_ids
  from public.lists
  where user_id = v_user_id;

  set constraints lists_user_sort_position_key deferred;

  update public.lists as list
  set sort_position = ordered.position::integer
  from unnest(v_list_ids) with ordinality as ordered(id, position)
  where list.id = ordered.id
    and list.user_id = v_user_id
    and list.sort_position is distinct from ordered.position::integer;
end;
$$;

create or replace function public.watchflow_move_custom_list(
  p_list_id uuid,
  p_direction text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_list_ids uuid[];
  v_current_index integer;
  v_target_index integer;
  v_target_id uuid;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  if p_list_id is null or p_direction not in ('up', 'down') then
    raise exception using
      errcode = '22023',
      message = 'Invalid custom list movement';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('watchflow:list-order:' || v_user_id::text, 0)
  );

  perform public.watchflow_normalize_list_order();

  select coalesce(
    array_agg(id order by sort_position asc, created_at asc, id asc),
    array[]::uuid[]
  )
  into v_list_ids
  from public.lists
  where user_id = v_user_id;

  v_current_index := array_position(v_list_ids, p_list_id);

  if v_current_index is null then
    return jsonb_build_object(
      'success', false,
      'moved', false,
      'reason', 'not_found'
    );
  end if;

  v_target_index := case
    when p_direction = 'up' then v_current_index - 1
    else v_current_index + 1
  end;

  if v_target_index < 1 or v_target_index > cardinality(v_list_ids) then
    return jsonb_build_object(
      'success', true,
      'moved', false,
      'position', v_current_index
    );
  end if;

  v_target_id := v_list_ids[v_target_index];

  set constraints lists_user_sort_position_key deferred;

  update public.lists
  set sort_position = case
    when id = p_list_id then v_target_index
    when id = v_target_id then v_current_index
    else sort_position
  end
  where user_id = v_user_id
    and id in (p_list_id, v_target_id);

  return jsonb_build_object(
    'success', true,
    'moved', true,
    'position', v_target_index
  );
end;
$$;

create or replace function public.watchflow_compact_lists_after_delete()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  -- Auth-user deletion cascades the lists with no JWT. There are no surviving
  -- rows to compact in that path.
  if v_user_id is null then
    return null;
  end if;

  if exists (
    select 1
    from deleted_lists
    where user_id = v_user_id
  ) then
    perform public.watchflow_normalize_list_order();
  end if;

  return null;
end;
$$;

drop trigger if exists watchflow_lists_compact_after_delete on public.lists;
create trigger watchflow_lists_compact_after_delete
after delete on public.lists
referencing old table as deleted_lists
for each statement
execute function public.watchflow_compact_lists_after_delete();

-- The result shape adds sort_position, so PostgreSQL requires replacing the
-- old table-returning function rather than CREATE OR REPLACE.
drop function if exists public.watchflow_list_summaries();

create function public.watchflow_list_summaries()
returns table (
  list_id uuid,
  name text,
  description text,
  visibility text,
  created_at timestamptz,
  updated_at timestamptz,
  sort_position integer,
  movie_count bigint,
  poster_paths jsonb
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    lists.id as list_id,
    lists.name,
    lists.description,
    lists.visibility,
    lists.created_at,
    lists.updated_at,
    lists.sort_position,
    count(owned_membership.id) as movie_count,
    coalesce(
      (
        select jsonb_agg(
          preview.poster_path
          order by preview.position, preview.user_movie_id
        )
        from (
          select
            movies.poster_path,
            list_movies.position,
            list_movies.user_movie_id
          from public.list_movies
          inner join public.user_movies
            on user_movies.id = list_movies.user_movie_id
           and user_movies.user_id = (select auth.uid())
          inner join public.movies on movies.id = user_movies.movie_id
          where list_movies.list_id = lists.id
            and movies.poster_path is not null
          order by
            list_movies.position asc nulls last,
            list_movies.created_at asc,
            list_movies.id asc
          limit 4
        ) as preview
      ),
      '[]'::jsonb
    ) as poster_paths
  from public.lists
  left join public.list_movies as owned_membership
    on owned_membership.list_id = lists.id
   and exists (
     select 1
     from public.user_movies
     where user_movies.id = owned_membership.user_movie_id
       and user_movies.user_id = (select auth.uid())
   )
  where lists.user_id = (select auth.uid())
  group by
    lists.id,
    lists.name,
    lists.description,
    lists.visibility,
    lists.created_at,
    lists.updated_at,
    lists.sort_position
  order by lists.sort_position asc, lists.id;
$$;

revoke all on function public.watchflow_normalize_queue()
  from public, anon;
revoke all on function public.move_watch_queue_item(uuid, text)
  from public, anon;
revoke all on function public.watchflow_bulk_update_library_status(uuid[], text)
  from public, anon;
revoke all on function public.watchflow_set_watch_next_priority(uuid, smallint)
  from public, anon;
revoke all on function public.watchflow_assign_list_sort_position()
  from public, anon, authenticated;
revoke all on function public.watchflow_normalize_list_order()
  from public, anon;
revoke all on function public.watchflow_move_custom_list(uuid, text)
  from public, anon;
revoke all on function public.watchflow_compact_lists_after_delete()
  from public, anon, authenticated;
revoke all on function public.watchflow_list_summaries()
  from public, anon;

grant execute on function public.watchflow_normalize_queue()
  to authenticated;
grant execute on function public.move_watch_queue_item(uuid, text)
  to authenticated;
grant execute on function public.watchflow_bulk_update_library_status(uuid[], text)
  to authenticated;
grant execute on function public.watchflow_set_watch_next_priority(uuid, smallint)
  to authenticated;
grant update (sort_position) on table public.lists to authenticated;
grant execute on function public.watchflow_normalize_list_order()
  to authenticated;
grant execute on function public.watchflow_move_custom_list(uuid, text)
  to authenticated;
grant execute on function public.watchflow_list_summaries()
  to authenticated;

commit;
