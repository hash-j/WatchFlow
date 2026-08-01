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
- Added on-demand private CSV and JSON exports with attachment headers,
  no-store behavior, explicit field whitelists, and CSV formula
  neutralization. Part 15 advances JSON to format version 2 by adding owned
  custom lists/memberships without internal identifiers.
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

## Part 14: random movie picker and rule-based recommendations

Part 14 adds two protected, private-library discovery routes without changing
the database schema:

- `/picker` filters the authenticated member's stored library and chooses one
  eligible movie on the server.
- `/recommendations` scores and groups eligible unwatched movies using explicit
  metadata and personal-library rules.

The authenticated navigation and proxy include both routes. Logged-out requests
redirect to `/auth/login`, and the `(app)` layout remains the defense-in-depth
authentication boundary.

### Part 14 module and query plan

- Add `lib/discovery/types.ts` for the bounded discovery dataset and picker,
  mood, seed, score, reason, section, and cold-start types.
- Add `lib/discovery/moods.ts` for normalized genres and the centralized eight
  mood definitions.
- Add `lib/discovery/picker.ts` for URL parsing, filter matching, exclusion
  validation, secure random selection, and match explanations.
- Add `lib/discovery/recommendations.ts` for seed fallback, genre/director
  insights, scoring, stable tie-breaking, deduplication, soft diversity,
  reasons, and cold starts.
- Add `lib/discovery/mapping.ts`, `errors.ts`, and
  `supabase-discovery.ts` for defensive result mapping, safe error
  classification, and the only database read boundary.
- Keep pages as Server Components and use small Client Components only for
  pending picker state, the bounded recent-pick exclusion list, recommendation
  refresh, and existing mutation forms.

`getDiscoveryDataset()` uses a fresh `auth.getUser()` result, the normal
authenticated SSR client, an explicit owner filter, and RLS. It selects only
the required `user_movies` and joined `movies` columns, obtains an exact total,
orders deterministically, and processes at most rows 0 through 999. It returns
an honest truncation flag and never selects or accepts `user_id`.

The query is request scoped. Do not add global caching, static generation,
public metadata, local/session storage, an admin-client read, a TMDB call, or a
full-library Client Component payload.

### Picker implementation contract

- Preserve filters through validated URL parameters: `genre`, `maxRuntime`,
  `minRating`, `mood`, `period`, `watched`, `watchNext`, and `favourite`.
- Default to Unwatched. Watch Next-only requires exact `watch_next` status and
  overrides conflicting watched state without reordering the queue.
- Offer only normalized genres represented in the bounded private dataset.
- Support runtime maxima of 90, 120, 150, and 180 minutes; public-rating
  decimals from 0 through 10; and Before 1980 plus decade periods through the
  2020s.
- Exclude missing runtime, public rating, or year only when its corresponding
  filter is active.
- Apply explicit genre and mood filters cumulatively.
- Keep at most 50 valid, unique recent `user_movies.id` UUIDs in component
  memory. Choose securely from unseen eligible records and reset the cycle only
  when every eligible record has been seen.
- Show exact filter reasons, a no-match state, clear-filter actions, stored
  movie details, and existing Watch Next/favourite/custom-list shortcuts
  without mutating merely because a movie was picked.

Centralized moods are:

- Exciting: Action or Adventure
- Relaxing: Animation, Comedy, or Romance, runtime at most 130 minutes
- Funny: Comedy
- Emotional: Drama or Romance
- Dark: Crime, Horror, or Thriller
- Intense: Action, Crime, Thriller, or War
- Mind-Bending: Mystery, Science Fiction, or Thriller
- Family-oriented: Adventure, Animation, or Family, with an explicit
  certification-data caution

### Recommendation implementation contract

- Candidate statuses are `want_to_watch`, `watch_next`, `scheduled`, and
  `on_hold`. Exclude `currently_watching`, `watched`, and `dropped`.
- Prefer seeds with personal rating at least 8. Progressively supplement them
  with favourite watched movies, watched movies rated at least 7, supported
  genre history, directors with at least two ratings averaging 7 or higher,
  and publicly highly rated eligible movies. Keep at most five seeds, render
  the strongest three seed sections, and show at most three results per seed.
- Score shared genres at +4 each capped at +12; same director +3; release years
  within 10 years +1; runtimes within 30 minutes +1; candidate favourite +1;
  Watch Next +1; public rating 7+/8+ at +1/+2; and seed personal rating 9/10 at
  +1/+2.
- Treat missing metadata as absent evidence, not low quality. Never recommend a
  seed to itself.
- Use stable ties, deduplicate across all sections, and apply soft
  genre/director diversity or refresh ordering only within two points of the
  current top score.
