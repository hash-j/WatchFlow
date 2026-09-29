begin;

create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google',
  provider_subject text not null,
  display_email text not null,
  provider_calendar_id text not null default 'primary',
  sync_enabled boolean not null default false,
  status text not null default 'connected',
  granted_scopes text[] not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_successful_sync_at timestamptz,
  last_error_code text,
  last_error_at timestamptz,
  constraint calendar_connections_provider_check check (provider = 'google'),
  constraint calendar_connections_subject_check check (
    char_length(provider_subject) between 1 and 255
  ),
  constraint calendar_connections_email_check check (
    char_length(display_email) between 3 and 320
  ),
  constraint calendar_connections_calendar_id_check check (
    provider_calendar_id = 'primary'
  ),
  constraint calendar_connections_status_check check (
    status in ('connected', 'reconnect_required', 'disconnect_pending')
  ),
  constraint calendar_connections_scopes_check check (
    cardinality(granted_scopes) between 1 and 8
    and array_position(granted_scopes, null) is null
  ),
  constraint calendar_connections_error_check check (
    last_error_code is null
    or last_error_code ~ '^[a-z0-9_]{1,64}$'
  ),
  constraint calendar_connections_user_provider_key unique (user_id, provider),
  constraint calendar_connections_id_user_key unique (id, user_id)
);

comment on table public.calendar_connections is
  'Owner-readable Google Calendar connection metadata. Provider credentials are stored separately.';

create table public.calendar_credentials (
  connection_id uuid primary key
    references public.calendar_connections(id) on delete cascade,
  refresh_token_ciphertext bytea not null,
  refresh_token_nonce bytea not null,
  refresh_token_auth_tag bytea not null,
  encryption_key_version smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_credentials_ciphertext_check check (
    octet_length(refresh_token_ciphertext) between 1 and 8192
  ),
  constraint calendar_credentials_nonce_check check (
    octet_length(refresh_token_nonce) = 12
  ),
  constraint calendar_credentials_auth_tag_check check (
    octet_length(refresh_token_auth_tag) = 16
  ),
  constraint calendar_credentials_key_version_check check (
    encryption_key_version between 1 and 32767
  )
);

comment on table public.calendar_credentials is
  'Server-only encrypted Google OAuth refresh credentials. Access tokens are never persisted.';

create table public.calendar_event_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null,
  source_key text not null,
  user_movie_id uuid references public.user_movies(id) on delete set null,
  provider_calendar_id text not null default 'primary',
  provider_event_id text not null,
  source_version text not null,
  provider_etag text,
  sync_state text not null default 'synced',
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_event_mappings_connection_owner_fk
    foreign key (connection_id, user_id)
    references public.calendar_connections(id, user_id) on delete cascade,
  constraint calendar_event_mappings_source_key_check check (
    source_key ~ '^[a-f0-9]{32}$'
  ),
  constraint calendar_event_mappings_calendar_id_check check (
    provider_calendar_id = 'primary'
  ),
  constraint calendar_event_mappings_event_id_check check (
    char_length(provider_event_id) between 5 and 1024
  ),
  constraint calendar_event_mappings_source_version_check check (
    source_version ~ '^[a-f0-9]{32}$'
  ),
  constraint calendar_event_mappings_etag_check check (
    provider_etag is null or char_length(provider_etag) between 1 and 1024
  ),
  constraint calendar_event_mappings_state_check check (
    sync_state in ('synced', 'delete_pending', 'error')
  ),
  constraint calendar_event_mappings_connection_source_key
    unique (connection_id, source_key),
  constraint calendar_event_mappings_connection_calendar_event_key
    unique (connection_id, provider_calendar_id, provider_event_id)
);

comment on table public.calendar_event_mappings is
  'Owner-readable mapping between an opaque WatchFlow schedule source and one provider event. The source key survives user_movies deletion.';

