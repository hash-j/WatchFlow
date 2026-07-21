begin;

-- Phase 3 needs one user-owned field that was not present in the deployed
-- schema. Existing RLS policies on user_movies continue to cover this column.
alter table public.user_movies
  add column schedule_note text;

comment on column public.user_movies.schedule_note is
  'Optional private note for the scheduled viewing.';

create index user_movies_watch_next_queue_idx
  on public.user_movies (user_id, queue_position)
  where status = 'watch_next';

create or replace function public.watchflow_normalize_queue()
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_queue_ids uuid[];
  v_library_id uuid;
  v_position integer := 0;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  perform 1
  from public.user_movies
  where user_id = auth.uid()
    and status = 'watch_next'
  for update;

  select coalesce(
    array_agg(id order by queue_position asc nulls last, created_at asc, id asc),
    array[]::uuid[]
  )
  into v_queue_ids
  from public.user_movies
  where user_id = auth.uid()
    and status = 'watch_next';

  update public.user_movies
  set queue_position = null
  where user_id = auth.uid()
    and queue_position is not null;

  foreach v_library_id in array v_queue_ids
  loop
    v_position := v_position + 1;
    update public.user_movies
    set queue_position = v_position
    where id = v_library_id
      and user_id = auth.uid();
  end loop;
end;
$$;

create or replace function public.watchflow_update_library_movie(
  p_library_id uuid,
  p_status text,
  p_personal_rating numeric,
  p_review text,
  p_priority smallint,
  p_would_watch_again boolean,
  p_watched_at timestamptz,
  p_scheduled_for timestamptz,
  p_timezone text,
  p_schedule_note text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_current_status text;
  v_queue_position integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));

  select status
  into v_current_status
  from public.user_movies
  where id = p_library_id
    and user_id = auth.uid()
  for update;

  if not found then
    return false;
  end if;

  if p_status not in (
    'want_to_watch',
    'watch_next',
    'scheduled',
    'currently_watching',
    'watched',
    'on_hold',
    'dropped'
  ) then
    raise exception using errcode = '22023', message = 'Invalid movie status';
  end if;

  if p_personal_rating is not null
    and (p_personal_rating < 0 or p_personal_rating > 10) then
    raise exception using errcode = '22023', message = 'Invalid personal rating';
  end if;

  if p_priority < 0 or p_priority > 5 then
    raise exception using errcode = '22023', message = 'Invalid priority';
  end if;

  if char_length(coalesce(p_review, '')) > 5000
    or char_length(coalesce(p_schedule_note, '')) > 1000 then
    raise exception using errcode = '22023', message = 'Text value is too long';
  end if;

  if p_status = 'scheduled' then
    if p_scheduled_for is null
      or p_timezone is null
      or not exists (
        select 1 from pg_timezone_names where name = p_timezone
      ) then
      raise exception using errcode = '22023', message = 'Invalid schedule';
    end if;

    update public.profiles
    set timezone = p_timezone,
        updated_at = now()
    where id = auth.uid();

    if not found then
      raise exception using errcode = 'P0002', message = 'Profile not found';
    end if;
  end if;

  if p_status = 'watch_next' then
    if v_current_status = 'watch_next' then
      select queue_position
      into v_queue_position
      from public.user_movies
      where id = p_library_id
        and user_id = auth.uid();
    else
      select coalesce(max(queue_position), 0) + 1
      into v_queue_position
      from public.user_movies
      where user_id = auth.uid()
        and status = 'watch_next';
    end if;
  else
    v_queue_position := null;
  end if;

  update public.user_movies
  set status = p_status,
      personal_rating = p_personal_rating,
      review = nullif(btrim(p_review), ''),
      priority = p_priority,
      would_watch_again = p_would_watch_again,
      watched_at = p_watched_at,
      queue_position = v_queue_position,
      scheduled_for = case when p_status = 'scheduled' then p_scheduled_for else null end,
      schedule_note = case
        when p_status = 'scheduled' then nullif(btrim(p_schedule_note), '')
        else null
      end,
      updated_at = now()
  where id = p_library_id
    and user_id = auth.uid();

  perform public.watchflow_normalize_queue();
  return true;
