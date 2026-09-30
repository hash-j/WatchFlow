-- Local/CI-only behavioral verification for the Part 18J-A calendar queue.
-- Run only after the from-zero bootstrap and all migrations. The transaction
-- is rolled back so no fixture survives.

begin;

insert into auth.users (id, email)
values
  ('181a0000-0000-4000-8000-000000000001', 'part18j-a@example.invalid'),
  ('181a0000-0000-4000-8000-000000000002', 'part18j-b@example.invalid');

insert into public.movies (
  tmdb_id, title, runtime_minutes, genres, main_cast, production_countries
)
values (181001, 'Part 18J Contract Movie', 118, '[]', '[]', '[]');

insert into public.calendar_connections (
  id, user_id, provider_subject, display_email, sync_enabled, granted_scopes
)
values (
  '181c0000-0000-4000-8000-000000000001',
  '181a0000-0000-4000-8000-000000000001',
  'google-subject-part18j',
  'part18j-a@example.invalid',
  true,
  array['https://www.googleapis.com/auth/calendar.events']
);

insert into public.calendar_credentials (
  connection_id, refresh_token_ciphertext, refresh_token_nonce,
  refresh_token_auth_tag, encryption_key_version
)
values (
  '181c0000-0000-4000-8000-000000000001',
  decode('01020304', 'hex'),
  decode('000102030405060708090a0b', 'hex'),
  decode('000102030405060708090a0b0c0d0e0f', 'hex'),
  1
);

insert into public.user_movies (
  id, user_id, movie_id, status, scheduled_for, schedule_timezone
)
select
  '181d0000-0000-4000-8000-000000000001',
  '181a0000-0000-4000-8000-000000000001',
  movie.id,
  'scheduled',
  '2027-01-15 18:00:00+00'::timestamptz,
  'Asia/Karachi'
from public.movies as movie
where movie.tmdb_id = 181001;

do $verification$
declare
  v_job public.calendar_sync_jobs%rowtype;
  v_first_claim record;
  v_second_claim_count integer;
  v_new_claim record;
  v_delete_claim record;
  v_mapping public.calendar_event_mappings%rowtype;
  v_connection_before public.calendar_connections%rowtype;
  v_connection_after public.calendar_connections%rowtype;
  v_paused_claim_count integer;
  v_result boolean;
