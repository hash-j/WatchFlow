# WatchFlow Implementation Plan

## Phase 1: foundation and authentication

Status: implemented in this milestone.

- Keep the existing Next.js App Router and Tailwind foundation.
- Maintain separate Supabase browser, server, and proxy clients using the SSR
  cookie pattern.
- Complete sign-up, email verification callback, sign-in, sign-out, forgotten
  password, and password reset.
- Protect the product route group at both proxy and server-layout boundaries.
- Load the authenticated email and RLS-scoped profile record.
- Add the responsive WatchFlow application shell and placeholder product pages.
- Add route loading/error states and inline auth form feedback.
- Validate with lint, TypeScript, and a production build.

## Phase 1 deployment checklist

- Configure the production Site URL in Supabase Auth.
- Allow local and deployed `/auth/callback` URLs in Supabase Auth redirect URLs.
- If token-hash email templates are used, point confirmation and recovery links
  to `/auth/confirm` with the correct `type` and an internal `next` path.
- Configure production SMTP; Supabase's default mailer is suitable only for
  limited testing.
- Confirm the existing `profiles` trigger or onboarding process creates rows as
  intended.
- Review deployed RLS policies with two test accounts before accepting users.

## Phase 2: movie discovery and library workflows

Status: implemented in this milestone.

- Added a server-only TMDB adapter, response mapper, timeout, and internal movie
  types.
- Added protected movie search with adult-content exclusion and resilient empty,
  loading, missing-metadata, no-results, and provider-error states.
- Added authenticated shared-metadata upserts and RLS-scoped personal-library
  operations with unique-constraint duplicate handling.
- Added the private library grid, stored movie details, and confirmed removal.
- Added unit tests for mapping, validation, authentication ordering, duplicate
  handling, and verified-session library scope.

Before production data writes, confirm the deployed columns documented in
`DATABASE.md`; no migration or schema mutation is included here.

## Phase 3: movie management, queue, and schedule

Status: implemented in this milestone.

- Added seven validated movie statuses plus private rating, review, priority,
  rewatch preference, and watched-date editing.
- Added an ordered Watch Next view with accessible move controls, authenticated
  status-change normalization, and atomic database resequencing for dedicated
  move, scheduling, and removal operations.
- Added timezone-aware scheduling with Today, Upcoming, and Past sections,
  profile timezone persistence, and private schedule notes.
- Added dashboard summaries for the next movie, today's schedule, recently
  added movies, and recently watched movies.
- Added unit coverage for status and field validation, queue ordering,
  authenticated ownership, schedule persistence, and timezone conversion.

### Phase 3 deployment checklist

- Apply `supabase/migrations/202607210001_phase_3_movie_management.sql` before
  deploying the Phase 3 application code.
- Confirm the authenticated role can execute the four public mutation
  functions and the normalization helper, while `anon` cannot.
- Exercise queue moves and scheduling with two test users to verify RLS tenant
  isolation against the deployed policies.
- Confirm `profiles` rows exist for registered users so their timezone can be
  used as the preferred scheduling default.
- Apply `supabase/migrations/202607220002_schedule_queue_fixes.sql` to add the
  per-schedule timezone, atomic queue movement, partial unique queue index, and
  explicit ownership-only SELECT/UPDATE policies.

## Later phases

- Calendar synchronization and reminder workflows.
- Profile and preference editing.
- Operational monitoring, audit needs, and expanded end-to-end tests.
- Payments only after a separate product and security design; no billing work is
  authorized by this plan.
