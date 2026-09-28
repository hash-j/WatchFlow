begin;

create table public.scheduled_notification_jobs (
  id uuid primary key references public.user_movies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  schedule_key text not null unique,
  notification_id uuid not null unique,
  scheduled_for timestamptz not null,
  schedule_timezone text not null,
  reminder_offset_minutes integer not null,
  reminder_at timestamptz not null,
  state text not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  result_code text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduled_notification_jobs_offset_check check (
    reminder_offset_minutes in (15, 30, 60, 180, 1440)
  ),
  constraint scheduled_notification_jobs_state_check check (
    state in ('pending', 'processing', 'retry', 'delivered', 'skipped', 'failed')
  ),
  constraint scheduled_notification_jobs_attempts_check check (
    attempts between 0 and 5
  ),
  constraint scheduled_notification_jobs_lease_check check (
    (state = 'processing' and lease_token is not null and lease_expires_at is not null)
    or (state <> 'processing' and lease_token is null and lease_expires_at is null)
  )
);

comment on table public.scheduled_notification_jobs is
  'Owner-scoped Part 18I movie reminder jobs. One deterministic job per user_movies row.';

create index scheduled_notification_jobs_due_idx
  on public.scheduled_notification_jobs (available_at, reminder_at, id)
  where state in ('pending', 'retry', 'processing');

create index scheduled_notification_jobs_owner_idx
  on public.scheduled_notification_jobs (user_id, scheduled_for, id);

create table public.scheduled_notification_deliveries (
  id uuid primary key,
  job_id uuid not null references public.scheduled_notification_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  schedule_key text not null,
  subscription_id uuid references public.push_subscriptions(id) on delete set null,
  state text not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  status_code integer,
  result_code text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduled_notification_deliveries_state_check check (
    state in ('pending', 'sending', 'retry', 'delivered', 'skipped', 'failed')
  ),
  constraint scheduled_notification_deliveries_attempts_check check (
    attempts between 0 and 3
  ),
  constraint scheduled_notification_deliveries_status_check check (
    status_code is null or status_code between 100 and 599
  ),
  constraint scheduled_notification_deliveries_lease_check check (
    (state = 'sending' and lease_token is not null and lease_expires_at is not null)
    or (state <> 'sending' and lease_token is null and lease_expires_at is null)
  ),
  unique (schedule_key, subscription_id)
);

comment on table public.scheduled_notification_deliveries is
  'Per-subscription delivery ledger for a deterministic scheduled reminder version.';

create index scheduled_notification_deliveries_job_idx
  on public.scheduled_notification_deliveries (job_id, state, available_at, id);

create trigger watchflow_scheduled_notification_jobs_updated_at
before update on public.scheduled_notification_jobs
for each row execute function public.watchflow_set_updated_at();

create trigger watchflow_scheduled_notification_deliveries_updated_at
before update on public.scheduled_notification_deliveries
for each row execute function public.watchflow_set_updated_at();

alter table public.scheduled_notification_jobs enable row level security;
alter table public.scheduled_notification_deliveries enable row level security;

create policy watchflow_scheduled_notification_jobs_select_own
  on public.scheduled_notification_jobs for select to authenticated
  using (user_id = (select auth.uid()));

create policy watchflow_scheduled_notification_deliveries_select_own
  on public.scheduled_notification_deliveries for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.scheduled_notification_jobs
  from public, anon, authenticated;
revoke all on table public.scheduled_notification_deliveries
  from public, anon, authenticated;
grant select on table public.scheduled_notification_jobs to authenticated;
grant select on table public.scheduled_notification_deliveries to authenticated;