create table public.calendar_sync_jobs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null,
  source_key text not null,
  user_movie_id uuid references public.user_movies(id) on delete set null,
  desired_operation text not null,
  source_version text not null,
  state text not null default 'pending',
  attempt_count integer not null default 0,
  attempt_limit integer not null default 5,
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  provider_status_code integer,
  error_code text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_sync_jobs_connection_owner_fk
    foreign key (connection_id, user_id)
    references public.calendar_connections(id, user_id) on delete cascade,
  constraint calendar_sync_jobs_source_key_check check (
    source_key ~ '^[a-f0-9]{32}$'
  ),
  constraint calendar_sync_jobs_operation_check check (
    desired_operation in ('upsert', 'delete', 'connection_cleanup')
  ),
  constraint calendar_sync_jobs_source_version_check check (
    source_version ~ '^[a-f0-9]{32}$'
  ),
  constraint calendar_sync_jobs_state_check check (
    state in (
      'pending', 'leased', 'retryable', 'succeeded', 'skipped',
      'failed', 'auth_required'
    )
  ),
  constraint calendar_sync_jobs_attempt_count_check check (
    attempt_count between 0 and attempt_limit
  ),
  constraint calendar_sync_jobs_attempt_limit_check check (
    attempt_limit between 1 and 10
  ),
  constraint calendar_sync_jobs_lease_check check (
    (state = 'leased' and lease_token is not null and lease_expires_at is not null)
    or (state <> 'leased' and lease_token is null and lease_expires_at is null)
  ),
  constraint calendar_sync_jobs_provider_status_check check (
    provider_status_code is null or provider_status_code between 100 and 599
  ),
  constraint calendar_sync_jobs_error_check check (
    error_code is null or error_code ~ '^[a-z0-9_]{1,64}$'
  ),
  constraint calendar_sync_jobs_connection_source_key
    unique (connection_id, source_key)
);

comment on table public.calendar_sync_jobs is
  'Owner-readable desired-state queue for one-way calendar synchronization. Only service-role claim/finalize RPCs mutate delivery state.';

create index calendar_connections_owner_idx
  on public.calendar_connections (user_id, provider, status);
create index calendar_event_mappings_owner_idx
  on public.calendar_event_mappings (user_id, synced_at desc, id);
create index calendar_event_mappings_user_movie_idx
  on public.calendar_event_mappings (user_movie_id)
  where user_movie_id is not null;
create index calendar_sync_jobs_due_idx
  on public.calendar_sync_jobs (available_at, created_at, id)
  where state in ('pending', 'retryable', 'leased');
create index calendar_sync_jobs_owner_idx
  on public.calendar_sync_jobs (user_id, updated_at desc, id);

create trigger watchflow_calendar_connections_updated_at
before update on public.calendar_connections
for each row execute function public.watchflow_set_updated_at();

create trigger watchflow_calendar_credentials_updated_at
before update on public.calendar_credentials
for each row execute function public.watchflow_set_updated_at();

create trigger watchflow_calendar_event_mappings_updated_at
before update on public.calendar_event_mappings
for each row execute function public.watchflow_set_updated_at();

create trigger watchflow_calendar_sync_jobs_updated_at
before update on public.calendar_sync_jobs
for each row execute function public.watchflow_set_updated_at();

alter table public.calendar_connections enable row level security;
alter table public.calendar_credentials enable row level security;
alter table public.calendar_event_mappings enable row level security;
alter table public.calendar_sync_jobs enable row level security;

create policy watchflow_calendar_connections_select_own
  on public.calendar_connections for select to authenticated
  using (user_id = (select auth.uid()));

create policy watchflow_calendar_event_mappings_select_own
  on public.calendar_event_mappings for select to authenticated
  using (user_id = (select auth.uid()));

create policy watchflow_calendar_sync_jobs_select_own
  on public.calendar_sync_jobs for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.calendar_connections
  from public, anon, authenticated;
revoke all on table public.calendar_credentials
  from public, anon, authenticated;
revoke all on table public.calendar_event_mappings
  from public, anon, authenticated;
