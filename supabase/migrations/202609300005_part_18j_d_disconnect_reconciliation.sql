begin;

-- Reconnecting while cleanup is pending may replace the credential only for
-- the same Google subject. Cleanup remains authoritative and no ordinary
-- calendar upsert work is resurrected.
create or replace function public.watchflow_upsert_google_calendar_connection(
  p_user_id uuid,
  p_provider_subject text,
  p_display_email text,
  p_granted_scopes text[],
  p_refresh_token_ciphertext bytea,
  p_refresh_token_nonce bytea,
  p_refresh_token_auth_tag bytea,
  p_encryption_key_version smallint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection public.calendar_connections%rowtype;
  v_connection_id uuid;
begin
  select connection_row.* into v_connection
  from public.calendar_connections as connection_row
  where connection_row.user_id = p_user_id
    and connection_row.provider = 'google'
  for update;

  if v_connection.id is not null
     and v_connection.status = 'disconnect_pending' then
    if v_connection.provider_subject <> p_provider_subject then
      raise exception using
        errcode = '22023',
        message = 'Calendar cleanup must be reauthorized with the same Google account';
    end if;

    update public.calendar_connections as pending_connection
    set display_email = p_display_email,
        granted_scopes = p_granted_scopes,
        sync_enabled = false,
        status = 'disconnect_pending',
        updated_at = pg_catalog.now(),
        last_error_code = null,
        last_error_at = null
    where pending_connection.id = v_connection.id;

    v_connection_id := v_connection.id;

    update public.calendar_sync_jobs as cleanup_job
    set state = 'pending', attempt_count = 0,
        available_at = pg_catalog.now(), lease_token = null,
        lease_expires_at = null, provider_status_code = null,
        error_code = null, completed_at = null
    where cleanup_job.connection_id = v_connection.id
      and cleanup_job.desired_operation = 'connection_cleanup'
      and cleanup_job.state = 'auth_required';
  else
    insert into public.calendar_connections (
      user_id, provider, provider_subject, display_email,
      provider_calendar_id, sync_enabled, status, granted_scopes,
      connected_at, updated_at, last_error_code, last_error_at
    ) values (
      p_user_id, 'google', p_provider_subject, p_display_email,
      'primary', true, 'connected', p_granted_scopes,
      pg_catalog.now(), pg_catalog.now(), null, null
    )
    on conflict (user_id, provider) do update set
      provider_subject = excluded.provider_subject,
      display_email = excluded.display_email,
      provider_calendar_id = 'primary',
      sync_enabled = true,
      status = 'connected',
      granted_scopes = excluded.granted_scopes,
      connected_at = pg_catalog.now(),
      updated_at = pg_catalog.now(),
      last_error_code = null,
      last_error_at = null
    returning id into v_connection_id;
  end if;

  insert into public.calendar_credentials (
    connection_id, refresh_token_ciphertext, refresh_token_nonce,
    refresh_token_auth_tag, encryption_key_version
  ) values (
    v_connection_id, p_refresh_token_ciphertext, p_refresh_token_nonce,
    p_refresh_token_auth_tag, p_encryption_key_version
  )
  on conflict (connection_id) do update set
    refresh_token_ciphertext = excluded.refresh_token_ciphertext,
    refresh_token_nonce = excluded.refresh_token_nonce,
    refresh_token_auth_tag = excluded.refresh_token_auth_tag,
    encryption_key_version = excluded.encryption_key_version,
    updated_at = pg_catalog.now();

  return v_connection_id;
end;
$$;

-- Disconnect becomes a desired-state transition. Credentials and mappings
-- remain available until exact provider-event deletion has converged.
create or replace function public.watchflow_disconnect_google_calendar_connection(
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection_id uuid;
  v_mapping record;
  v_job_id uuid;
begin
  select connection_row.id into v_connection_id
  from public.calendar_connections as connection_row
  where connection_row.user_id = p_user_id
    and connection_row.provider = 'google'
  for update;

  if v_connection_id is null then
    return true;
  end if;

  update public.calendar_connections as disconnecting_connection
  set sync_enabled = false,
      status = 'disconnect_pending',
      updated_at = pg_catalog.now(),
      last_error_code = case
        when disconnecting_connection.status = 'disconnect_pending'
          then disconnecting_connection.last_error_code
        else null
      end,
      last_error_at = case
        when disconnecting_connection.status = 'disconnect_pending'
          then disconnecting_connection.last_error_at
        else null
      end
  where disconnecting_connection.id = v_connection_id;

  for v_mapping in
    select cleanup_source.source_key, cleanup_source.user_id
    from (
      select mapping.source_key, mapping.user_id
      from public.calendar_event_mappings as mapping
      where mapping.connection_id = v_connection_id
      union
      select existing_job.source_key, existing_job.user_id
      from public.calendar_sync_jobs as existing_job
      where existing_job.connection_id = v_connection_id
    ) as cleanup_source
    order by cleanup_source.source_key
  loop
    update public.calendar_event_mappings as pending_mapping
    set sync_state = 'delete_pending', updated_at = pg_catalog.now()
    where pending_mapping.connection_id = v_connection_id
      and pending_mapping.source_key = v_mapping.source_key;

    v_job_id := public.watchflow_part18j_uuid(
      'calendar-sync-job',
      v_connection_id::text || ':' || v_mapping.source_key
    );

    insert into public.calendar_sync_jobs (
      id, user_id, connection_id, source_key, user_movie_id,
      desired_operation, source_version, state, attempt_count,
      available_at, lease_token, lease_expires_at,
      provider_status_code, error_code, completed_at
    ) values (
      v_job_id, v_mapping.user_id, v_connection_id, v_mapping.source_key,
      null, 'connection_cleanup',
      public.watchflow_calendar_delete_version(v_mapping.source_key),
      'pending', 0, pg_catalog.now(), null, null, null, null, null
    )
    on conflict on constraint calendar_sync_jobs_connection_source_key
    do update set
      user_id = excluded.user_id,
      user_movie_id = null,
      desired_operation = 'connection_cleanup',
      source_version = excluded.source_version,
      state = case
        when public.calendar_sync_jobs.desired_operation = 'connection_cleanup'
         and public.calendar_sync_jobs.source_version = excluded.source_version
          then public.calendar_sync_jobs.state
        else 'pending'
      end,
      attempt_count = case
        when public.calendar_sync_jobs.desired_operation = 'connection_cleanup'
         and public.calendar_sync_jobs.source_version = excluded.source_version
          then public.calendar_sync_jobs.attempt_count
        else 0
      end,
      available_at = case
        when public.calendar_sync_jobs.desired_operation = 'connection_cleanup'
         and public.calendar_sync_jobs.source_version = excluded.source_version
          then public.calendar_sync_jobs.available_at
        when public.calendar_sync_jobs.state = 'leased'
          then greatest(
            pg_catalog.now(),
            public.calendar_sync_jobs.lease_expires_at
          )
        else pg_catalog.now()
      end,
      lease_token = case
        when public.calendar_sync_jobs.desired_operation = 'connection_cleanup'
         and public.calendar_sync_jobs.source_version = excluded.source_version
          then public.calendar_sync_jobs.lease_token
        else null
      end,
      lease_expires_at = case
        when public.calendar_sync_jobs.desired_operation = 'connection_cleanup'
         and public.calendar_sync_jobs.source_version = excluded.source_version
          then public.calendar_sync_jobs.lease_expires_at
        else null
      end,
      provider_status_code = case
        when public.calendar_sync_jobs.desired_operation = 'connection_cleanup'
         and public.calendar_sync_jobs.source_version = excluded.source_version
          then public.calendar_sync_jobs.provider_status_code
        else null
      end,
      error_code = case
        when public.calendar_sync_jobs.desired_operation = 'connection_cleanup'
         and public.calendar_sync_jobs.source_version = excluded.source_version
          then public.calendar_sync_jobs.error_code
        else null
      end,
      completed_at = case
        when public.calendar_sync_jobs.desired_operation = 'connection_cleanup'
         and public.calendar_sync_jobs.source_version = excluded.source_version
          then public.calendar_sync_jobs.completed_at
        else null
      end;
  end loop;

  if not exists (
    select 1 from public.calendar_sync_jobs as cleanup_job
    where cleanup_job.connection_id = v_connection_id
      and cleanup_job.desired_operation = 'connection_cleanup'
  ) then
    delete from public.calendar_connections as empty_connection
    where empty_connection.id = v_connection_id
      and empty_connection.user_id = p_user_id
      and empty_connection.status = 'disconnect_pending';
  end if;

  return true;
end;
$$;

create or replace function public.watchflow_claim_calendar_sync_jobs(
  p_batch_size integer default 10,
  p_lease_seconds integer default 120
)
returns table (
  job_id uuid, connection_id uuid, owner_id uuid, source_key text,
  desired_operation text, source_version text, lease_token uuid,
  provider text, provider_calendar_id text, provider_event_id text,
  user_movie_id uuid, movie_id bigint, movie_title text,
  runtime_minutes integer, scheduled_for timestamptz,
  schedule_timezone text, refresh_token_ciphertext bytea,
  refresh_token_nonce bytea, refresh_token_auth_tag bytea,
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
    raise exception using errcode = '22023', message = 'Invalid calendar claim bounds';
  end if;

  for v_job in
    select candidate.*
    from public.calendar_sync_jobs as candidate
    where candidate.available_at <= pg_catalog.now()
      and candidate.attempt_count < candidate.attempt_limit
      and (
        candidate.state in ('pending', 'retryable')
        or (candidate.state = 'leased' and candidate.lease_expires_at <= pg_catalog.now())
      )
      and exists (
        select 1 from public.calendar_connections as eligible_connection
        where eligible_connection.id = candidate.connection_id
          and eligible_connection.user_id = candidate.user_id
          and (
            (eligible_connection.status = 'connected'
              and eligible_connection.sync_enabled
              and candidate.desired_operation <> 'connection_cleanup')
            or eligible_connection.status = 'reconnect_required'
            or (eligible_connection.status = 'disconnect_pending'
              and candidate.desired_operation = 'connection_cleanup')
          )
      )
    order by candidate.available_at, candidate.created_at, candidate.id
    limit p_batch_size
    for update skip locked
  loop
    select connection_row.* into v_connection
    from public.calendar_connections as connection_row
    where connection_row.id = v_job.connection_id
      and connection_row.user_id = v_job.user_id
    for update;

    if v_job.desired_operation = 'connection_cleanup'
       and exists (
         select 1 from public.calendar_sync_jobs as active_cleanup
         where active_cleanup.connection_id = v_job.connection_id
           and active_cleanup.desired_operation = 'connection_cleanup'
           and active_cleanup.state = 'leased'
           and active_cleanup.lease_expires_at > pg_catalog.now()
           and active_cleanup.id <> v_job.id
       ) then
      continue;
    end if;

    select credential_row.* into v_credential
    from public.calendar_credentials as credential_row
    where credential_row.connection_id = v_job.connection_id;

    if v_connection.id is null or v_credential.connection_id is null then
      update public.calendar_sync_jobs as missing_dependency_job
      set state = 'auth_required', error_code = 'calendar_credentials_missing',
          completed_at = pg_catalog.now(), lease_token = null, lease_expires_at = null
      where missing_dependency_job.id = v_job.id;
      continue;
    end if;

    if v_connection.status = 'reconnect_required' then
      update public.calendar_sync_jobs as reconnect_job
      set state = 'auth_required', error_code = 'provider_reconnect_required',
          completed_at = pg_catalog.now(), lease_token = null, lease_expires_at = null
      where reconnect_job.id = v_job.id;
      continue;
    end if;

    v_movie_id := null; v_movie_title := null; v_runtime_minutes := null;
    v_scheduled_for := null; v_schedule_timezone := null;
    v_current_version := null; v_provider_event_id := null;

    if v_job.desired_operation = 'upsert' then
      select owned_movie.movie_id, movie.title,
             coalesce(movie.runtime_minutes, 120), owned_movie.scheduled_for,
             owned_movie.schedule_timezone
      into v_movie_id, v_movie_title, v_runtime_minutes,
           v_scheduled_for, v_schedule_timezone
      from public.user_movies as owned_movie
      join public.movies as movie on movie.id = owned_movie.movie_id
      where owned_movie.id = v_job.user_movie_id
        and owned_movie.user_id = v_job.user_id
        and owned_movie.status = 'scheduled'
        and owned_movie.scheduled_for is not null
        and owned_movie.schedule_timezone is not null;

      if found then
        v_current_version := public.watchflow_calendar_upsert_version(
          v_job.source_key, v_scheduled_for, v_schedule_timezone,
          v_movie_title, v_runtime_minutes
        );
      end if;

      if not v_connection.sync_enabled
         or v_connection.status <> 'connected'
         or v_current_version is distinct from v_job.source_version then
        update public.calendar_sync_jobs as stale_upsert_job
        set state = 'skipped', error_code = 'calendar_source_changed',
            completed_at = pg_catalog.now(), lease_token = null, lease_expires_at = null
        where stale_upsert_job.id = v_job.id;
        continue;
      end if;
    else
      select mapping.provider_event_id into v_provider_event_id
      from public.calendar_event_mappings as mapping
      where mapping.connection_id = v_job.connection_id
        and mapping.source_key = v_job.source_key;

      if not found and v_job.desired_operation = 'connection_cleanup' then
        v_provider_event_id := public.watchflow_calendar_provider_event_id(
          v_job.connection_id,
          v_job.source_key
        );
      elsif not found then
        update public.calendar_sync_jobs as absent_mapping_job
        set state = 'succeeded', error_code = 'calendar_event_already_absent',
            completed_at = pg_catalog.now(), lease_token = null, lease_expires_at = null
        where absent_mapping_job.id = v_job.id;

        if v_job.desired_operation = 'connection_cleanup'
           and not exists (
             select 1 from public.calendar_event_mappings as remaining_mapping
             where remaining_mapping.connection_id = v_job.connection_id
           ) then
          delete from public.calendar_connections as completed_connection
          where completed_connection.id = v_job.connection_id
            and completed_connection.status = 'disconnect_pending';
        end if;
        continue;
      end if;
    end if;

    if v_job.desired_operation <> 'upsert'
       and v_provider_event_id <> public.watchflow_calendar_provider_event_id(
         v_job.connection_id,
         v_job.source_key
       ) then
      update public.calendar_sync_jobs as invalid_identity_job
      set state = 'failed', error_code = 'calendar_mapping_identity_invalid',
          completed_at = pg_catalog.now(), lease_token = null,
          lease_expires_at = null
      where invalid_identity_job.id = v_job.id;

      update public.calendar_event_mappings as invalid_identity_mapping
      set sync_state = 'error', updated_at = pg_catalog.now()
      where invalid_identity_mapping.connection_id = v_job.connection_id
        and invalid_identity_mapping.source_key = v_job.source_key;

      update public.calendar_connections as invalid_identity_connection
      set last_error_code = 'calendar_mapping_identity_invalid',
          last_error_at = pg_catalog.now()
      where invalid_identity_connection.id = v_job.connection_id;
      continue;
    end if;

    if v_job.desired_operation = 'upsert' then
      select mapping.provider_event_id into v_provider_event_id
      from public.calendar_event_mappings as mapping
      where mapping.connection_id = v_job.connection_id
        and mapping.source_key = v_job.source_key;
      v_provider_event_id := coalesce(
        v_provider_event_id,
        public.watchflow_calendar_provider_event_id(v_job.connection_id, v_job.source_key)
      );
    end if;

    v_lease := gen_random_uuid();
    update public.calendar_sync_jobs as claimed_job
    set state = 'leased', attempt_count = claimed_job.attempt_count + 1,
        lease_token = v_lease,
        lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds),
        provider_status_code = null, error_code = null, completed_at = null
    where claimed_job.id = v_job.id;

    return query select v_job.id, v_job.connection_id, v_job.user_id,
      v_job.source_key, v_job.desired_operation, v_job.source_version,
      v_lease, v_connection.provider, v_connection.provider_calendar_id,
      v_provider_event_id, v_job.user_movie_id, v_movie_id, v_movie_title,
      v_runtime_minutes, v_scheduled_for, v_schedule_timezone,
      v_credential.refresh_token_ciphertext, v_credential.refresh_token_nonce,
      v_credential.refresh_token_auth_tag, v_credential.encryption_key_version;
  end loop;
end;
$$;

create or replace function public.watchflow_is_final_calendar_cleanup(
  p_job_id uuid,
  p_lease_token uuid,
  p_source_version text
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce((
    select not exists (
      select 1
      from public.calendar_event_mappings as other_mapping
      where other_mapping.connection_id = cleanup_job.connection_id
        and other_mapping.source_key <> cleanup_job.source_key
    )
    and not exists (
      select 1
      from public.calendar_sync_jobs as other_cleanup_job
      where other_cleanup_job.connection_id = cleanup_job.connection_id
        and other_cleanup_job.desired_operation = 'connection_cleanup'
        and other_cleanup_job.id <> cleanup_job.id
        and other_cleanup_job.state not in ('succeeded', 'skipped')
    )
    from public.calendar_sync_jobs as cleanup_job
    join public.calendar_connections as cleanup_connection
      on cleanup_connection.id = cleanup_job.connection_id
     and cleanup_connection.user_id = cleanup_job.user_id
     and cleanup_connection.status = 'disconnect_pending'
    where cleanup_job.id = p_job_id
      and cleanup_job.desired_operation = 'connection_cleanup'
      and cleanup_job.state = 'leased'
      and cleanup_job.lease_token = p_lease_token
      and cleanup_job.source_version = p_source_version
      and cleanup_job.lease_expires_at > pg_catalog.now()
  ), false)
$$;

create or replace function public.watchflow_finalize_calendar_sync_job(
  p_job_id uuid, p_lease_token uuid, p_source_version text,
  p_outcome text, p_provider_event_id text default null,
  p_provider_etag text default null,
  p_provider_status_code integer default null,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.calendar_sync_jobs%rowtype;
  v_retry_seconds integer;
begin
  if p_outcome not in ('succeeded', 'retryable', 'skipped', 'failed', 'auth_required')
     or (p_provider_status_code is not null and p_provider_status_code not between 100 and 599)
     or (p_error_code is not null and p_error_code !~ '^[a-z0-9_]{1,64}$')
     or (p_provider_event_id is not null and char_length(p_provider_event_id) not between 5 and 1024)
     or (p_provider_etag is not null and char_length(p_provider_etag) not between 1 and 1024) then
    raise exception using errcode = '22023', message = 'Invalid calendar finalization payload';
  end if;

  select exact_job.* into v_job
  from public.calendar_sync_jobs as exact_job
  where exact_job.id = p_job_id and exact_job.state = 'leased'
    and exact_job.lease_token = p_lease_token
    and exact_job.source_version = p_source_version
    and exact_job.lease_expires_at > pg_catalog.now()
  for update;
  if not found then return false; end if;

  if p_outcome = 'succeeded' then
    if v_job.desired_operation = 'connection_cleanup' then
      perform 1
      from public.calendar_connections as cleanup_connection
      where cleanup_connection.id = v_job.connection_id
        and cleanup_connection.user_id = v_job.user_id
        and cleanup_connection.status = 'disconnect_pending'
      for update;

      if not found then
        return false;
      end if;
    end if;

    if v_job.desired_operation = 'upsert' then
      if p_provider_event_id is null
         or p_provider_event_id <> public.watchflow_calendar_provider_event_id(
           v_job.connection_id, v_job.source_key
         ) then
        raise exception using errcode = '22023',
          message = 'Calendar upsert requires its deterministic event identifier';
      end if;
      insert into public.calendar_event_mappings (
        user_id, connection_id, source_key, user_movie_id,
        provider_calendar_id, provider_event_id, source_version,
        provider_etag, sync_state, synced_at
      )
      select v_job.user_id, v_job.connection_id, v_job.source_key,
        v_job.user_movie_id, connection_row.provider_calendar_id,
        p_provider_event_id, v_job.source_version, p_provider_etag,
        'synced', pg_catalog.now()
      from public.calendar_connections as connection_row
      where connection_row.id = v_job.connection_id
        and connection_row.user_id = v_job.user_id
      on conflict on constraint calendar_event_mappings_connection_source_key
      do update set user_id = excluded.user_id,
        user_movie_id = excluded.user_movie_id,
        provider_calendar_id = excluded.provider_calendar_id,
        provider_event_id = excluded.provider_event_id,
        source_version = excluded.source_version,
        provider_etag = excluded.provider_etag,
        sync_state = 'synced', synced_at = pg_catalog.now();
    else
      delete from public.calendar_event_mappings as deleted_mapping
      where deleted_mapping.connection_id = v_job.connection_id
        and deleted_mapping.source_key = v_job.source_key;
    end if;

    update public.calendar_sync_jobs as succeeded_job
    set state = 'succeeded', provider_status_code = p_provider_status_code,
        error_code = p_error_code, completed_at = pg_catalog.now(),
        lease_token = null, lease_expires_at = null
    where succeeded_job.id = v_job.id;

    update public.calendar_connections as successful_connection
    set last_successful_sync_at = pg_catalog.now(),
        last_error_code = null, last_error_at = null
    where successful_connection.id = v_job.connection_id;

    if v_job.desired_operation = 'connection_cleanup'
       and not exists (
         select 1 from public.calendar_event_mappings as remaining_mapping
         where remaining_mapping.connection_id = v_job.connection_id
       )
       and not exists (
         select 1 from public.calendar_sync_jobs as remaining_cleanup_job
         where remaining_cleanup_job.connection_id = v_job.connection_id
           and remaining_cleanup_job.desired_operation = 'connection_cleanup'
           and remaining_cleanup_job.id <> v_job.id
           and remaining_cleanup_job.state not in ('succeeded', 'skipped')
       ) then
      delete from public.calendar_connections as completed_connection
      where completed_connection.id = v_job.connection_id
        and completed_connection.user_id = v_job.user_id
        and completed_connection.status = 'disconnect_pending';
    end if;
    return true;
  end if;

  if p_outcome = 'retryable' and v_job.attempt_count < v_job.attempt_limit then
    v_retry_seconds := case v_job.attempt_count
      when 1 then 30 when 2 then 60 when 3 then 120 when 4 then 300 else 600 end;
    update public.calendar_sync_jobs as retry_job
    set state = 'retryable',
        available_at = pg_catalog.now() + pg_catalog.make_interval(secs => v_retry_seconds),
        provider_status_code = p_provider_status_code,
        error_code = coalesce(p_error_code, 'calendar_provider_retry'),
        completed_at = null, lease_token = null, lease_expires_at = null
    where retry_job.id = v_job.id;
  else
    update public.calendar_sync_jobs as terminal_job
    set state = case when p_outcome = 'retryable' then 'failed' else p_outcome end,
        provider_status_code = p_provider_status_code,
        error_code = case when p_outcome = 'retryable'
          then 'calendar_attempt_limit_exhausted' else p_error_code end,
        completed_at = pg_catalog.now(), lease_token = null, lease_expires_at = null
    where terminal_job.id = v_job.id;

    if p_outcome = 'auth_required'
       and v_job.desired_operation <> 'connection_cleanup' then
      update public.calendar_connections as auth_connection
      set status = 'reconnect_required',
          last_error_code = coalesce(p_error_code, 'provider_reconnect_required'),
          last_error_at = pg_catalog.now()
      where auth_connection.id = v_job.connection_id;
    end if;
  end if;

  if p_outcome in ('retryable', 'failed', 'auth_required') then
    update public.calendar_connections as failed_connection
    set last_error_code = coalesce(
          p_error_code,
          case when p_outcome = 'retryable'
            then 'calendar_provider_retry' else 'calendar_sync_failed' end
        ),
        last_error_at = pg_catalog.now()
    where failed_connection.id = v_job.connection_id;
  end if;
  return true;
end;
$$;

comment on function public.watchflow_disconnect_google_calendar_connection(uuid) is
  'Service-role-only idempotent transition to exact-event calendar disconnect cleanup.';
comment on function public.watchflow_claim_calendar_sync_jobs(integer, integer) is
  'Service-role-only bounded claim for normal sync or disconnect-pending exact-event cleanup.';
comment on function public.watchflow_is_final_calendar_cleanup(uuid, uuid, text) is
  'Service-role-only exact-lease predicate used to revoke Google access only after the final owned event cleanup.';
comment on function public.watchflow_finalize_calendar_sync_job(uuid, uuid, text, text, text, text, integer, text) is
  'Service-role-only exact-lease finalizer with mapping and disconnect lifecycle reconciliation.';

revoke execute on function public.watchflow_upsert_google_calendar_connection(
  uuid, text, text, text[], bytea, bytea, bytea, smallint
) from public, anon, authenticated, service_role;
revoke execute on function public.watchflow_disconnect_google_calendar_connection(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.watchflow_claim_calendar_sync_jobs(integer, integer)
  from public, anon, authenticated, service_role;
revoke execute on function public.watchflow_is_final_calendar_cleanup(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.watchflow_finalize_calendar_sync_job(
  uuid, uuid, text, text, text, text, integer, text
) from public, anon, authenticated, service_role;

grant execute on function public.watchflow_upsert_google_calendar_connection(
  uuid, text, text, text[], bytea, bytea, bytea, smallint
) to service_role;
grant execute on function public.watchflow_disconnect_google_calendar_connection(uuid)
  to service_role;
grant execute on function public.watchflow_claim_calendar_sync_jobs(integer, integer)
  to service_role;
grant execute on function public.watchflow_is_final_calendar_cleanup(uuid, uuid, text)
  to service_role;
grant execute on function public.watchflow_finalize_calendar_sync_job(
  uuid, uuid, text, text, text, text, integer, text
) to service_role;

commit;
