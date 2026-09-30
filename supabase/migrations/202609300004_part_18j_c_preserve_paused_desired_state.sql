begin;

create or replace function public.watchflow_enqueue_calendar_sync(
  p_connection_id uuid,
  p_user_movie_id uuid,
  p_force_delete boolean default false,
  p_cleanup boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection public.calendar_connections%rowtype;
  v_source_key text;
  v_user_id uuid;
  v_status text;
  v_scheduled_for timestamptz;
  v_schedule_timezone text;
  v_movie_title text;
  v_runtime_minutes integer;
  v_operation text;
  v_source_version text;
  v_has_existing boolean;
  v_job_id uuid;
begin
  select connection_row.* into v_connection
  from public.calendar_connections as connection_row
  where connection_row.id = p_connection_id;

  if not found then
    return;
  end if;

  v_source_key := public.watchflow_calendar_source_key(
    p_connection_id,
    p_user_movie_id
  );

  select
    owned_movie.user_id,
    owned_movie.status,
    owned_movie.scheduled_for,
    owned_movie.schedule_timezone,
    movie.title,
    movie.runtime_minutes
  into
    v_user_id,
    v_status,
    v_scheduled_for,
    v_schedule_timezone,
    v_movie_title,
    v_runtime_minutes
  from public.user_movies as owned_movie
  join public.movies as movie on movie.id = owned_movie.movie_id
  where owned_movie.id = p_user_movie_id
    and owned_movie.user_id = v_connection.user_id;

  select exists (
    select 1 from public.calendar_event_mappings as mapping
    where mapping.connection_id = p_connection_id
      and mapping.source_key = v_source_key
    union all
    select 1 from public.calendar_sync_jobs as existing_job
    where existing_job.connection_id = p_connection_id
      and existing_job.source_key = v_source_key
  ) into v_has_existing;

  if not p_force_delete
     and not p_cleanup
     and v_user_id is not null
     and v_status = 'scheduled'
     and v_scheduled_for is not null
     and v_schedule_timezone is not null
     and v_connection.status in ('connected', 'reconnect_required') then
    v_operation := 'upsert';
    v_source_version := public.watchflow_calendar_upsert_version(
      v_source_key,
      v_scheduled_for,
      v_schedule_timezone,
      v_movie_title,
      coalesce(v_runtime_minutes, 120)
    );
  elsif v_has_existing then
    v_operation := case when p_cleanup then 'connection_cleanup' else 'delete' end;
    v_source_version := public.watchflow_calendar_delete_version(v_source_key);
  else
    return;
  end if;

  v_job_id := public.watchflow_part18j_uuid(
    'calendar-sync-job',
    p_connection_id::text || ':' || v_source_key
  );

  insert into public.calendar_sync_jobs (
    id, user_id, connection_id, source_key, user_movie_id,
    desired_operation, source_version, state, attempt_count,
    available_at, lease_token, lease_expires_at, provider_status_code,
    error_code, completed_at
  ) values (
    v_job_id, v_connection.user_id, p_connection_id, v_source_key,
    case when v_operation = 'upsert' then p_user_movie_id else null end,
    v_operation, v_source_version,
    case when v_connection.status = 'reconnect_required'
      then 'auth_required' else 'pending' end,
    0, pg_catalog.now(), null, null, null,
    case when v_connection.status = 'reconnect_required'
      then 'provider_reconnect_required' else null end,
    case when v_connection.status = 'reconnect_required'
      then pg_catalog.now() else null end
  )
  on conflict on constraint calendar_sync_jobs_connection_source_key
  do update set
    user_id = excluded.user_id,
    user_movie_id = excluded.user_movie_id,
    desired_operation = excluded.desired_operation,
    source_version = excluded.source_version,
    state = case
      when public.calendar_sync_jobs.desired_operation = excluded.desired_operation
       and public.calendar_sync_jobs.source_version = excluded.source_version
        then public.calendar_sync_jobs.state
      else excluded.state
    end,
    attempt_count = case
      when public.calendar_sync_jobs.desired_operation = excluded.desired_operation
       and public.calendar_sync_jobs.source_version = excluded.source_version
        then public.calendar_sync_jobs.attempt_count
      else 0
    end,
    available_at = case
      when public.calendar_sync_jobs.desired_operation = excluded.desired_operation
       and public.calendar_sync_jobs.source_version = excluded.source_version
        then public.calendar_sync_jobs.available_at
      else pg_catalog.now()
    end,
    lease_token = case
      when public.calendar_sync_jobs.desired_operation = excluded.desired_operation
       and public.calendar_sync_jobs.source_version = excluded.source_version
        then public.calendar_sync_jobs.lease_token
      else null
    end,
    lease_expires_at = case
      when public.calendar_sync_jobs.desired_operation = excluded.desired_operation
       and public.calendar_sync_jobs.source_version = excluded.source_version
        then public.calendar_sync_jobs.lease_expires_at
      else null
    end,
    provider_status_code = case
      when public.calendar_sync_jobs.desired_operation = excluded.desired_operation
       and public.calendar_sync_jobs.source_version = excluded.source_version
        then public.calendar_sync_jobs.provider_status_code
      else null
    end,
    error_code = case
      when public.calendar_sync_jobs.desired_operation = excluded.desired_operation
       and public.calendar_sync_jobs.source_version = excluded.source_version
        then public.calendar_sync_jobs.error_code
      else excluded.error_code
    end,
    completed_at = case
      when public.calendar_sync_jobs.desired_operation = excluded.desired_operation
       and public.calendar_sync_jobs.source_version = excluded.source_version
        then public.calendar_sync_jobs.completed_at
      else excluded.completed_at
    end;
end;
$$;

comment on function public.watchflow_enqueue_calendar_sync(
  uuid, uuid, boolean, boolean
) is
  'Internal desired-state coalescer that preserves eligible upserts while delivery is paused.';

revoke execute on function public.watchflow_enqueue_calendar_sync(
  uuid, uuid, boolean, boolean
)
  from public, anon, authenticated, service_role;

commit;
