begin;

alter table public.user_preferences
  add column if not exists notification_movie_status_enabled boolean not null default true,
  add column if not exists notification_watch_next_enabled boolean not null default true,
  add column if not exists notification_custom_lists_enabled boolean not null default true,
  add column if not exists notification_imports_enabled boolean not null default true;

comment on column public.user_preferences.notification_movie_status_enabled is
  'Controls in-app and push notifications for watching and watched status transitions.';
comment on column public.user_preferences.notification_watch_next_enabled is
  'Controls in-app and push notifications when movies enter Watch Next.';
comment on column public.user_preferences.notification_custom_lists_enabled is
  'Controls in-app and push notifications for custom-list additions.';
comment on column public.user_preferences.notification_imports_enabled is
  'Controls in-app and push notifications for completed CSV imports.';

grant insert (
  notification_movie_status_enabled,
  notification_watch_next_enabled,
  notification_custom_lists_enabled,
  notification_imports_enabled
) on table public.user_preferences to authenticated;

grant update (
  notification_movie_status_enabled,
  notification_watch_next_enabled,
  notification_custom_lists_enabled,
  notification_imports_enabled
) on table public.user_preferences to authenticated;

commit;
