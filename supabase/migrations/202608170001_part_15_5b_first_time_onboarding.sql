begin;

alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz;

comment on column public.profiles.onboarding_completed_at is
  'When this member completed or skipped the current first-time onboarding flow.';

-- Every profile that exists when this migration is deployed belongs to an
-- established account. Backfill those rows before new profile rows can be
-- created with the nullable default, so existing members are never trapped in
-- first-time onboarding.
update public.profiles
set onboarding_completed_at = now()
where onboarding_completed_at is null;

-- Existing own-profile RLS remains authoritative. The browser role receives
-- only the one new column required to finish or skip onboarding.
revoke update (onboarding_completed_at)
  on table public.profiles
  from public, anon;
grant update (onboarding_completed_at)
  on table public.profiles
  to authenticated;

commit;
