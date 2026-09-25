begin;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  action_path text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_type_check check (type in ('system')),
  constraint notifications_title_length_check check (
    char_length(title) between 1 and 160
  ),
  constraint notifications_body_length_check check (
    char_length(body) between 1 and 2000
  ),
  constraint notifications_action_path_check check (
    action_path is null
    or (
      char_length(action_path) between 1 and 500
      and left(action_path, 1) = '/'
      and left(action_path, 2) <> '//'
      and position('\\' in action_path) = 0
    )
  ),
  constraint notifications_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
    and pg_column_size(metadata) <= 8192
  )
);

comment on table public.notifications is
  'Private in-app notifications. Part 18C-1 supports trusted system notifications only.';
comment on column public.notifications.action_path is
  'Optional server-generated internal application path; external URLs are rejected.';
comment on column public.notifications.metadata is
  'Small non-secret system metadata reserved for future presentation needs.';

create index notifications_feed_idx
  on public.notifications (user_id, created_at desc, id desc);

create index notifications_unread_idx
  on public.notifications (user_id, created_at desc, id desc)
  where read_at is null;

alter table public.notifications enable row level security;

create policy watchflow_notifications_select_own
  on public.notifications
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy watchflow_notifications_update_read_state_own
  on public.notifications
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.notifications from public, anon, authenticated;
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;

create or replace function public.watchflow_mark_notification_read(
  p_notification_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_updated boolean := false;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  if p_notification_id is null then
    raise exception using
      errcode = '22023',
      message = 'Invalid notification identifier';
  end if;

  update public.notifications
  set read_at = coalesce(read_at, pg_catalog.now())
  where id = p_notification_id
    and user_id = v_user_id;

  v_updated := found;
  return v_updated;
end;
$$;

create or replace function public.watchflow_mark_all_notifications_read()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_updated integer := 0;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  update public.notifications
  set read_at = pg_catalog.now()
  where user_id = v_user_id
    and read_at is null;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

comment on function public.watchflow_mark_notification_read(uuid) is
  'Marks one notification owned by the authenticated user as read.';
comment on function public.watchflow_mark_all_notifications_read() is
  'Marks every unread notification owned by the authenticated user as read.';

revoke all on function public.watchflow_mark_notification_read(uuid)
  from public, anon;
revoke all on function public.watchflow_mark_all_notifications_read()
  from public, anon;

grant execute on function public.watchflow_mark_notification_read(uuid)
  to authenticated;
grant execute on function public.watchflow_mark_all_notifications_read()
  to authenticated;

commit;
