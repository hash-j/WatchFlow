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

## Part 10B: settings, preferences, and account data

Status: implemented in this milestone.

- Added protected settings navigation and Profile, Preferences, Notifications,
  and Data and Privacy pages.
- Added Zod-validated Server Actions with fresh `auth.getUser()` verification,
  explicit owner filters, safe action states, and no browser-supplied user IDs.
- Added a versioned `user_preferences` schema, updated-at trigger, new-user
  trigger, conflict-safe backfill, ownership-only RLS, and restricted column
  grants. The deployed profile trigger is not replaced.
- Applied member defaults to manual adds, TMDB adult/release/language behavior,
  library grid/list and page size, and schedule-oriented date/time rendering.
  Explicit URL view and page-size parameters take precedence.
- Added on-demand private CSV and format-version-1 JSON exports with attachment
  headers, no-store behavior, explicit field whitelists, and CSV formula
  neutralization.
- Added separately confirmed library deletion and account deletion. The latter
  requires a recent trusted Auth sign-in and confines admin use to final
  deletion of the verified current Auth user.
- Added focused validation, adapter, action, export, migration, security, and
  route-regression tests.

### Part 10B deployment checklist

- Apply `supabase/migrations/202607220003_user_settings.sql` in the Supabase SQL
  Editor after the two Phase 3 migrations; do not rerun old migrations blindly.
- Confirm the deployed profile ownership policies still allow the approved
  columns and deny cross-user reads/updates.
- Register two test users and confirm profile plus preference rows are created;
  verify the backfill leaves any existing preference values unchanged.
- Exercise manual Watch Next defaults concurrently and confirm queue positions
  remain unique and sequential.
- Exercise CSV/JSON exports, library deletion, and account deletion with two
  accounts to confirm tenant isolation and shared `movies` retention.
- Confirm `profiles` and `user_movies` foreign keys to Auth use the expected
  delete cascades before enabling production account deletion.
- Add a reviewed private avatar bucket and folder-scoped Storage policies before
  implementing avatar upload.
- Add an in-place recent-login reauthentication flow and operational audit/alert
  handling before high-volume production use.

## Part 12: search and library improvements

Status: implemented locally; target Supabase migration and live isolation
verification remain.

- Added a separate `/library` query path so legacy dashboard, queue, schedule,
  and detail callers retain their working full-domain service.
- Added centralized validation/canonical URLs for personal search, status,
  watched, favourite, genre, director, exact/range year, rating range, twelve
  sort modes, grid/list view, page, and 12/24/48/96 page size.
- Added an authenticated security-invoker row function plus owner-only facets.
  Filtering happens before exact count, stable ordering, and range; cards never
  load the full matching library.
- Added `user_movies.favourite`, owner-filtered card/detail toggles, a
  Favourites shortcut/filter, and favourite CSV/JSON export fields.
- Added current-page selection, select-page/clear/exit controls, native modal
  confirmations, and friendly mutation feedback.
- Added atomic security-invoker bulk status/deletion functions. Scheduled is
  excluded, new Watch Next rows append in displayed order, remaining positions
  compact, watched dates are not invented, latent schedules are preserved, and
  shared `movies` are never deleted.
- Added focused parser, URL, sorting, pagination, mapping, selection, mutation,
  adapter, action, UI, route, export, and SQL contract tests.

### Browser QA hardening

- Added Playwright 1.62.0, a Chrome-based E2E configuration, and focused auth,
  route-protection, keyboard, and responsive specs.
- Auth page titles now use semantic headings; errors and recovery success use
  live-region roles.
- The logged-out 22-test suite passes. Authenticated Part 12 behavior remains a
  deployment prerequisite because no confirmed QA users or applied-migration
  evidence is available.

### Part 12 deployment checklist

- Confirm the four prior incremental migrations are already applied. Do not
  rerun the older non-idempotent files blindly.
- Inspect target `user_movies` SELECT/INSERT/UPDATE/DELETE policies and
  authenticated grants plus equivalent existing indexes.
- Apply only
  `supabase/migrations/202607280001_part_12_library_improvements.sql`.
- Confirm `favourite` is `boolean not null default false` on `user_movies` and
  absent from `movies`.
- With two test accounts, exercise search/count/pagination, a direct favourite
  update, mixed-owner bulk rejection, Watch Next append/compaction, and bulk
  deletion while confirming shared movies and the other account remain intact.
- Capture `EXPLAIN (ANALYZE, BUFFERS)` for representative 1,000-row libraries
  before adding any shared movie/trigram indexes.
- Keep the passing critical sign-up and logged-out redirect Playwright coverage.
- After two confirmed QA accounts and migration application are available, add
  authenticated coverage for URL persistence, favourites, current-page
  selection, bulk actions, queue compaction, isolation, and modal focus.

## Part 13: private custom movie lists

Status: implemented locally; manual target migration, live RLS/isolation
verification, and authenticated browser QA remain.

- Added protected `/lists` and `/lists/[listId]` routes plus My Lists
  navigation, loading/not-found states, private list summaries, list detail,
  responsive movie rows, and native modal create/edit/delete/add/remove flows.
