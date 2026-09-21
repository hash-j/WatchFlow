begin;

-- Normalize one authenticated user's queue with a constant number of UPDATE
-- statements. The ordered ID snapshot is captured before positions are cleared
-- so the partial unique index cannot conflict while positions are reassigned.
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
  order by queue_position asc nulls last, created_at asc, id asc
  for update;

  select coalesce(
    pg_catalog.array_agg(
      id order by queue_position asc nulls last, created_at asc, id asc
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
  'Compacts the authenticated user Watch Next queue with two set-based updates.';

-- Preserve the existing adjacent-swap contract while replacing the per-row
-- rewrite loop with one set-based assignment after the conflict-safe clear.
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
  order by queue_position asc nulls last, created_at asc, id asc
  for update;

  select coalesce(
    pg_catalog.array_agg(
      id order by queue_position asc nulls last, created_at asc, id asc
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
  'Moves one authenticated user Watch Next item and rewrites positions set-wise.';

-- The previous Watch Next branch normalized before appending and again after
-- updating. Capture the normalized existing order once, append newly queued
-- selections in request order, and assign the final positions set-wise.
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
  v_queue_ids uuid[];
  v_new_queue_ids uuid[];
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
  order by queue_position asc nulls last, created_at asc, id asc
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

  if p_status = 'watch_next' then
    select coalesce(
      pg_catalog.array_agg(
        id order by queue_position asc nulls last, created_at asc, id asc
      ),
      array[]::uuid[]
    )
    into v_queue_ids
    from public.user_movies
    where user_id = v_user_id
      and status = 'watch_next';

    select coalesce(
      pg_catalog.array_agg(user_movie.id order by requested.display_order),
      array[]::uuid[]
    )
    into v_new_queue_ids
    from pg_catalog.unnest(p_user_movie_ids) with ordinality
      as requested(id, display_order)
    inner join public.user_movies as user_movie
      on user_movie.id = requested.id
     and user_movie.user_id = v_user_id
    where user_movie.status is distinct from 'watch_next';

    update public.user_movies
    set status = 'watch_next',
        queue_position = null,
        updated_at = pg_catalog.now()
    where user_id = v_user_id
      and id = any (v_new_queue_ids);

    v_queue_ids := v_queue_ids || v_new_queue_ids;

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
  else
    update public.user_movies
    set status = p_status,
        queue_position = null,
        updated_at = pg_catalog.now()
    where user_id = v_user_id
      and id = any (p_user_movie_ids);

    perform public.watchflow_normalize_queue();
  end if;

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
  'Bulk-updates owned statuses and performs at most one set-based queue normalization.';

revoke all on function public.watchflow_normalize_queue()
  from public, anon;
revoke all on function public.move_watch_queue_item(uuid, text)
  from public, anon;
revoke all on function public.watchflow_bulk_update_library_status(uuid[], text)
  from public, anon;

grant execute on function public.watchflow_normalize_queue()
  to authenticated;
grant execute on function public.move_watch_queue_item(uuid, text)
  to authenticated;
grant execute on function public.watchflow_bulk_update_library_status(uuid[], text)
  to authenticated;

commit;
