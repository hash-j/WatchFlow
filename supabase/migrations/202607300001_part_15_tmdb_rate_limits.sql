begin;

-- A shared movie row is cache-safe only when its TMDB adult classification
-- and the locale used to fetch its metadata are both known. Existing rows stay
-- NULL and must be refreshed through authenticated server logic before reuse.
alter table public.movies
  add column if not exists tmdb_adult boolean,
  add column if not exists metadata_language text;

comment on column public.movies.tmdb_adult is
  'TMDB adult classification captured when this shared metadata was refreshed.';
comment on column public.movies.metadata_language is
  'TMDB locale used for this shared metadata refresh, such as en or en-US.';

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.movies'::regclass
      and conname = 'movies_metadata_language_check'
  ) then
    alter table public.movies
      add constraint movies_metadata_language_check
      check (
        metadata_language is null
        or metadata_language ~ '^[a-z]{2}(-[A-Z]{2})?$'
      );
  end if;
end;
$$;

-- Shared metadata is readable by signed-in users but writable only through the
-- server-only secret-key client. Clear both table- and column-level browser
-- grants because a table-level REVOKE does not remove older column grants.
revoke all privileges on table public.movies
  from public, anon, authenticated;

do $$
declare
  v_columns text;
begin
  select pg_catalog.string_agg(
    pg_catalog.format('%I', attributes.attname),
    ', '
    order by attributes.attnum
  )
  into v_columns
  from pg_catalog.pg_attribute as attributes
  where attributes.attrelid = 'public.movies'::regclass
    and attributes.attnum > 0
    and not attributes.attisdropped;

  if v_columns is not null then
    execute pg_catalog.format(
      'revoke select (%1$s), insert (%1$s), update (%1$s), references (%1$s)
       on table public.movies from public, anon, authenticated',
      v_columns
    );
  end if;
end;
$$;

grant select on table public.movies to authenticated;

-- A default of scheduled cannot supply the required instant and timezone when
-- watchflow_add_user_movie() runs. Repair existing preferences before narrowing
-- the allowed defaults so new library rows cannot be schedule-less schedules.
update public.user_preferences
set default_movie_status = 'want_to_watch'
where default_movie_status = 'scheduled';

alter table public.user_preferences
  drop constraint if exists user_preferences_default_movie_status_check;

alter table public.user_preferences
  add constraint user_preferences_default_movie_status_check
  check (
    default_movie_status in (
      'want_to_watch',
      'watch_next',
      'currently_watching',
      'watched',
      'on_hold',
      'dropped'
    )
  );

-- Replace the management functions so the primary mutation, queue compaction,
-- timezone persistence, and profile-timezone update commit or roll back as one
-- transaction. Both functions derive ownership exclusively from auth.uid().
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
  v_user_id uuid := (select auth.uid());
  v_current_status text;
  v_queue_position integer;
