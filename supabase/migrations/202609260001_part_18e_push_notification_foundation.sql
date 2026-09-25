begin;

alter table public.user_preferences
  add column if not exists push_notifications_enabled boolean not null default false;

grant insert (push_notifications_enabled)
  on table public.user_preferences to authenticated;
grant update (push_notifications_enabled)
  on table public.user_preferences to authenticated;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  expiration_time bigint,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_check check (
    endpoint ~ '^https://' and char_length(endpoint) between 12 and 2048
  ),
  constraint push_subscriptions_p256dh_check check (
    char_length(p256dh) between 16 and 256
    and p256dh ~ '^[A-Za-z0-9_-]+$'
  ),
  constraint push_subscriptions_auth_key_check check (
    char_length(auth_key) between 8 and 128
    and auth_key ~ '^[A-Za-z0-9_-]+$'
  ),
  constraint push_subscriptions_expiration_check check (
    expiration_time is null or expiration_time > 0
  ),
  constraint push_subscriptions_user_agent_check check (
    user_agent is null or char_length(user_agent) <= 512
  )
);

comment on table public.push_subscriptions is
  'Private browser Push API subscriptions. Part 18E stores subscriptions but does not deliver notifications.';
comment on column public.push_subscriptions.endpoint is
  'Browser push-service endpoint. Private owner data; never expose across users.';

create index push_subscriptions_owner_idx
  on public.push_subscriptions (user_id, created_at desc, id);

create trigger watchflow_push_subscriptions_updated_at
before update on public.push_subscriptions
for each row execute function public.watchflow_set_updated_at();

alter table public.push_subscriptions enable row level security;

create policy watchflow_push_subscriptions_select_own
  on public.push_subscriptions
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy watchflow_push_subscriptions_insert_own
  on public.push_subscriptions
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy watchflow_push_subscriptions_update_own
  on public.push_subscriptions
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy watchflow_push_subscriptions_delete_own
  on public.push_subscriptions
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.push_subscriptions from public, anon, authenticated;
grant select, delete on table public.push_subscriptions to authenticated;
grant insert (user_id, endpoint, p256dh, auth_key, expiration_time, user_agent)
  on table public.push_subscriptions to authenticated;
grant update (p256dh, auth_key, expiration_time, user_agent)
  on table public.push_subscriptions to authenticated;

create or replace function public.watchflow_save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth_key text,
  p_expiration_time bigint default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_subscription_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  insert into public.push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth_key,
    expiration_time,
    user_agent
  ) values (
    v_user_id,
    p_endpoint,
    p_p256dh,
    p_auth_key,
    p_expiration_time,
    p_user_agent
  )
  on conflict (endpoint) do update
  set p256dh = excluded.p256dh,
      auth_key = excluded.auth_key,
      expiration_time = excluded.expiration_time,
      user_agent = excluded.user_agent
  where public.push_subscriptions.user_id = v_user_id
  returning id into v_subscription_id;

  if v_subscription_id is null then
    raise exception using errcode = '42501', message = 'Push subscription belongs to another user';
  end if;

  insert into public.user_preferences (user_id, push_notifications_enabled)
  values (v_user_id, true)
  on conflict (user_id) do update
  set push_notifications_enabled = true;

  return v_subscription_id;
end;
$$;

create or replace function public.watchflow_disable_push_notifications()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_removed integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  delete from public.push_subscriptions
  where user_id = v_user_id;
  get diagnostics v_removed = row_count;

  insert into public.user_preferences (user_id, push_notifications_enabled)
  values (v_user_id, false)
  on conflict (user_id) do update
  set push_notifications_enabled = false;

  return v_removed;
end;
$$;

revoke all on function public.watchflow_save_push_subscription(text, text, text, bigint, text)
  from public, anon;
revoke all on function public.watchflow_disable_push_notifications()
  from public, anon;
grant execute on function public.watchflow_save_push_subscription(text, text, text, bigint, text)
  to authenticated;
grant execute on function public.watchflow_disable_push_notifications()
  to authenticated;

comment on function public.watchflow_save_push_subscription(text, text, text, bigint, text) is
  'Saves one Push API subscription for auth.uid() and enables the owner push preference.';
comment on function public.watchflow_disable_push_notifications() is
  'Disables push for auth.uid() and removes only that owner''s stored subscriptions.';

commit;