revoke all on table public.calendar_sync_jobs
  from public, anon, authenticated;

grant select on table public.calendar_connections to authenticated;
grant select on table public.calendar_event_mappings to authenticated;
grant select on table public.calendar_sync_jobs to authenticated;

create or replace function public.watchflow_part18j_uuid(
  p_namespace text,
  p_value text
)
returns uuid
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select pg_catalog.md5('watchflow:' || p_namespace || ':' || p_value)::uuid
$$;

create or replace function public.watchflow_calendar_source_key(
  p_connection_id uuid,
  p_user_movie_id uuid
)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select pg_catalog.md5(
    'watchflow:calendar-source:' || p_connection_id::text || ':' || p_user_movie_id::text
  )
$$;

create or replace function public.watchflow_calendar_upsert_version(
  p_source_key text,
  p_scheduled_for timestamptz,
  p_schedule_timezone text,
  p_movie_title text,
  p_runtime_minutes integer
)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select pg_catalog.md5(
    'watchflow:calendar-version:upsert:'
    || pg_catalog.char_length(p_source_key)::text || ':' || p_source_key
    || ':' || ((extract(epoch from p_scheduled_for) * 1000000)::bigint)::text
    || ':' || pg_catalog.char_length(p_schedule_timezone)::text
    || ':' || p_schedule_timezone
    || ':' || pg_catalog.char_length(p_movie_title)::text || ':' || p_movie_title
    || ':' || p_runtime_minutes::text
  )
$$;

create or replace function public.watchflow_calendar_delete_version(
  p_source_key text
)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select pg_catalog.md5('watchflow:calendar-version:delete:' || p_source_key)
$$;

create or replace function public.watchflow_calendar_provider_event_id(
  p_connection_id uuid,
  p_source_key text
)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select 'wf' || pg_catalog.md5(
    'watchflow:calendar-provider-event:'
    || p_connection_id::text || ':' || p_source_key
  )
$$;

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
     and v_connection.sync_enabled
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

create or replace function public.watchflow_sync_calendar_job_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection_id uuid;
  v_user_id uuid;
  v_user_movie_id uuid;
  v_force_delete boolean;
begin
  v_user_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  v_user_movie_id := case when tg_op = 'DELETE' then old.id else new.id end;
  v_force_delete := tg_op = 'DELETE';

  for v_connection_id in
    select connection_row.id
    from public.calendar_connections as connection_row
    where connection_row.user_id = v_user_id
      and connection_row.provider = 'google'
  loop
    perform public.watchflow_enqueue_calendar_sync(
      v_connection_id,
      v_user_movie_id,
      v_force_delete,
      false
    );
  end loop;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger watchflow_user_movies_sync_calendar
after insert or update of status, scheduled_for, schedule_timezone or delete
on public.user_movies
for each row execute function public.watchflow_sync_calendar_job_trigger();

revoke all on function public.watchflow_part18j_uuid(text, text)
  from public, anon, authenticated;