begin
  select job.* into strict v_job
  from public.calendar_sync_jobs as job
  where job.connection_id = '181c0000-0000-4000-8000-000000000001'
    and job.user_movie_id = '181d0000-0000-4000-8000-000000000001';

  if v_job.desired_operation <> 'upsert' or v_job.state <> 'pending' then
    raise exception 'Part 18J enqueue did not create pending upsert work';
  end if;

  update public.calendar_connections as connection
  set sync_enabled = false
  where connection.id = '181c0000-0000-4000-8000-000000000001';

  select connection.* into strict v_connection_before
  from public.calendar_connections as connection
  where connection.id = '181c0000-0000-4000-8000-000000000001';

  select public.watchflow_replace_google_calendar_credential(
    v_connection_before.user_id,
    v_connection_before.id,
    decode('05060708', 'hex'),
    decode('0b0a09080706050403020100', 'hex'),
    decode('0f0e0d0c0b0a09080706050403020100', 'hex'),
    2
  ) into v_result;

  select connection.* into strict v_connection_after
  from public.calendar_connections as connection
  where connection.id = v_connection_before.id;

  if not v_result
     or v_connection_after is distinct from v_connection_before
     or v_connection_after.sync_enabled then
    raise exception 'Credential rotation changed paused connection metadata';
  end if;

  select public.watchflow_replace_google_calendar_credential(
    '181a0000-0000-4000-8000-000000000002',
    v_connection_before.id,
    decode('090a', 'hex'),
    decode('000102030405060708090a0b', 'hex'),
    decode('000102030405060708090a0b0c0d0e0f', 'hex'),
    1
  ) into v_result;

  if v_result then
    raise exception 'Credential rotation accepted the wrong owner';
  end if;

  select count(*) into v_paused_claim_count
  from public.watchflow_claim_calendar_sync_jobs(1, 120);

  if v_paused_claim_count <> 0 then
    raise exception 'Paused calendar connection produced provider work';
  end if;

  update public.calendar_connections as connection
  set sync_enabled = true
  where connection.id = v_connection_before.id;

  select claim.* into strict v_first_claim
  from public.watchflow_claim_calendar_sync_jobs(1, 120) as claim;

  select count(*) into v_second_claim_count
  from public.watchflow_claim_calendar_sync_jobs(1, 120);

  if v_second_claim_count <> 0 then
    raise exception 'Part 18J claim was not exclusive';
  end if;

  perform public.watchflow_enqueue_calendar_sync(
    '181c0000-0000-4000-8000-000000000001',
    '181d0000-0000-4000-8000-000000000001'
  );

  select job.* into strict v_job
  from public.calendar_sync_jobs as job
  where job.id = v_first_claim.job_id;

  if v_job.state <> 'leased'
     or v_job.lease_token <> v_first_claim.lease_token then
    raise exception 'Identical enqueue did not preserve its active lease';
  end if;

  update public.user_movies as owned_movie
  set scheduled_for = '2027-01-16 18:00:00+00'::timestamptz
  where owned_movie.id = '181d0000-0000-4000-8000-000000000001';

  select public.watchflow_finalize_calendar_sync_job(
    v_first_claim.job_id,
    v_first_claim.lease_token,
    v_first_claim.source_version,
    'succeeded',
    v_first_claim.provider_event_id
  ) into v_result;

  if v_result then
    raise exception 'Stale Part 18J finalization was accepted';
  end if;

  select claim.* into strict v_new_claim
  from public.watchflow_claim_calendar_sync_jobs(1, 120) as claim;

  select public.watchflow_finalize_calendar_sync_job(
    v_new_claim.job_id,
    v_new_claim.lease_token,
    v_new_claim.source_version,
    'succeeded',
    v_new_claim.provider_event_id,
    'part18j-etag',
    200
  ) into v_result;

  if not v_result then
    raise exception 'Current Part 18J finalization was rejected';
  end if;

  select mapping.* into strict v_mapping
  from public.calendar_event_mappings as mapping
  where mapping.connection_id = v_new_claim.connection_id
    and mapping.source_key = v_new_claim.source_key;

  if v_mapping.provider_event_id <> v_new_claim.provider_event_id
     or v_mapping.source_version <> v_new_claim.source_version then
    raise exception 'Part 18J mapping did not converge on claimed state';
  end if;

  perform public.watchflow_enqueue_calendar_sync(
    '181c0000-0000-4000-8000-000000000001',
    '181d0000-0000-4000-8000-000000000001'
  );

  select job.* into strict v_job
  from public.calendar_sync_jobs as job
  where job.id = v_new_claim.job_id;

  if v_job.state <> 'succeeded'
     or v_job.source_version <> v_new_claim.source_version then
    raise exception 'Identical enqueue reopened terminal Part 18J work';
  end if;

  update public.user_movies as owned_movie
  set status = 'want_to_watch', scheduled_for = null,
      schedule_timezone = null
  where owned_movie.id = '181d0000-0000-4000-8000-000000000001';

  select claim.* into strict v_delete_claim
  from public.watchflow_claim_calendar_sync_jobs(1, 120) as claim;

  if v_delete_claim.desired_operation <> 'delete'
     or v_delete_claim.provider_event_id <> v_mapping.provider_event_id then
    raise exception 'Part 18J delete did not retain its provider mapping';
  end if;

  select public.watchflow_finalize_calendar_sync_job(
    v_delete_claim.job_id,
    v_delete_claim.lease_token,
    v_delete_claim.source_version,
    'succeeded',
    null,
    null,
    204
  ) into v_result;

  if not v_result or exists (
    select 1 from public.calendar_event_mappings as remaining_mapping
    where remaining_mapping.id = v_mapping.id
  ) then
    raise exception 'Part 18J delete finalization did not remove its mapping';
  end if;