create or replace function public.watchflow_part18i_uuid(
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

create or replace function public.watchflow_sync_scheduled_reminder(
  p_user_movie_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_movie public.user_movies%rowtype;
  v_enabled boolean := false;
  v_offset integer := 60;
  v_key text;
  v_notification_id uuid;
  v_reason text;
begin
  select * into v_movie
  from public.user_movies
  where id = p_user_movie_id;

  if not found then
    return;
  end if;

  select
    coalesce((
      select schedule_reminders_enabled from public.user_preferences
      where user_id = v_movie.user_id
    ), false),
    coalesce((
      select reminder_offset_minutes from public.user_preferences
      where user_id = v_movie.user_id
    ), 60)
  into v_enabled, v_offset;

  if v_movie.status <> 'scheduled'
     or v_movie.scheduled_for is null
     or v_movie.schedule_timezone is null then
    update public.scheduled_notification_jobs
    set state = 'skipped',
        result_code = 'schedule_changed',
        completed_at = pg_catalog.now(),
        lease_token = null,
        lease_expires_at = null
    where id = p_user_movie_id
      and state not in ('delivered', 'skipped', 'failed');
    return;
  end if;

  v_key := p_user_movie_id::text || ':'
    || ((extract(epoch from v_movie.scheduled_for) * 1000000)::bigint)::text
    || ':' || v_movie.schedule_timezone || ':' || v_offset::text;
  v_notification_id := public.watchflow_part18i_uuid('scheduled-reminder', v_key);
  v_reason := case when v_enabled then null else 'reminders_disabled' end;

  delete from public.scheduled_notification_deliveries
  where job_id = p_user_movie_id
    and schedule_key <> v_key;

  insert into public.scheduled_notification_jobs (
    id, user_id, schedule_key, notification_id, scheduled_for,
    schedule_timezone, reminder_offset_minutes, reminder_at, state,
    attempts, available_at, result_code, completed_at
  ) values (
    p_user_movie_id, v_movie.user_id, v_key, v_notification_id,
    v_movie.scheduled_for, v_movie.schedule_timezone, v_offset,
    v_movie.scheduled_for - pg_catalog.make_interval(mins => v_offset),
    case when v_enabled then 'pending' else 'skipped' end,
    0, pg_catalog.now(), v_reason,
    case when v_enabled then null else pg_catalog.now() end
  )
  on conflict (id) do update
  set user_id = excluded.user_id,
      schedule_key = excluded.schedule_key,
      notification_id = excluded.notification_id,
      scheduled_for = excluded.scheduled_for,
      schedule_timezone = excluded.schedule_timezone,
      reminder_offset_minutes = excluded.reminder_offset_minutes,
      reminder_at = excluded.reminder_at,
      state = case
        when public.scheduled_notification_jobs.schedule_key = excluded.schedule_key
             and public.scheduled_notification_jobs.state = 'delivered'
          then 'delivered'
        else excluded.state
      end,
      attempts = case
        when public.scheduled_notification_jobs.schedule_key = excluded.schedule_key
          then public.scheduled_notification_jobs.attempts
        else 0
      end,
      available_at = case
        when public.scheduled_notification_jobs.schedule_key = excluded.schedule_key
          then public.scheduled_notification_jobs.available_at
        else pg_catalog.now()
      end,
      lease_token = null,
      lease_expires_at = null,
      result_code = case
        when public.scheduled_notification_jobs.schedule_key = excluded.schedule_key
             and public.scheduled_notification_jobs.state = 'delivered'
          then public.scheduled_notification_jobs.result_code
        else excluded.result_code
      end,
      completed_at = case
        when public.scheduled_notification_jobs.schedule_key = excluded.schedule_key
             and public.scheduled_notification_jobs.state = 'delivered'
          then public.scheduled_notification_jobs.completed_at
        else excluded.completed_at
      end;
end;
$$;

create or replace function public.watchflow_sync_scheduled_reminder_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.watchflow_sync_scheduled_reminder(new.id);
  return new;
end;
$$;

create trigger watchflow_user_movies_sync_scheduled_reminder
after insert or update of status, scheduled_for, schedule_timezone
on public.user_movies
for each row execute function public.watchflow_sync_scheduled_reminder_trigger();

create or replace function public.watchflow_sync_reminder_preferences_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if tg_op = 'INSERT'
     or old.schedule_reminders_enabled is distinct from new.schedule_reminders_enabled
     or old.reminder_offset_minutes is distinct from new.reminder_offset_minutes then
    for v_id in
      select id from public.user_movies
      where user_id = new.user_id and status = 'scheduled'
    loop
      perform public.watchflow_sync_scheduled_reminder(v_id);
    end loop;
  end if;
  return new;
end;
$$;

create trigger watchflow_preferences_sync_scheduled_reminders
after insert or update of schedule_reminders_enabled, reminder_offset_minutes
on public.user_preferences
for each row execute function public.watchflow_sync_reminder_preferences_trigger();

revoke all on function public.watchflow_part18i_uuid(text, text)
  from public, anon, authenticated;
revoke all on function public.watchflow_sync_scheduled_reminder(uuid)
  from public, anon, authenticated;
revoke all on function public.watchflow_sync_scheduled_reminder_trigger()
  from public, anon, authenticated;
revoke all on function public.watchflow_sync_reminder_preferences_trigger()
  from public, anon, authenticated;

-- Existing scheduled movies are normalized through the same trigger-owned contract.
do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.user_movies where status = 'scheduled'
  loop
    perform public.watchflow_sync_scheduled_reminder(v_id);
  end loop;
end;
$$;

create or replace function public.watchflow_claim_scheduled_reminders(
  p_batch_size integer default 10,
  p_lease_seconds integer default 120
)
returns table (
  job_id uuid,
  delivery_id uuid,
  lease_token uuid,
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth_key text,
  notification_id uuid,
  title text,
  body text,
  action_path text,
  movie_title text,
  movie_poster_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.scheduled_notification_jobs%rowtype;
  v_movie_title text;
  v_movie_poster text;
  v_lease uuid;
  v_delivery_count integer;
  v_due_count integer;
  v_push_enabled boolean;
begin
  if p_batch_size not between 1 and 25
     or p_lease_seconds not between 30 and 300 then
    raise exception using errcode = '22023', message = 'Invalid scheduler claim bounds';
  end if;

  for v_job in
    select j.*
    from public.scheduled_notification_jobs j
    where j.reminder_at <= pg_catalog.now()
      and j.available_at <= pg_catalog.now()
      and j.attempts < 5
      and (
        j.state in ('pending', 'retry')
        or (j.state = 'processing' and j.lease_expires_at <= pg_catalog.now())
      )
    order by j.reminder_at, j.id
    limit p_batch_size
    for update skip locked
  loop
    -- An expired sending lease is ambiguous: never resend it automatically.
    update public.scheduled_notification_deliveries as stale_delivery
    set state = 'failed', result_code = 'lease_expired_unknown_delivery',
        lease_token = null, lease_expires_at = null
    where stale_delivery.job_id = v_job.id
      and stale_delivery.state = 'sending'
      and stale_delivery.lease_expires_at <= pg_catalog.now();

    select m.title, m.poster_path
    into v_movie_title, v_movie_poster
    from public.user_movies um
    join public.movies m on m.id = um.movie_id
    join auth.users au on au.id = um.user_id
    join public.user_preferences up on up.user_id = um.user_id
    where um.id = v_job.id
      and um.user_id = v_job.user_id
      and um.status = 'scheduled'
      and um.scheduled_for = v_job.scheduled_for
      and um.schedule_timezone = v_job.schedule_timezone
      and up.schedule_reminders_enabled = true
      and um.scheduled_for > pg_catalog.now();

    if not found then
      update public.scheduled_notification_jobs
      set state = 'skipped', result_code = 'schedule_or_owner_ineligible',
          completed_at = pg_catalog.now(), lease_token = null,
          lease_expires_at = null
      where id = v_job.id;
      continue;
    end if;

    insert into public.notifications (
      id, user_id, type, title, body, action_path, metadata
    ) values (
      v_job.notification_id,
      v_job.user_id,
      'system',
      'Scheduled movie reminder',
      v_movie_title || ' is coming up on your schedule.',
      '/schedule',
      pg_catalog.jsonb_build_object(
        'source', 'scheduled_movie_reminder',
        'category', 'schedule_reminders',
        'movie_title', v_movie_title,
        'movie_poster_path', v_movie_poster,
        'scheduled_for', v_job.scheduled_for,
        'schedule_timezone', v_job.schedule_timezone,
        'reminder_offset_minutes', v_job.reminder_offset_minutes,
        'schedule_key', v_job.schedule_key
      )
    ) on conflict (id) do nothing;

    delete from public.push_subscriptions
    where user_id = v_job.user_id
      and expiration_time is not null
      and expiration_time <= (extract(epoch from pg_catalog.now()) * 1000)::bigint;

    select coalesce((
      select push_notifications_enabled from public.user_preferences
      where user_id = v_job.user_id
    ), false)
    into v_push_enabled;

    if not v_push_enabled then
      update public.scheduled_notification_jobs
      set state = 'delivered', result_code = 'in_app_only_push_disabled',
          completed_at = pg_catalog.now(), lease_token = null,
          lease_expires_at = null
      where id = v_job.id;
      continue;
    end if;

    if not exists (
      select 1 from public.push_subscriptions as active_subscription
      where active_subscription.user_id = v_job.user_id
    ) then
      update public.scheduled_notification_deliveries as missing_delivery
      set state = 'skipped', result_code = 'subscription_missing',
          lease_token = null, lease_expires_at = null
      where missing_delivery.job_id = v_job.id
        and missing_delivery.subscription_id is null
        and missing_delivery.state in ('pending', 'retry');
      update public.scheduled_notification_jobs
      set state = 'delivered', result_code = 'in_app_only_no_subscription',
          completed_at = pg_catalog.now(), lease_token = null,
          lease_expires_at = null
      where id = v_job.id;
      continue;
    end if;

    insert into public.scheduled_notification_deliveries (
      id, job_id, user_id, schedule_key, subscription_id
    )
    select
      public.watchflow_part18i_uuid(
        'scheduled-delivery', v_job.schedule_key || ':' || ps.id::text
      ),
      v_job.id, v_job.user_id, v_job.schedule_key, ps.id
    from public.push_subscriptions ps
    where ps.user_id = v_job.user_id
    on conflict (schedule_key, subscription_id) do nothing;

    select count(*) into v_delivery_count
    from public.scheduled_notification_deliveries as job_delivery
    where job_delivery.job_id = v_job.id
      and job_delivery.schedule_key = v_job.schedule_key;

    if v_delivery_count = 0 then
      update public.scheduled_notification_jobs
      set state = 'delivered', result_code = 'in_app_only_no_subscription',
          completed_at = pg_catalog.now(), lease_token = null,
          lease_expires_at = null
      where id = v_job.id;
      continue;
    end if;

    select count(*) into v_due_count
    from public.scheduled_notification_deliveries as due_delivery
    where due_delivery.job_id = v_job.id
      and due_delivery.schedule_key = v_job.schedule_key
      and due_delivery.state in ('pending', 'retry')
      and due_delivery.available_at <= pg_catalog.now()
      and due_delivery.attempts < 3;

    if v_due_count = 0 then
      if exists (
        select 1 from public.scheduled_notification_deliveries as retry_delivery
        where retry_delivery.job_id = v_job.id
          and retry_delivery.schedule_key = v_job.schedule_key
          and retry_delivery.state = 'retry' and retry_delivery.attempts < 3
      ) then
        update public.scheduled_notification_jobs
        set state = 'retry',
            available_at = (
              select min(available_at)
              from public.scheduled_notification_deliveries as next_delivery
              where next_delivery.job_id = v_job.id
                and next_delivery.schedule_key = v_job.schedule_key
                and next_delivery.state = 'retry'
            ),
            result_code = 'delivery_retry_pending', completed_at = null,
            lease_token = null, lease_expires_at = null
        where id = v_job.id;
      elsif exists (
        select 1 from public.scheduled_notification_deliveries as delivered_delivery
        where delivered_delivery.job_id = v_job.id
          and delivered_delivery.schedule_key = v_job.schedule_key
          and delivered_delivery.state = 'delivered'
      ) then
        update public.scheduled_notification_jobs
        set state = 'delivered', result_code = 'push_delivered',
            completed_at = pg_catalog.now(), lease_token = null,
            lease_expires_at = null
        where id = v_job.id;
      else
        update public.scheduled_notification_jobs
        set state = 'failed', result_code = 'delivery_attempts_exhausted',
            completed_at = pg_catalog.now(), lease_token = null,
            lease_expires_at = null
        where id = v_job.id;
      end if;
      continue;
    end if;

    v_lease := gen_random_uuid();
    update public.scheduled_notification_deliveries d
    set state = 'sending', attempts = attempts + 1,
        lease_token = v_lease,
        lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds),
        result_code = null, status_code = null
    where d.id in (
      select candidate.id
      from public.scheduled_notification_deliveries candidate
      where candidate.job_id = v_job.id
        and candidate.schedule_key = v_job.schedule_key
        and candidate.state in ('pending', 'retry')
        and candidate.available_at <= pg_catalog.now()
        and candidate.attempts < 3
      order by candidate.id
      limit 20
      for update skip locked
    );

    update public.scheduled_notification_jobs
    set state = 'processing', attempts = attempts + 1,
        lease_token = v_lease,
        lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds),
        result_code = null, completed_at = null
    where id = v_job.id;

    return query
    select
      v_job.id, d.id, v_lease, ps.id, ps.endpoint, ps.p256dh, ps.auth_key,
      v_job.notification_id, 'Scheduled movie reminder'::text,
      v_movie_title || ' is coming up on your schedule.', '/schedule'::text,
      v_movie_title, v_movie_poster
    from public.scheduled_notification_deliveries d
    join public.push_subscriptions ps on ps.id = d.subscription_id
    where d.job_id = v_job.id and d.lease_token = v_lease
      and d.state = 'sending';
  end loop;
end;
$$;

create or replace function public.watchflow_finalize_scheduled_reminder(
  p_job_id uuid,
  p_lease_token uuid,
  p_results jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_delivery_id uuid;
  v_outcome text;
  v_status integer;
  v_subscription_id uuid;
  v_state text;
begin
  if p_job_id is null or p_lease_token is null
     or pg_catalog.jsonb_typeof(p_results) <> 'array'
     or pg_catalog.jsonb_array_length(p_results) > 20 then
    raise exception using errcode = '22023', message = 'Invalid scheduler finalization payload';
  end if;

  perform 1 from public.scheduled_notification_jobs
  where id = p_job_id and state = 'processing'
    and lease_token = p_lease_token
  for update;
  if not found then
    return 'lease_not_owned';
  end if;

  for v_result in select value from pg_catalog.jsonb_array_elements(p_results)
  loop
    begin
      v_delivery_id := (v_result ->> 'deliveryId')::uuid;
      v_outcome := v_result ->> 'outcome';
      v_status := nullif(v_result ->> 'statusCode', '')::integer;
    exception when others then
      continue;
    end;

    select subscription_id into v_subscription_id
    from public.scheduled_notification_deliveries
    where id = v_delivery_id and job_id = p_job_id
      and state = 'sending' and lease_token = p_lease_token
    for update;
    if not found then continue; end if;

    if v_outcome = 'delivered' then
      update public.scheduled_notification_deliveries
      set state = 'delivered', status_code = null, result_code = 'delivered',
          delivered_at = pg_catalog.now(), lease_token = null,
          lease_expires_at = null
      where id = v_delivery_id;
    elsif v_outcome = 'permanent_failure' and v_status in (404, 410) then
      update public.scheduled_notification_deliveries
      set state = 'skipped', status_code = v_status,
          result_code = 'subscription_invalid', lease_token = null,
          lease_expires_at = null
      where id = v_delivery_id;
      delete from public.push_subscriptions
      where id = v_subscription_id
        and user_id = (
          select user_id from public.scheduled_notification_jobs where id = p_job_id
        );
    elsif v_outcome in ('retryable_failure', 'not_configured') then
      update public.scheduled_notification_deliveries
      set state = case when attempts < 3 then 'retry' else 'failed' end,
          status_code = v_status,
          result_code = case when attempts < 3 then v_outcome else 'attempts_exhausted' end,
          available_at = pg_catalog.now() + pg_catalog.make_interval(
            mins => case attempts when 1 then 1 when 2 then 5 else 15 end
          ),
          lease_token = null, lease_expires_at = null
      where id = v_delivery_id;
    else
      update public.scheduled_notification_deliveries
      set state = 'failed', status_code = v_status,
          result_code = 'unknown_delivery_result', lease_token = null,
          lease_expires_at = null
      where id = v_delivery_id;
    end if;
  end loop;

  update public.scheduled_notification_deliveries
  set state = 'failed', result_code = 'missing_delivery_result',
      lease_token = null, lease_expires_at = null
  where job_id = p_job_id and state = 'sending'
    and lease_token = p_lease_token;

  if exists (
    select 1 from public.scheduled_notification_deliveries
    where job_id = p_job_id and state in ('pending', 'retry') and attempts < 3
  ) then
    v_state := 'retry';
    update public.scheduled_notification_jobs
    set state = 'retry', available_at = (
          select min(available_at) from public.scheduled_notification_deliveries
          where job_id = p_job_id and state in ('pending', 'retry')
        ), result_code = 'delivery_retry_pending', completed_at = null,
        lease_token = null, lease_expires_at = null
    where id = p_job_id;
  elsif exists (
    select 1 from public.scheduled_notification_deliveries
    where job_id = p_job_id and state = 'delivered'
  ) then
    v_state := 'delivered';
    update public.scheduled_notification_jobs
    set state = 'delivered', result_code = 'push_delivered',
        completed_at = pg_catalog.now(), lease_token = null,
        lease_expires_at = null
    where id = p_job_id;
  else
    v_state := 'failed';
    update public.scheduled_notification_jobs
    set state = 'failed', result_code = 'delivery_failed',
        completed_at = pg_catalog.now(), lease_token = null,
        lease_expires_at = null
    where id = p_job_id;
  end if;

  return v_state;
end;
$$;

comment on function public.watchflow_claim_scheduled_reminders(integer, integer) is
  'Service-role-only bounded claim that revalidates schedules and creates deterministic reminders.';
comment on function public.watchflow_finalize_scheduled_reminder(uuid, uuid, jsonb) is
  'Service-role-only lease finalizer for retry-safe scheduled Web Push delivery.';

revoke all on function public.watchflow_claim_scheduled_reminders(integer, integer)
  from public, anon, authenticated;
revoke all on function public.watchflow_finalize_scheduled_reminder(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.watchflow_claim_scheduled_reminders(integer, integer)
  to service_role;
grant execute on function public.watchflow_finalize_scheduled_reminder(uuid, uuid, jsonb)
  to service_role;

commit;