begin
  if v_user_id is null then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  select status
  into v_current_status
  from public.user_movies
  where id = p_library_id
    and user_id = v_user_id
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
    raise exception using
      errcode = '22023',
      message = 'Invalid movie status';
  end if;

  if p_personal_rating is not null
    and (p_personal_rating < 0 or p_personal_rating > 10) then
    raise exception using
      errcode = '22023',
      message = 'Invalid personal rating';
  end if;

  if p_priority < 0 or p_priority > 5 then
    raise exception using errcode = '22023', message = 'Invalid priority';
  end if;

  if pg_catalog.char_length(coalesce(p_review, '')) > 5000
    or pg_catalog.char_length(coalesce(p_schedule_note, '')) > 1000 then
    raise exception using errcode = '22023', message = 'Text value is too long';
  end if;

  if p_status = 'scheduled' then
    if p_scheduled_for is null
      or p_timezone is null
      or not exists (
        select 1
        from pg_catalog.pg_timezone_names
        where name = p_timezone
      ) then
      raise exception using errcode = '22023', message = 'Invalid schedule';
    end if;

    update public.profiles
    set timezone = p_timezone,
        updated_at = pg_catalog.now()
    where id = v_user_id;

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
        and user_id = v_user_id;
    else
      select coalesce(pg_catalog.max(queue_position), 0) + 1
      into v_queue_position
      from public.user_movies
      where user_id = v_user_id
        and status = 'watch_next';
    end if;
  else
    v_queue_position := null;
  end if;

  update public.user_movies
  set status = p_status,
      personal_rating = p_personal_rating,
      review = nullif(pg_catalog.btrim(p_review), ''),
      priority = p_priority,
      would_watch_again = p_would_watch_again,
      watched_at = p_watched_at,
      queue_position = v_queue_position,
      scheduled_for = case
        when p_status = 'scheduled' then p_scheduled_for
        else null
      end,
      schedule_timezone = case
        when p_status = 'scheduled' then p_timezone
        else null
      end,
      schedule_note = case
        when p_status = 'scheduled'
          then nullif(pg_catalog.btrim(p_schedule_note), '')
        else null
      end,
      updated_at = pg_catalog.now()
  where id = p_library_id
    and user_id = v_user_id;

  perform public.watchflow_normalize_queue();
  return true;
end;
$$;

comment on function public.watchflow_update_library_movie(
  uuid, text, numeric, text, smallint, boolean, timestamptz, timestamptz,
  text, text
) is
  'Atomically updates one owned movie, schedule metadata, and queue positions.';

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
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    return false;
  end if;

  if p_scheduled_for is null
    or p_timezone is null
    or not exists (
      select 1
      from pg_catalog.pg_timezone_names
      where name = p_timezone
    )
    or pg_catalog.char_length(coalesce(p_schedule_note, '')) > 1000 then
    raise exception using errcode = '22023', message = 'Invalid schedule';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  perform 1
  from public.user_movies
  where id = p_library_id
    and user_id = v_user_id
  for update;

  if not found then
    return false;
  end if;

  update public.profiles
  set timezone = p_timezone,
      updated_at = pg_catalog.now()
  where id = v_user_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;

  update public.user_movies
  set status = 'scheduled',
      queue_position = null,
      scheduled_for = p_scheduled_for,
      schedule_timezone = p_timezone,
      schedule_note = nullif(pg_catalog.btrim(p_schedule_note), ''),
      updated_at = pg_catalog.now()
  where id = p_library_id
    and user_id = v_user_id;

  perform public.watchflow_normalize_queue();
  return true;
end;
$$;

comment on function public.watchflow_schedule_movie(
  uuid, timestamptz, text, text
) is
  'Atomically schedules one owned movie, persists timezone, and compacts queue positions.';

revoke all on function public.watchflow_update_library_movie(
  uuid, text, numeric, text, smallint, boolean, timestamptz, timestamptz,
  text, text
) from public, anon;
grant execute on function public.watchflow_update_library_movie(
  uuid, text, numeric, text, smallint, boolean, timestamptz, timestamptz,
  text, text
) to authenticated;

revoke all on function public.watchflow_schedule_movie(
  uuid, timestamptz, text, text
) from public, anon;
grant execute on function public.watchflow_schedule_movie(
  uuid, timestamptz, text, text
) to authenticated;

-- This table is an internal implementation detail. Authenticated callers use
-- only the hardened function below; no browser role receives direct table
-- privileges and no RLS policy exposes its rows.
create table public.watchflow_tmdb_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  window_started_at timestamptz not null,
  request_count integer not null,
  updated_at timestamptz not null default now(),
  constraint watchflow_tmdb_rate_limits_pkey
    primary key (user_id, operation),
  constraint watchflow_tmdb_rate_limits_operation_check
    check (
      operation in (
        'search',
        'details',
        'import_search',
        'import_details'
      )
    ),
  constraint watchflow_tmdb_rate_limits_request_count_check
    check (request_count >= 0)
);

comment on table public.watchflow_tmdb_rate_limits is
  'Internal fixed-window counters for authenticated TMDB-backed operations.';
