begin;

alter table public.profiles
  add column if not exists full_name text,
  add column if not exists avatar_url text,
  add column if not exists country text,
  add column if not exists timezone text not null default 'UTC',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

comment on column public.profiles.country is
  'Optional country label supplied by the account owner.';

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_movie_status text not null default 'want_to_watch',
  default_priority smallint not null default 0,
  default_library_view text not null default 'grid',
  date_format text not null default 'DD/MM/YYYY',
  time_format text not null default '12h',
  show_adult_results boolean not null default false,
  include_unreleased_movies boolean not null default true,
  preferred_language text not null default 'en',
  movies_per_page integer not null default 24,
  email_notifications_enabled boolean not null default false,
  schedule_reminders_enabled boolean not null default false,
  reminder_offset_minutes integer not null default 60,
  weekly_summary_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_preferences_default_movie_status_check check (
    default_movie_status in (
      'want_to_watch',
      'watch_next',
      'scheduled',
      'currently_watching',
      'watched',
      'on_hold',
      'dropped'
    )
  ),
  constraint user_preferences_default_priority_check check (
    default_priority between 0 and 5
  ),
  constraint user_preferences_default_library_view_check check (
    default_library_view in ('grid', 'list')
  ),
  constraint user_preferences_date_format_check check (
    date_format in ('DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD')
  ),
  constraint user_preferences_time_format_check check (
    time_format in ('12h', '24h')
  ),
  constraint user_preferences_preferred_language_check check (
    preferred_language ~ '^[a-z]{2}(-[A-Z]{2})?$'
  ),
  constraint user_preferences_movies_per_page_check check (
    movies_per_page in (12, 24, 48, 96)
  ),
  constraint user_preferences_reminder_offset_check check (
    reminder_offset_minutes in (15, 30, 60, 180, 1440)
  )
);

comment on table public.user_preferences is
  'Private application and future-notification preferences for one Auth user.';

create or replace function public.watchflow_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists watchflow_user_preferences_updated_at
  on public.user_preferences;
create trigger watchflow_user_preferences_updated_at
before update on public.user_preferences
for each row execute function public.watchflow_set_updated_at();

alter table public.user_preferences enable row level security;

drop policy if exists watchflow_user_preferences_select_own
  on public.user_preferences;
create policy watchflow_user_preferences_select_own
  on public.user_preferences
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists watchflow_user_preferences_insert_own
  on public.user_preferences;
create policy watchflow_user_preferences_insert_own
  on public.user_preferences
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists watchflow_user_preferences_update_own
  on public.user_preferences;
create policy watchflow_user_preferences_update_own
  on public.user_preferences
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.user_preferences from anon;
revoke all on table public.user_preferences from authenticated;
grant select on table public.user_preferences to authenticated;
grant insert (
  user_id,
  default_movie_status,
  default_priority,
  default_library_view,
  date_format,
  time_format,
  show_adult_results,
  include_unreleased_movies,
  preferred_language,
  movies_per_page,
  email_notifications_enabled,
  schedule_reminders_enabled,
  reminder_offset_minutes,
  weekly_summary_enabled
) on public.user_preferences to authenticated;
grant update (
  default_movie_status,
  default_priority,
  default_library_view,
  date_format,
  time_format,
  show_adult_results,
  include_unreleased_movies,
  preferred_language,
  movies_per_page,
  email_notifications_enabled,
  schedule_reminders_enabled,
  reminder_offset_minutes,
  weekly_summary_enabled
) on public.user_preferences to authenticated;

-- Preserve existing ownership policies while preventing direct edits to
-- profile identity, subscription, and audit fields.
revoke update on table public.profiles from authenticated;
grant update (full_name, avatar_url, country, timezone)
  on public.profiles to authenticated;

create or replace function public.watchflow_create_user_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.watchflow_create_user_preferences()
  from public, anon, authenticated;

-- This trigger supplements the deployed profile-onboarding trigger; it does
-- not replace or modify that trigger or its function.
drop trigger if exists watchflow_auth_user_preferences_created on auth.users;
create trigger watchflow_auth_user_preferences_created
after insert on auth.users
for each row execute function public.watchflow_create_user_preferences();

insert into public.user_preferences (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create or replace function public.watchflow_add_user_movie(
  p_movie_id bigint
)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text := 'want_to_watch';
  v_priority smallint := 0;
  v_queue_position integer := null;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  if exists (
    select 1 from public.user_movies
    where user_id = v_user_id and movie_id = p_movie_id
  ) then
    return 'duplicate';
  end if;

  select default_movie_status, default_priority
  into v_status, v_priority
  from public.user_preferences
  where user_id = v_user_id;

  if not found then
    v_status := 'want_to_watch';
    v_priority := 0;
  end if;

  if v_status = 'watch_next' then
    select coalesce(max(queue_position), 0) + 1
    into v_queue_position
    from public.user_movies
    where user_id = v_user_id and status = 'watch_next';
  end if;

  insert into public.user_movies (
    user_id,
    movie_id,
    status,
    priority,
    queue_position
  ) values (
    v_user_id,
    p_movie_id,
    v_status,
    v_priority,
    v_queue_position
  );

  return 'added';
exception
  when unique_violation then
    if exists (
      select 1 from public.user_movies
      where user_id = v_user_id and movie_id = p_movie_id
    ) then
      return 'duplicate';
    end if;
    raise;
end;
$$;

revoke all on function public.watchflow_add_user_movie(bigint)
  from public, anon;
grant execute on function public.watchflow_add_user_movie(bigint)
  to authenticated;

commit;