end;
$$;

create or replace function public.watchflow_move_queue_item(
  p_library_id uuid,
  p_direction text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_queue_ids uuid[];
  v_current_index integer;
  v_target_index integer;
  v_temporary_id uuid;
  v_library_id uuid;
  v_position integer := 0;
begin
  if auth.uid() is null then
    return false;
  end if;

  if p_direction not in ('up', 'down') then
    raise exception using errcode = '22023', message = 'Invalid queue direction';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  perform public.watchflow_normalize_queue();

  select coalesce(
    array_agg(id order by queue_position asc, created_at asc, id asc),
    array[]::uuid[]
  )
  into v_queue_ids
  from public.user_movies
  where user_id = auth.uid()
    and status = 'watch_next';

  v_current_index := array_position(v_queue_ids, p_library_id);

  if v_current_index is null then
    return false;
  end if;

  v_target_index := case
    when p_direction = 'up' then v_current_index - 1
    else v_current_index + 1
  end;

  if v_target_index >= 1 and v_target_index <= cardinality(v_queue_ids) then
    v_temporary_id := v_queue_ids[v_target_index];
    v_queue_ids[v_target_index] := v_queue_ids[v_current_index];
    v_queue_ids[v_current_index] := v_temporary_id;
  end if;

  update public.user_movies
  set queue_position = null
  where user_id = auth.uid()
    and status = 'watch_next';

  foreach v_library_id in array v_queue_ids
  loop
    v_position := v_position + 1;
    update public.user_movies
    set queue_position = v_position,
        updated_at = now()
    where id = v_library_id
      and user_id = auth.uid();
  end loop;

  return true;
end;
$$;

create or replace function public.watchflow_schedule_movie(
  p_library_id uuid,
  p_scheduled_for timestamptz,
  p_timezone text,
  p_schedule_note text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  if p_scheduled_for is null
    or not exists (select 1 from pg_timezone_names where name = p_timezone)
    or char_length(coalesce(p_schedule_note, '')) > 1000 then
    raise exception using errcode = '22023', message = 'Invalid schedule';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));

  update public.profiles
  set timezone = p_timezone,
      updated_at = now()
  where id = auth.uid();

  if not found then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;

  update public.user_movies
  set status = 'scheduled',
      queue_position = null,
      scheduled_for = p_scheduled_for,
      schedule_note = nullif(btrim(p_schedule_note), ''),
      updated_at = now()
  where id = p_library_id
    and user_id = auth.uid();

  if not found then
    return false;
  end if;

  perform public.watchflow_normalize_queue();
  return true;
end;
$$;

create or replace function public.watchflow_remove_library_movie(
  p_library_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));

  delete from public.user_movies
  where id = p_library_id
    and user_id = auth.uid();

  if not found then
    return false;
  end if;

  perform public.watchflow_normalize_queue();
  return true;
end;
$$;

revoke all on function public.watchflow_normalize_queue() from public, anon;
revoke all on function public.watchflow_update_library_movie(
  uuid, text, numeric, text, smallint, boolean, timestamptz, timestamptz, text, text
) from public, anon;
revoke all on function public.watchflow_move_queue_item(uuid, text) from public, anon;
revoke all on function public.watchflow_schedule_movie(uuid, timestamptz, text, text) from public, anon;
revoke all on function public.watchflow_remove_library_movie(uuid) from public, anon;

grant execute on function public.watchflow_normalize_queue() to authenticated;
grant execute on function public.watchflow_update_library_movie(
  uuid, text, numeric, text, smallint, boolean, timestamptz, timestamptz, text, text
) to authenticated;
grant execute on function public.watchflow_move_queue_item(uuid, text) to authenticated;
grant execute on function public.watchflow_schedule_movie(uuid, timestamptz, text, text) to authenticated;
grant execute on function public.watchflow_remove_library_movie(uuid) to authenticated;

commit;