- Render at most 16 total results with concrete reasons. Show only supported
  per-seed, highly rated genre, highly rated director, Watch Next, or public
  rating sections.
- Distinguish empty library, no eligible candidates, no ratings, and no
  suitable recommendations with useful navigation actions.
- Label the page and explanation as rule-based; do not use AI or predictive
  claims.

### Database and integration decision

Create no Part 14 migration. Do not add a recommendation-results table,
feedback table, index, RPC, trigger, policy, or grant. The bounded query uses
existing Part 12 indexes and the deployed shared metadata.

Reuse `bulkUpdateStatusAction` and
`watchflow_bulk_update_library_status(uuid[], text)` for a one-movie Watch Next
shortcut. Reuse the existing favourite action and the stored movie-detail
custom-list membership workflow. Add `/picker` and `/recommendations`
revalidation to library add/remove/favourite/bulk mutations, management
changes, CSV import, and full-library deletion.

### Part 14 quality and QA checklist

- Add pure picker parsing/matching/randomness/mood tests, recommendation
  seed/scoring/diversity/reason/cold-start tests, defensive mapping tests, and
  authenticated-adapter/source security contracts.
- Add logged-out route-protection tests for both new routes and retain the
  canonical `/auth/sign-up` non-404 guard.
- With confirmed QA users, exercise picker filters, every mood, repeat
  avoidance, no-match behavior, URL refresh, recommendation seed/fallback
  sections, reasons, mutation shortcuts, and two-user isolation.
- Exercise 375x667, 390x844, 768x1024, 1366x768, and 1440x900 viewports and
  capture the requested picker/recommendation screenshots.
- Inspect browser console, hydration, failed requests, HTTP failures, image
  handling, keyboard order, focus movement, and horizontal overflow.
- Re-run lint, direct TypeScript, the full unit/integration suite, focused
  discovery tests, Playwright, production build, and practical existing-route
  regressions. Record outcomes only after the commands complete.

Known MVP limits: one request processes at most the newest 1,000 owned
relationships, recent picker exclusions are capped at 50 and remain in
component memory, recommendation output is capped at 16, and authenticated
two-user browser verification still depends on available confirmed sessions.

## Part 15: testing and production hardening

Status: hardening and test architecture implemented locally; the required
authenticated workflow matrix, target migration verification, and Preview
operational verification remain incomplete.

### Test architecture

- Added explicit unit, gated live-integration, database-catalog, Playwright,
  browser-diagnostic, bundle-secret, and production-build layers documented in
  `docs/TESTING.md`.
- Expanded Playwright with reusable authenticated contexts for QA Users A/B,
  login/logout, controlled movie/list lifecycle, in-memory CSV fixtures,
  mutation-aware waits, accessible state assertions, and safe console/network
  capture.
- Restricted mutating browser QA to a loopback application explicitly marked
  as development. Account deletion requires a separate one-use account,
  different from both standard QA users, plus an explicit destructive flag.
- Added a read-only two-user Supabase integration suite. It is disabled unless
  the operator explicitly supplies the development guard and required
  credentials.
- Preserved public auth, callback/recovery failure, protected-route, keyboard,
  sign-up non-404, and five-viewport regressions.

### Security and reliability work

- Added stable auth errors, allowlisted callback OTP types, safe internal
  redirects, browser Supabase configuration validation, and cookie-aware
  server-side logout.
- Restricted development Supabase logs to validated error code/category and
  kept production output empty. Raw message/detail/hint and private rows are
  not logged.
- Kept the admin client server-only, verified-user-gated, nonpersistent, and
  limited to shared movie metadata plus final same-user Auth deletion.
- Added private/no-store/no-cache/nosniff behavior on CSV/JSON responses,
  centralized spreadsheet formula protection, and JSON format version 2 with
  owned custom lists/memberships.
- Hardened CSV authentication ordering and file/row/column/cell/confirmation
  limits; retained four-request matching concurrency and memory-only handling.
- Added CSP, referrer, permissions, nosniff, and frame-denial headers.
- Added route error boundaries, root and dynamic not-found handling, stable
  loading/pending announcements, and more actionable empty states.
- Added validated optimized TMDB poster URLs, bounded source sizes, fixed
  aspect ratios, responsive `sizes`, and runtime image fallbacks.

### Rate limiting and shared caching

Create exactly one Part 15 patch migration:

`supabase/migrations/202607300001_part_15_tmdb_rate_limits.sql`

It adds:

- nullable `movies.tmdb_adult` and `movies.metadata_language` cache-safety
  fields;
- a repair/narrowing of preference defaults so `scheduled` cannot be selected
  without schedule input;