end;
$verification$;

do $verification$
declare
  v_helper regprocedure;
begin
  if pg_catalog.has_table_privilege(
    'authenticated', 'public.calendar_credentials', 'select'
  ) then
    raise exception 'Authenticated unexpectedly reads calendar credentials';
  end if;

  if pg_catalog.has_table_privilege(
    'authenticated', 'public.calendar_connections', 'insert'
  ) or pg_catalog.has_table_privilege(
    'authenticated', 'public.calendar_sync_jobs', 'update'
  ) then
    raise exception 'Authenticated unexpectedly writes privileged calendar state';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated',
    'public.watchflow_claim_calendar_sync_jobs(integer,integer)',
    'execute'
  ) or not pg_catalog.has_function_privilege(
    'service_role',
    'public.watchflow_claim_calendar_sync_jobs(integer,integer)',
    'execute'
  ) then
    raise exception 'Part 18J claim privilege boundary is incorrect';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.watchflow_finalize_calendar_sync_job(uuid,uuid,text,text,text,text,integer,text)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.watchflow_finalize_calendar_sync_job(uuid,uuid,text,text,text,text,integer,text)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.watchflow_finalize_calendar_sync_job(uuid,uuid,text,text,text,text,integer,text)',
    'execute'
  ) then
    raise exception 'Part 18J finalize privilege boundary is incorrect';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.watchflow_replace_google_calendar_credential(uuid,uuid,bytea,bytea,bytea,smallint)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.watchflow_replace_google_calendar_credential(uuid,uuid,bytea,bytea,bytea,smallint)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.watchflow_replace_google_calendar_credential(uuid,uuid,bytea,bytea,bytea,smallint)',
    'execute'
  ) then
    raise exception 'Part 18J credential replacement privilege boundary is incorrect';
  end if;

  foreach v_helper in array array[
    'public.watchflow_part18j_uuid(text,text)'::regprocedure,
    'public.watchflow_calendar_source_key(uuid,uuid)'::regprocedure,
    'public.watchflow_calendar_upsert_version(text,timestamptz,text,text,integer)'::regprocedure,
    'public.watchflow_calendar_delete_version(text)'::regprocedure,
    'public.watchflow_calendar_provider_event_id(uuid,text)'::regprocedure,
    'public.watchflow_enqueue_calendar_sync(uuid,uuid,boolean,boolean)'::regprocedure,
    'public.watchflow_sync_calendar_job_trigger()'::regprocedure
  ] loop
    if pg_catalog.has_function_privilege(
      'service_role', v_helper, 'execute'
    ) or pg_catalog.has_function_privilege(
      'authenticated', v_helper, 'execute'
    ) or pg_catalog.has_function_privilege(
      'anon', v_helper, 'execute'
    ) then
      raise exception 'Part 18J internal helper remains externally executable: %',
        v_helper;
    end if;
  end loop;
end;
$verification$;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '181a0000-0000-4000-8000-000000000001',
  true
);

do $verification$
begin
  if (select count(*) from public.calendar_connections) <> 1 then
    raise exception 'Part 18J owner cannot read their connection';
  end if;
end;
$verification$;

select set_config(
  'request.jwt.claim.sub',
  '181a0000-0000-4000-8000-000000000002',
  true
);

do $verification$
begin
  if (select count(*) from public.calendar_connections) <> 0
     or (select count(*) from public.calendar_sync_jobs) <> 0 then
    raise exception 'Part 18J owner isolation failed';
  end if;
end;
$verification$;

reset role;
rollback;

select 'PART18J_CALENDAR_FOUNDATION_PASS' as result;