revoke all on function public.watchflow_calendar_source_key(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.watchflow_calendar_upsert_version(text, timestamptz, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.watchflow_calendar_delete_version(text)
  from public, anon, authenticated;
revoke all on function public.watchflow_calendar_provider_event_id(uuid, text)
  from public, anon, authenticated;
revoke all on function public.watchflow_enqueue_calendar_sync(uuid, uuid, boolean, boolean)
  from public, anon, authenticated;
revoke all on function public.watchflow_sync_calendar_job_trigger()
  from public, anon, authenticated;

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

create or replace function public.watchflow_finalize_calendar_sync_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_source_version text,
  p_outcome text,
  p_provider_event_id text default null,
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
     or (p_provider_status_code is not null
         and p_provider_status_code not between 100 and 599)
     or (p_error_code is not null
         and p_error_code !~ '^[a-z0-9_]{1,64}$')
     or (p_provider_event_id is not null
         and char_length(p_provider_event_id) not between 5 and 1024)
     or (p_provider_etag is not null
         and char_length(p_provider_etag) not between 1 and 1024) then
    raise exception using
      errcode = '22023', message = 'Invalid calendar finalization payload';
  end if;

  select exact_job.* into v_job
  from public.calendar_sync_jobs as exact_job
  where exact_job.id = p_job_id
    and exact_job.state = 'leased'
    and exact_job.lease_token = p_lease_token
    and exact_job.source_version = p_source_version
    and exact_job.lease_expires_at > pg_catalog.now()
  for update;

  if not found then
    return false;
  end if;

  if p_outcome = 'succeeded' then
    if v_job.desired_operation = 'upsert' then
      if p_provider_event_id is null
         or p_provider_event_id <> public.watchflow_calendar_provider_event_id(
           v_job.connection_id,
           v_job.source_key
         ) then
        raise exception using
          errcode = '22023', message = 'Calendar upsert requires its deterministic event identifier';
      end if;

      insert into public.calendar_event_mappings (
        user_id, connection_id, source_key, user_movie_id,
        provider_calendar_id, provider_event_id, source_version,
        provider_etag, sync_state, synced_at
      )
      select
        v_job.user_id, v_job.connection_id, v_job.source_key,
        v_job.user_movie_id, connection_row.provider_calendar_id,
        p_provider_event_id, v_job.source_version, p_provider_etag,
        'synced', pg_catalog.now()
      from public.calendar_connections as connection_row
      where connection_row.id = v_job.connection_id
        and connection_row.user_id = v_job.user_id
      on conflict on constraint calendar_event_mappings_connection_source_key
      do update set
        user_id = excluded.user_id,
        user_movie_id = excluded.user_movie_id,
        provider_calendar_id = excluded.provider_calendar_id,
        provider_event_id = excluded.provider_event_id,
        source_version = excluded.source_version,
        provider_etag = excluded.provider_etag,
        sync_state = 'synced',
        synced_at = pg_catalog.now();
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
    return true;
  end if;

  if p_outcome = 'retryable' and v_job.attempt_count < v_job.attempt_limit then
    v_retry_seconds := case v_job.attempt_count
      when 1 then 30
      when 2 then 60
      when 3 then 120
      when 4 then 300
      else 600
    end;

    update public.calendar_sync_jobs as retry_job
    set state = 'retryable',
        available_at = pg_catalog.now()
          + pg_catalog.make_interval(secs => v_retry_seconds),
        provider_status_code = p_provider_status_code,
        error_code = coalesce(p_error_code, 'calendar_provider_retry'),
        completed_at = null, lease_token = null, lease_expires_at = null
    where retry_job.id = v_job.id;
  else
    update public.calendar_sync_jobs as terminal_job
    set state = case
          when p_outcome = 'retryable' then 'failed'
          else p_outcome
        end,
        provider_status_code = p_provider_status_code,
        error_code = case
          when p_outcome = 'retryable'
            then 'calendar_attempt_limit_exhausted'
          else p_error_code
        end,
        completed_at = pg_catalog.now(),
        lease_token = null, lease_expires_at = null
    where terminal_job.id = v_job.id;

    if p_outcome = 'auth_required' then
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

comment on function public.watchflow_claim_calendar_sync_jobs(integer, integer) is
  'Service-role-only bounded calendar job claim with exact leases and encrypted credential return.';
comment on function public.watchflow_finalize_calendar_sync_job(uuid, uuid, text, text, text, text, integer, text) is
  'Service-role-only exact-version calendar job finalizer with bounded retry and mapping reconciliation.';

revoke all on function public.watchflow_claim_calendar_sync_jobs(integer, integer)
  from public, anon, authenticated;
revoke all on function public.watchflow_finalize_calendar_sync_job(uuid, uuid, text, text, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.watchflow_claim_calendar_sync_jobs(integer, integer)
  to service_role;
grant execute on function public.watchflow_finalize_calendar_sync_job(uuid, uuid, text, text, text, text, integer, text)
  to service_role;

commit;
