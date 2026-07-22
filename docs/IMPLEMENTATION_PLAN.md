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

## Part 10A: Google Sheets CSV import

Status: implemented in this milestone.

- Added protected `/import` navigation and a seven-step, responsive import
  wizard with visible read, validate, match, save, and complete progress.
- Added in-memory UTF-8 CSV parsing with a 2 MB file limit, 500-row limit,
  quoted-field support, duplicate-header handling, empty-row removal, and safe
  client/server file validation.
- Added suggested but editable mappings for title, year, director, cast,
  genres, personal rating, status, watched date, review, and priority. Generic
  Rating columns require explicit selection.
- Added server-repeated row normalization, exact status aliases, decimal rating
  validation, conservative date parsing, duplicate CSV detection, and a
  20-row preview.
- Added server-only TMDB matching with normalized title/original-title/year
  scoring, per-operation lookup caching, four-request concurrency, explicit
  ambiguous selection, missing-metadata support, and row-level timeout,
  rate-limit, and provider failures.
- Added authenticated partial-batch confirmation. Full details are fetched per
  selected movie, shared metadata uses the protected admin client, and private
  relationships use the authenticated SSR client under RLS.
- Added unique-constraint duplicate handling, retry idempotency, imported
  personal fields, and CSV-ordered Watch Next appends followed by the existing
  authenticated queue-normalization RPC.
- Added summary counts, row-level safe results, library navigation, retry, and
  downloadable/copyable failure reports.
- Added focused unit and adapter tests across parsing, mapping, validation,
  matching, authentication, persistence, partial failure, tenant scoping, and
  queue placement.

### Part 10A deployment checklist

- Keep `TMDB_READ_ACCESS_TOKEN` and `SUPABASE_SECRET_KEY` server-only.
- Confirm the existing `movies.tmdb_id` and `(user_id, movie_id)` unique
  constraints are present and Phase 3 queue functions are applied.
- Exercise the importer with two member accounts to verify RLS isolation and
  duplicate reporting in the deployed Supabase project.
- Monitor TMDB response/rate-limit behavior before changing the four-request
  concurrency limit or 500-row batch size.