- Added `public.lists` for private user-owned list metadata and
  `public.list_movies` for ordered membership. Membership stores
  `user_movies.id`, not a shared movie ID, TMDB ID, browser position, or
  browser-supplied user ID.
- Added trimmed name/description validation, per-user normalized
  case-insensitive name uniqueness, private-only visibility, one membership per
  movie per list, one-based positions, and list deletion cascades that do not
  delete personal-library or shared movie rows.
- Added ownership-only RLS for both tables and authenticated table privileges.
  `list_movies` access requires both an owned parent list and an owned
  `user_movies` relationship. No list operation uses the admin client.
- Added authenticated Server Actions for create, edit, delete, ordered
  multi-add, move, membership-only removal, and movie-detail multi-list saves.
  Inputs are Zod-validated, sessions use `auth.getUser()`, and user-facing
  errors distinguish authentication, invalid input, missing tables/columns or
  RPCs, stale schema cache, permission failure, conflicts, stale records, and
  general persistence failure.
- Added one owner-scoped summary RPC for counts and four-poster previews and
  fixed-query list detail reads to avoid N+1 requests.
- Added a URL-driven private-library picker with title/original-title/director/
  cast/genre search, status and favourite filters, a 50-result server cap,
  already-added indicators, preserved displayed order, and a 100-movie
  mutation limit.
- Added accessible Up/Down ordering controls, first/last no-op behavior,
  confirmed list-membership removal, and movie-detail checkboxes that preserve
  existing order, append new memberships, and compact removals.
- Kept public/shared/collaborative lists, social interactions, public profiles,
  share links, AI-generated lists, and payments out of scope.

### Part 13 migration and database functions

Create and retain exactly one version-controlled migration:

`supabase/migrations/202607290001_part_13_private_custom_lists.sql`

The migration creates the `lists` and `list_movies` tables, their constraints,
indexes, updated-at triggers, authenticated privileges, and owner-derived RLS
policies. It adds these authenticated security-invoker functions:

- `public.watchflow_normalize_list_positions(uuid)`
- `public.watchflow_move_list_item(uuid, text)`
- `public.watchflow_add_movies_to_list(uuid, uuid[])`
- `public.watchflow_remove_movie_from_list(uuid)`
- `public.watchflow_set_movie_list_memberships(uuid, uuid[])`
- `public.watchflow_list_summaries()`

It also adds the internal
`public.watchflow_compact_lists_after_membership_delete()` trigger function and
`watchflow_list_movies_compact_after_delete` statement trigger so cascading
personal-library deletion cannot leave gaps in surviving lists. Public and
`anon` execution is revoked from the callable functions; only
`authenticated` receives execute privileges.

### Part 13 deployment and verification checklist

- Confirm the five earlier incremental migrations are already represented in
  the target project. Do not rerun older non-idempotent migrations blindly.
- Apply only
  `supabase/migrations/202607290001_part_13_private_custom_lists.sql` manually
  in the Supabase SQL Editor. Do not execute it remotely from application code.
- As a separate post-migration step, run
  `notify pgrst, 'reload schema';`.
- Verify both tables exist, RLS remains enabled, authenticated has exactly the
  required table privileges, `anon` has none, all six callable functions exist,
  and only authenticated can execute them.
- With two confirmed accounts, create the same list name for both users while
  rejecting case-insensitive duplicates for one user. Verify neither account
  can read, update, delete, add to, remove from, reorder, or infer the existence
  of the other account's lists or memberships.
- Verify another user's `user_movies.id` cannot be added; list deletion removes
  memberships only; personal-library deletion cascades memberships and
  compacts surviving list positions without deleting shared `movies`.
- Exercise empty, one-item, boundary, damaged-order, multi-add, duplicate,
  stale selection, removal, and concurrent reorder cases. Confirm positions
  remain sequential after refresh and one movie may remain in multiple lists.
- Complete authenticated Playwright coverage for CRUD, picker, multi-add,
  ordering persistence, movie-detail membership, list deletion retention,
  two-user isolation, console/network failures, requested screenshots, and the
  five target viewports.
- Re-run all critical route and Part 12 regressions, especially
  `/auth/sign-up`, individual and bulk library deletion, favourites, bulk
  status, queue movement/normalization, scheduling, import, settings, exports,
  and statistics behavior.
- Run lint, direct TypeScript checking, the full unit/integration suite,
  relevant list tests, Playwright, and production build after all Part 13 work
  has converged. Record results only after each command completes.

Known deployment limitations: no target migration application is evidenced;
no authenticated QA storage state or two-user credentials are available; the
picker has no pagination beyond its first 50 results; the movie-detail selector
is capped at 500 private lists; and final authenticated responsive/browser
verification remains pending.

## Next milestones

1. Part 14 — Movie picker and recommendations.
2. Part 15 — Testing and production hardening.
3. Part 16 — Preview deployment.
4. Part 17 — Public beta preparation.
5. Part 18 — Notifications and calendar integration.
6. Part 19 — Paid SaaS.