comment on column public.watchflow_tmdb_rate_limits.operation is
  'Hardcoded server operation bucket; never a provider URL or credential.';

alter table public.watchflow_tmdb_rate_limits enable row level security;

revoke all on table public.watchflow_tmdb_rate_limits
  from public, anon, authenticated;

create or replace function public.watchflow_take_tmdb_rate_limit(
  p_operation text,
  p_cost integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_limit integer;
  v_window_seconds integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_window_started_at timestamptz;
  v_current_count integer;
  v_new_count integer;
  v_remaining integer;
  v_retry_after_seconds integer := 0;
  v_allowed boolean := false;
  v_row_found boolean := false;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  case p_operation
    when 'search' then
      v_limit := 30;
      v_window_seconds := 60;
    when 'details' then
      v_limit := 20;
      v_window_seconds := 60;
    when 'import_search' then
      v_limit := 120;
      v_window_seconds := 600;
    when 'import_details' then
      v_limit := 120;
      v_window_seconds := 600;
    else
      raise exception using
        errcode = '22023',
        message = 'Invalid TMDB rate-limit operation';
  end case;

  if p_cost is null or p_cost < 1 or p_cost > v_limit then
    raise exception using
      errcode = '22023',
      message = 'Invalid TMDB rate-limit cost';
  end if;

  -- Serialize one authenticated user's operation bucket. This protects both
  -- first-row creation and later increments across concurrent server workers.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'watchflow:tmdb-rate-limit:'
        || v_user_id::text
        || ':'
        || p_operation,
      0
    )
  );

  select
    rate_limit.window_started_at,
    rate_limit.request_count
  into
    v_window_started_at,
    v_current_count
  from public.watchflow_tmdb_rate_limits as rate_limit
  where rate_limit.user_id = v_user_id
    and rate_limit.operation = p_operation
  for update;

  v_row_found := found;

  if not v_row_found then
    v_window_started_at := v_now;
    v_new_count := p_cost;

    insert into public.watchflow_tmdb_rate_limits (
      user_id,
      operation,
      window_started_at,
      request_count,
      updated_at
    )
    values (
      v_user_id,
      p_operation,
      v_window_started_at,
      v_new_count,
      v_now
    );

    v_allowed := true;
  elsif
    v_window_started_at
      + pg_catalog.make_interval(secs => v_window_seconds) <= v_now
  then
    v_window_started_at := v_now;
    v_new_count := p_cost;

    update public.watchflow_tmdb_rate_limits
    set window_started_at = v_window_started_at,
        request_count = v_new_count,
        updated_at = v_now
    where user_id = v_user_id
      and operation = p_operation;

    v_allowed := true;
  elsif v_current_count + p_cost <= v_limit then
    v_new_count := v_current_count + p_cost;

    update public.watchflow_tmdb_rate_limits
    set request_count = v_new_count,
        updated_at = v_now
    where user_id = v_user_id
      and operation = p_operation;

    v_allowed := true;
  else
    v_new_count := v_current_count;
    v_retry_after_seconds := greatest(
      1,
      pg_catalog.ceil(
        extract(
          epoch from (
            v_window_started_at
              + pg_catalog.make_interval(secs => v_window_seconds)
              - v_now
          )
        )
      )::integer
    );
  end if;

  v_remaining := greatest(v_limit - v_new_count, 0);

  return pg_catalog.jsonb_build_object(
    'allowed', v_allowed,
    'remaining', v_remaining,
    'retry_after_seconds', v_retry_after_seconds,
    'limit', v_limit,
    'window_seconds', v_window_seconds
  );
end;
$$;

comment on function public.watchflow_take_tmdb_rate_limit(text, integer) is
  'Atomically consumes an authenticated user TMDB operation allowance.';

revoke all on function public.watchflow_take_tmdb_rate_limit(text, integer)
  from public, anon, authenticated;
grant execute on function public.watchflow_take_tmdb_rate_limit(text, integer)
  to authenticated;

commit;
