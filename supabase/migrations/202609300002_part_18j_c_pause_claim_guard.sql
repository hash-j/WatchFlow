begin;

create or replace function public.watchflow_claim_calendar_sync_jobs(
  p_batch_size integer default 10,
  p_lease_seconds integer default 120
)
returns table (
  job_id uuid,
  connection_id uuid,
  owner_id uuid,
  source_key text,
  desired_operation text,
  source_version text,
  lease_token uuid,
  provider text,
  provider_calendar_id text,
  provider_event_id text,
  user_movie_id uuid,
  movie_id bigint,
  movie_title text,
  runtime_minutes integer,
  scheduled_for timestamptz,
  schedule_timezone text,
  refresh_token_ciphertext bytea,
  refresh_token_nonce bytea,
  refresh_token_auth_tag bytea,
  encryption_key_version smallint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.calendar_sync_jobs%rowtype;
  v_lease uuid;
  v_current_version text;
  v_movie_id bigint;
  v_movie_title text;
  v_runtime_minutes integer;
  v_scheduled_for timestamptz;
  v_schedule_timezone text;
  v_provider_event_id text;
  v_connection public.calendar_connections%rowtype;
  v_credential public.calendar_credentials%rowtype;
begin
  if p_batch_size not between 1 and 25
     or p_lease_seconds not between 30 and 300 then
    raise exception using
      errcode = '22023', message = 'Invalid calendar claim bounds';
  end if;

  for v_job in
    select candidate.*
    from public.calendar_sync_jobs as candidate
    where candidate.available_at <= pg_catalog.now()
      and candidate.attempt_count < candidate.attempt_limit
      and (
        candidate.state in ('pending', 'retryable')
        or (
          candidate.state = 'leased'
          and candidate.lease_expires_at <= pg_catalog.now()
        )
      )
      and exists (
        select 1
        from public.calendar_connections as eligible_connection
        where eligible_connection.id = candidate.connection_id
          and eligible_connection.user_id = candidate.user_id
          and (
            eligible_connection.status = 'reconnect_required'
            or (
              eligible_connection.status = 'connected'
              and eligible_connection.sync_enabled
            )
          )
      )
    order by candidate.available_at, candidate.created_at, candidate.id
    limit p_batch_size
    for update skip locked
  loop
    select connection_row.* into v_connection
    from public.calendar_connections as connection_row
    where connection_row.id = v_job.connection_id
      and connection_row.user_id = v_job.user_id;

    select credential_row.* into v_credential
    from public.calendar_credentials as credential_row
    where credential_row.connection_id = v_job.connection_id;

    if v_connection.id is null or v_credential.connection_id is null then
      update public.calendar_sync_jobs as missing_dependency_job
      set state = 'auth_required', error_code = 'calendar_credentials_missing',
          completed_at = pg_catalog.now(), lease_token = null,
          lease_expires_at = null
      where missing_dependency_job.id = v_job.id;
      continue;
    end if;

    if v_connection.status = 'reconnect_required' then
      update public.calendar_sync_jobs as reconnect_job
      set state = 'auth_required', error_code = 'provider_reconnect_required',
          completed_at = pg_catalog.now(), lease_token = null,
          lease_expires_at = null
      where reconnect_job.id = v_job.id;
      continue;
    end if;

    v_movie_id := null;
    v_movie_title := null;
    v_runtime_minutes := null;
    v_scheduled_for := null;
    v_schedule_timezone := null;
    v_current_version := null;
    v_provider_event_id := null;

    if v_job.desired_operation = 'upsert' then
      select
        owned_movie.movie_id,
        movie.title,
        coalesce(movie.runtime_minutes, 120),
        owned_movie.scheduled_for,
        owned_movie.schedule_timezone
      into
        v_movie_id,
        v_movie_title,
        v_runtime_minutes,
        v_scheduled_for,
        v_schedule_timezone
      from public.user_movies as owned_movie
      join public.movies as movie on movie.id = owned_movie.movie_id
      where owned_movie.id = v_job.user_movie_id
        and owned_movie.user_id = v_job.user_id
        and owned_movie.status = 'scheduled'
        and owned_movie.scheduled_for is not null
        and owned_movie.schedule_timezone is not null;

      if found then
        v_current_version := public.watchflow_calendar_upsert_version(
          v_job.source_key,
          v_scheduled_for,
          v_schedule_timezone,
          v_movie_title,
          v_runtime_minutes
        );
      end if;

      if not v_connection.sync_enabled
         or v_connection.status <> 'connected'
         or v_current_version is distinct from v_job.source_version then
        update public.calendar_sync_jobs as stale_upsert_job
        set state = 'skipped', error_code = 'calendar_source_changed',
            completed_at = pg_catalog.now(), lease_token = null,
            lease_expires_at = null
        where stale_upsert_job.id = v_job.id;
        continue;
      end if;
    else
      select mapping.provider_event_id into v_provider_event_id
      from public.calendar_event_mappings as mapping
      where mapping.connection_id = v_job.connection_id
        and mapping.source_key = v_job.source_key;

      if not found then
        update public.calendar_sync_jobs as absent_mapping_job
        set state = 'succeeded', error_code = 'calendar_event_already_absent',
            completed_at = pg_catalog.now(), lease_token = null,
            lease_expires_at = null
        where absent_mapping_job.id = v_job.id;
        continue;
      end if;
    end if;

    if v_job.desired_operation = 'upsert' then
      select mapping.provider_event_id into v_provider_event_id
      from public.calendar_event_mappings as mapping
      where mapping.connection_id = v_job.connection_id
        and mapping.source_key = v_job.source_key;

      v_provider_event_id := coalesce(
        v_provider_event_id,
        public.watchflow_calendar_provider_event_id(
          v_job.connection_id,
          v_job.source_key
        )
      );
    end if;

    v_lease := gen_random_uuid();
    update public.calendar_sync_jobs as claimed_job
    set state = 'leased', attempt_count = claimed_job.attempt_count + 1,
        lease_token = v_lease,
        lease_expires_at = pg_catalog.now()
          + pg_catalog.make_interval(secs => p_lease_seconds),
        provider_status_code = null, error_code = null, completed_at = null
    where claimed_job.id = v_job.id;

    return query select
      v_job.id,
      v_job.connection_id,
      v_job.user_id,
      v_job.source_key,
      v_job.desired_operation,
      v_job.source_version,
      v_lease,
      v_connection.provider,
      v_connection.provider_calendar_id,
      v_provider_event_id,
      v_job.user_movie_id,
      v_movie_id,
      v_movie_title,
      v_runtime_minutes,
      v_scheduled_for,
      v_schedule_timezone,
      v_credential.refresh_token_ciphertext,
      v_credential.refresh_token_nonce,
      v_credential.refresh_token_auth_tag,
      v_credential.encryption_key_version;
  end loop;
end;
$$;

comment on function public.watchflow_claim_calendar_sync_jobs(integer, integer) is
  'Service-role-only bounded calendar job claim with exact leases, encrypted credential return, and paused/disconnecting connection exclusion.';

revoke execute on function public.watchflow_claim_calendar_sync_jobs(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.watchflow_claim_calendar_sync_jobs(integer, integer)
  to service_role;

commit;
