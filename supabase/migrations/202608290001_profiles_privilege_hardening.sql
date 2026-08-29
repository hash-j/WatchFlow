begin;

-- The hosted development ACL retained an older broad table grant after the
-- settings migration removed only table-level UPDATE. Normalize both Data API
-- roles, then restore only the profile access used by WatchFlow.
revoke select, insert, update, delete, truncate, references, trigger
  on table public.profiles
  from public, anon;

-- A table-level UPDATE revoke also removes UPDATE grants from individual
-- columns. Restore the exact settings, scheduling, and onboarding columns below.
revoke insert, update, delete, truncate, references, trigger
  on table public.profiles
  from authenticated;

grant select
  on table public.profiles
  to authenticated;

grant update (
  full_name,
  avatar_url,
  country,
  timezone,
  updated_at,
  onboarding_completed_at
)
  on table public.profiles
  to authenticated;

commit;