- explicit authenticated-read/server-write-only grants for shared `movies`;
- transactional replacements for movie-management and schedule RPCs;
- internal RLS-enabled `watchflow_tmdb_rate_limits`, with no policies or
  browser-role table grants; and
- authenticated `watchflow_take_tmdb_rate_limit(text, integer)`, an empty-
  search-path `security definer` function deriving its user from `auth.uid()`.

Fixed windows are 30 searches/60 seconds, 20 details/60 seconds, 120 import
searches/600 seconds, and 120 import details/600 seconds per authenticated user.
All current provider flows are authenticated; no public fallback limiter is
needed.

Shared `movies` details use canonical English and are reusable for 30 days only
when timestamp, canonical-language, and adult-safety metadata match. Member
language preferences remain search-only. Stale rows refresh through protected
rate-limited server logic and upsert by unique `tmdb_id`. In-flight promises
deduplicate identical requests in one process; PostgreSQL rate counters and
uniqueness remain the multi-instance correctness boundaries. Private data is
never globally cached.

### Focused performance work

- Query only Watch Next rows, sort in PostgreSQL, and render at most 500 with a
  visible truncation state instead of downloading a full private library.
- Normalize affected queues with one authenticated RPC rather than repeated
  row updates.
- Remove the browser Supabase SDK dependency from protected-shell logout. The
  final raw route-entry audit records `/library` as the largest entry at
  486,629 bytes; Preview still needs compressed-transfer/hydration measurement.
- Deduplicate search/detail provider requests and confirmation detail lookups.
- Retain server pagination for the library and existing bounded list picker,
  import, discovery, and recommendation work.
- Add no speculative indexes. Existing query/constraint indexes and the new
  limiter primary key match current access; Preview query plans remain the
  trigger for further changes.

### Verification scripts and documentation

- Added `supabase/verification/development_readiness.sql` for object-based
  `INSTALLED`/`MISSING` readiness checks.
- Added `supabase/verification/production_security_audit.sql` for RLS policy,
  authenticated/anonymous privilege, and limiter exposure findings.
- Added `scripts/scan-client-secrets.mjs` for built browser chunks/rendered
  payloads; it never prints a matching configured value.
- Added `docs/TESTING.md`, `docs/SECURITY.md`,
  `docs/SECURITY_AUDIT.md`, and `docs/PRODUCTION_READINESS.md`.

### Part 15 Preview checklist

- Confirm the six earlier incremental migrations in the development target.
  Do not rerun non-idempotent historical SQL blindly.
- Manually apply
  `supabase/migrations/202607300001_part_15_tmdb_rate_limits.sql`, then run
  `notify pgrst, 'reload schema';` as a separate step.
- Run both read-only verification scripts and resolve every missing/review/
  unsafe result.
- Provision two disposable confirmed QA accounts plus a distinct one-use
  deletion account. Run guarded integration and complete authenticated
  Playwright workflows, cross-user mutations, queue/schedule/import/settings/
  export/list/discovery behavior, responsive/accessibility checks, console/
  network inspection, and requested screenshots.
- Verify Auth confirmation/password-reset email delivery and delivered/expired
  link behavior with a QA inbox. Do not mark the end-to-end reset flow passed
  without this.
- Verify account-delete foreign-key cascades and shared movie preservation
  directly in the development database.
- Repeat lint, direct TypeScript, unit/integration, Playwright, production
  build, dependency audit, and post-build secret scan after final changes.
- Configure Preview-only Supabase/Vercel values, access controls, backups,
  monitoring, SMTP, domain/Auth redirects, legal pages, and TMDB attribution/
  licensing evidence before broader release.
- Reconcile the requested `/statistics` route. It is proxy-protected but no
  page, chart, query module, or testable feature exists.

Recorded final local verification: lint and direct TypeScript passed; the unit/
source suite passed 55 files and 534 tests; the guarded integration command
completed with all five live tests skipped; Playwright passed 35 tests with six
guarded/skipped and automatic safe console/network assertions; both npm audits
reported zero vulnerabilities; the Next.js 16.2.12 production build passed;
and the client scan checked 462 artifacts without a forbidden/configured-value
leak. Playwright MCP passed a clean-restart public smoke only.

Known limitations: the Part 15 migration was not applied remotely; guarded live
tests skip without confirmed disposable credentials; delivered email and
account deletion remain blocked; in-flight metadata refresh deduplication is
process-local; list summaries/dashboard/schedule retain documented scaling
limits; and production/Preview infrastructure was not configured.

## Next milestones

1. Part 16 — Preview deployment.
2. Part 17 — Public beta preparation.
3. Part 18 — Notifications and calendar integration.
4. Part 19 — Paid SaaS.
