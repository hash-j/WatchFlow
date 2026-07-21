begin;

alter table public.user_movies
  add column if not exists schedule_timezone text,
  add column if not exists schedule_note text;

comment on column public.user_movies.schedule_timezone is
  'IANA timezone used to enter and display the scheduled local time.';
comment on column public.user_movies.schedule_note is
  'Optional private note for the scheduled viewing.';

-- Normalize existing data before enforcing one sequential position per user.
do $$
declare
  v_user_id uuid;
  v_queue_ids uuid[];
  v_library_id uuid;
  v_position integer;
begin
  for v_user_id in
    select distinct user_id from public.user_movies
  loop
    select coalesce(
      array_agg(id order by queue_position asc nulls last, created_at asc, id asc),
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

    v_position := 0;
    foreach v_library_id in array v_queue_ids
    loop
      v_position := v_position + 1;
      update public.user_movies
      set queue_position = v_position
      where id = v_library_id
        and user_id = v_user_id;
    end loop;
  end loop;
end;
$$;

create unique index if not exists user_movies_unique_watch_queue_position
  on public.user_movies (user_id, queue_position)
  where status = 'watch_next' and queue_position is not null;

create index if not exists user_movies_schedule_idx
  on public.user_movies (user_id, scheduled_for)
  where status = 'scheduled' and scheduled_for is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_movies'::regclass
      and conname = 'user_movies_schedule_note_length'
  ) then
    alter table public.user_movies
      add constraint user_movies_schedule_note_length
      check (schedule_note is null or char_length(schedule_note) <= 1000);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_movies'::regclass
      and conname = 'user_movies_queue_position_positive'
  ) then
    alter table public.user_movies
      add constraint user_movies_queue_position_positive
      check (queue_position is null or queue_position > 0);
  end if;
end;
$$;

alter table public.user_movies enable row level security;

-- These policies are deliberately ownership-only. Existing policies are not
-- removed or broadened by this migration.
create policy watchflow_user_movies_select_own
  on public.user_movies
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy watchflow_user_movies_update_own
  on public.user_movies
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.move_watch_queue_item(
  p_user_movie_id uuid,
  p_direction text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_queue_ids uuid[];
  v_current_index integer;
  v_target_index integer;
  v_temporary_id uuid;
  v_library_id uuid;
  v_position integer := 0;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if p_direction not in ('up', 'down') then
    raise exception using errcode = '22023', message = 'Invalid queue direction';
  end if;

  -- Serialize all queue changes for this user, including concurrent requests.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  perform 1
  from public.user_movies
  where user_id = v_user_id
    and status = 'watch_next'
  order by queue_position asc nulls last, created_at asc, id asc
  for update;

  select coalesce(
    array_agg(id order by queue_position asc nulls last, created_at asc, id asc),
    array[]::uuid[]
  )
  into v_queue_ids
  from public.user_movies
  where user_id = v_user_id
    and status = 'watch_next';

  v_current_index := array_position(v_queue_ids, p_user_movie_id);

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

  if v_target_index < 1 or v_target_index > cardinality(v_queue_ids) then
    return jsonb_build_object(
      'success', true,
      'moved', false,
      'position', v_current_index
    );
  end if;

  v_temporary_id := v_queue_ids[v_target_index];
  v_queue_ids[v_target_index] := v_queue_ids[v_current_index];
  v_queue_ids[v_current_index] := v_temporary_id;

  -- Clearing first is conflict-safe even when a unique queue index exists.
  update public.user_movies
  set queue_position = null
  where user_id = v_user_id
    and queue_position is not null;

  foreach v_library_id in array v_queue_ids
  loop
    v_position := v_position + 1;
    update public.user_movies
    set queue_position = v_position,
        updated_at = now()
    where id = v_library_id
      and user_id = v_user_id
      and status = 'watch_next';
  end loop;

  return jsonb_build_object(
    'success', true,
    'moved', true,
    'position', v_target_index
  );
end;
$$;

revoke all on function public.move_watch_queue_item(uuid, text)
  from public, anon;
grant execute on function public.move_watch_queue_item(uuid, text)
  to authenticated;

commit;
