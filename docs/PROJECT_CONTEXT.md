# WatchFlow Project Context

Last updated: 2026-07-29
Last updated by: Codex  
Purpose: Canonical project handoff and single source of truth for coding agents  
Current phase: Part 13 private custom lists implemented locally; manual migration application and authenticated two-user browser/RLS verification remain; Part 14 is next
Current branch: `master` at `3cc82cb` (`part-12-complete`); Part 13 is uncommitted
Local status: The baseline was clean and already included the Part 12 single-removal fix; Part 13 application, migration, tests, and documentation are local changes; no remote database schema or target data was modified

This document records repository evidence, not assumptions about an uninspected Supabase project. Verify relevant statements against current code and update only affected sections after each milestone.

## 2. Product Overview

WatchFlow is a private, multi-user movie-management SaaS for discovering movies, maintaining a personal library, choosing what to watch next, and planning viewing times.

The implemented flow is:

1. Register or sign in with email and password.
2. Search TMDB from the server and retrieve normalized movie metadata.
3. Add a shared movie record to a private, RLS-protected personal library.
4. Track status, rating, review, priority, watched date, and rewatch intent.
5. Order a Watch Next queue or schedule a local date/time and IANA timezone.
6. Organize personal-library movies into ordered private custom lists.
7. Import a downloaded CSV, export private data, and manage account settings.

The product currently supports authentication, profiles, title search, private libraries, movie management, queueing, scheduling, favourites, private custom lists, CSV import, CSV/JSON export, settings, and basic dashboard summaries. It does **not** contain a statistics page, charts, public/shared lists, recommendations, notification delivery, calendar sync, or payments.

The direction remains a production-oriented SaaS, but paid launch is deferred. The repository contains no billing implementation or proof of a production deployment.

## 3. Technology Stack

| Area | Actual repository choice |
|---|---|
| Framework | Next.js App Router; `next` declared as `latest`, installed/resolved as `16.2.12` |
| UI runtime | React and React DOM `19.2.7` installed (`^19.0.0` declared) |
| Language | TypeScript `5.9.3`, strict mode, path alias `@/*` |
| Styling | Tailwind CSS `3.4.19`, PostCSS, Autoprefixer, `tailwindcss-animate` |
| Components | Radix primitives, shadcn-style local components, Lucide icons, `next-themes` |
| Auth/data | Supabase Auth, PostgreSQL, and RLS through `@supabase/ssr 0.12.3` and `@supabase/supabase-js 2.110.7` |
| Movie data | Server-only TMDB API v3 adapter with provider-neutral internal types |
| Validation | Zod `4.4.3` for settings and custom lists; typed custom validators for library/import/TMDB inputs |
| CSV parsing | Custom parser in `lib/import/csv.ts`; no third-party CSV package |
| Charts | None; no charting dependency exists |
| Tests | Vitest `4.1.10`, Node environment, React server rendering for limited markup tests |
| Browser E2E | `@playwright/test 1.62.0`, headless Chrome, logged-out specs under `e2e/`; no authenticated storage state |
| Deployment | Vercel is the intended target inferred from runtime variables/starter UI; no `vercel.json` or deployment record exists |
| Package manager | npm with `package-lock.json` lockfile version 3 |

Notable version risks: Next.js is installed at `16.2.12`, while `eslint-config-next` is pinned to `15.3.1`; the latest production `npm audit` still reports three high transitive Next.js/PostCSS/sharp advisories with no safe non-major npm fix.

## 4. Repository Structure

| Path | Purpose |
|---|---|
| `app/` | The only App Router root; public/auth routes and protected `(app)` route group |
| `app/(app)/actions/` | Library, management, CSV-import, and Part 13 list Server Actions |
| `components/` | Auth, shell, movie, import, settings, Part 12 library controls, Part 13 list UI, and reusable UI components |
| `lib/auth/` | Safe redirect validation and auth route contracts |
| `lib/movies/` | Provider contract, TMDB adapter/mapper, movie types, validation |
| `lib/library/` | Legacy/detail library service plus Part 12 query parsing, URL state, mapping, selection, mutations, queue, schedule, and Supabase adapters |
| `lib/import/` | CSV parsing, mapping, validation, matching, confirmation, persistence |
| `lib/settings/` | Settings adapters/types, formatting, exports, and data controls |
| `lib/lists/` | Part 13 list types, Zod validation, defensive mapping, safe errors, authenticated queries/mutations, and tests |
| `lib/supabase/` | Browser, server, proxy, auth-context, admin, and safe-error modules |
| `docs/` | Architecture, database, product, implementation plan, and this canonical context |
| `supabase/migrations/` | Six incremental SQL migrations; the original base schema is absent |
| `lib/**/*.test.ts` | Vitest unit, adapter, route/source, and migration-contract tests |
| `e2e/`, `playwright.config.ts` | Logged-out auth, protected-route, keyboard, and responsive browser regression tests |
| `app/*.{ico,png}` | Favicon and social metadata images |

There is no `src/app/`, `features/`, or `public/` directory. Extend the existing root `app/` tree; never create a second App Router root.

## 5. Critical Routes

The `(app)` directory is a route group and does not appear in URLs.

| Route | Kind | Access and purpose |
|---|---|---|
| `/` | Page | Public WatchFlow landing page |
| `/auth/login` | Page | Public password login |
| `/auth/sign-up` | Page | Public email/password registration; critical regression route |
| `/auth/sign-up-success` | Page | Public confirmation-email instructions |
| `/auth/forgot-password` | Page | Public recovery-email request |
| `/auth/reset-password` | Page | Recovery-session-gated alias of `/auth/update-password` |
| `/auth/update-password` | Page | Recovery-session-gated password update |
| `/auth/error` | Page | Public callback error display |
| `/auth/callback` | GET Route Handler | Public PKCE code or token-hash callback |
| `/auth/confirm` | GET Route Handler | Public token-hash confirmation callback |
| `/dashboard` | Page | Protected dashboard and viewing summaries |
| `/search` | Page | Protected server-side TMDB title search; query key `q` |
| `/library` | Page | Protected server-query library; canonical URL keys `q`, `status`, `watched`, `favourite`, `genre`, `director`, `year`, `yearFrom`, `yearTo`, `ratingMin`, `ratingMax`, `sort`, `view`, `page`, `perPage`; legacy `filter` is accepted |
| `/library/[movieId]` | Dynamic page | Protected stored movie detail, personal management, favourite toggle, and private custom-list membership editor |
| `/lists` | Page | Protected private custom-list summaries, count, create/edit/delete actions, and poster previews |
| `/lists/[listId]` | Dynamic page | Protected owned-list detail, library picker, ordering, and membership-only removal; invalid/missing/foreign UUIDs share one not-found result |
| `/import` | Page | Protected seven-step CSV import |
| `/watch-next` | Page | Protected ordered queue |
| `/schedule` | Page | Protected scheduler and Today/Upcoming/Past groups |
| `/settings` | Page | Protected settings overview |
| `/settings/profile` | Page | Protected profile settings |
| `/settings/preferences` | Page | Protected application/search/display defaults |
| `/settings/notifications` | Page | Protected future-notification preferences |
| `/settings/data` | Page | Protected exports and destructive data controls |
| `/settings/data/export/csv` | GET Route Handler | Protected private CSV attachment |
| `/settings/data/export/json` | GET Route Handler | Protected private JSON attachment |
| `/protected` | Page | Protected leftover Supabase-starter claims/tutorial page; noncanonical product UI |

No `/statistics` or `/api/*` route exists. Loading, error, not-found, layout, favicon, and metadata-image files are framework boundaries/assets, not routes.

## 6. Authentication Architecture

- Supabase email/password Auth uses cookie-backed `@supabase/ssr` clients.
- Browser client: `lib/supabase/client.ts`; public URL and publishable key only.
- Server client: `lib/supabase/server.ts`; one request-scoped client using `cookies()`.
- Session proxy: root `proxy.ts` delegates to `lib/supabase/proxy.ts`, preserves every Supabase cookie mutation, calls `auth.getClaims()`, and redirects anonymous protected prefixes to `/auth/login`.
- The protected `app/(app)/layout.tsx` repeats the verified-claims boundary through `lib/supabase/auth.ts` and owner-filters the profile by `claims.sub`.
- Settings, library mutations, imports, exports, and destructive operations use fresh `auth.getUser()` checks where current Auth-server data is required.
- Login calls `signInWithPassword()`, then replaces navigation with `/dashboard` and refreshes Server Components.
- Signup calls `signUp()` with an email redirect to `/auth/callback?next=/dashboard`, then shows `/auth/sign-up-success`.
- `/auth/callback` supports PKCE `code` exchange and token-hash OTP verification;
  `/auth/confirm` supports token-hash links.
- `lib/auth/safe-redirect.ts` accepts only internal single-slash paths and rejects missing, protocol-relative, or backslash-containing redirect values.
- Recovery uses `/auth/callback?next=/auth/update-password`; the reset/update page verifies claims before the browser calls `updateUser()`.
- Sign-out redirects only after Supabase succeeds.
- Auth cards expose page-level `h1` headings; form/provider errors use `role="alert"`, and forgot-password success uses `role="status"`.
- Playwright MCP and repository E2E tests confirmed public auth semantics, invalid-login feedback, callback failures, keyboard order, and `/auth/sign-up` route stability.

Authorization warning: use verified `auth.getUser()` for fresh user-sensitive mutation/deletion boundaries; verified `auth.getClaims()` is the established proxy/layout JWT check. Never use `getSession()` as authorization, accept `user_id` from browser input, or use an admin key for login/ordinary user mutations.

Historical regression: `/auth/sign-up` was previously removed during unrelated work and returned 404. It now exists and `lib/auth/routes.test.ts` guards it; re-test after every major milestone.

Account deletion requires exact confirmation, a checkbox, and server-verified `last_sign_in_at` no older than 30 minutes before final Auth admin deletion.

## 7. Environment Variables

Names only are recorded here; values must never enter this file.

| Variable | Purpose | Exposure | Requirement |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL for browser/server/proxy/admin clients | Browser-safe public | Required |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable or legacy anon value under this exact name | Browser-safe public | Required |
| `SUPABASE_SECRET_KEY` | Shared movie metadata upsert and final Auth-user deletion | Server-only secret | Required for full product |
| `TMDB_READ_ACCESS_TOKEN` | TMDB Bearer token for search/details/import | Server-only secret | Required for movie workflows |
| `VERCEL_URL` | Platform-provided metadata base URL | Server/runtime | Optional; localhost fallback |
| `VERCEL_ENV` | Displayed only by leftover `/protected` tutorial UI | Server/runtime | Optional |
| `VERCEL_PROJECT_PRODUCTION_URL` | Displayed only by leftover tutorial UI | Server/runtime | Optional |
| `NODE_ENV` | Framework mode and development-only safe error logging | Runtime | Framework-provided |
| `PLAYWRIGHT_BASE_URL` | Optional Playwright target override; defaults to `http://localhost:3000` | Test runtime | Optional |
| `CI` | Enables CI retries, one worker, and strict `test.only` rejection | Test runtime | Optional |

`.env.example` lists only the two public Supabase names and is incomplete. `NEXT_PUBLIC_APP_URL`, `TMDB_API_BASE_URL`, and `TMDB_IMAGE_BASE_URL` are not environment variables here; TMDB API/image bases are module constants.

## 8. Database Schema

Important limitation: there is no original base migration, schema dump, generated database types, Supabase CLI config, or remote migration history. `docs/DATABASE.md` combines a prior read-only live inspection with incremental SQL; recheck unversioned base FKs, policies, grants, and indexes against the target project.

| Table | Ownership and purpose | Important current contract | RLS |
|---|---|---|---|
| `profiles` | User-owned, one application profile per Auth identity | `id`, `full_name`, `avatar_url`, `country`, `timezone`, `subscription_plan`, `created_at`, `updated_at`; exact base FK/cascade not versioned | Documented enabled; own-row access expected |
| `movies` | Shared TMDB-derived metadata | Shared ID, unique `tmdb_id`, titles, overview, poster/backdrop, release date/year, runtime, JSONB genres/cast/countries, director, language, public rating, trailer, metadata timestamp | Documented enabled; shared read policy not versioned |
| `user_movies` | User-owned relationship between a user and shared movie | UUID `id`, `user_id`, bigint `movie_id`, status, `favourite`, rating, review, priority, queue, schedule, watched/rewatch, audit timestamps | Enabled; ownership is `auth.uid() = user_id` |
| `user_preferences` | User-owned one-row-per-Auth-user defaults/preferences | UUID `user_id` PK/FK to `auth.users` with delete cascade, application/display/search/notification fields, audit timestamps | Enabled with explicit own-row policies |
| `lists` | User-owned private custom-list metadata | UUID `id`, Auth `user_id`, normalized unique name per user, optional 500-character description, private-only visibility, audit timestamps | Enabled; own SELECT/INSERT/UPDATE/DELETE |
| `list_movies` | Ordered membership from a list to a personal-library relationship | UUID `id`, cascading `list_id`, cascading UUID `user_movie_id`, positive unique-per-list position, audit timestamps | Enabled; every policy requires both owned parent list and owned `user_movies` row |

`movies.tmdb_id` and `user_movies (user_id, movie_id)` are confirmed unique guards. Exact base FK DDL for `profiles`/`user_movies` is absent; confirm account-deletion cascades before production use.

`user_movies` statuses are `want_to_watch`, `watch_next`, `scheduled`, `currently_watching`, `watched`, `on_hold`, and `dropped`. Important fields include `favourite boolean not null default false`, `personal_rating`, `review`, `priority`, `queue_position`, `scheduled_for`/`watched_at` (`timestamptz`), `schedule_timezone`, `schedule_note`, and `would_watch_again`.

`user_preferences` defaults: status `want_to_watch`, priority `0`, view `grid`, date `DD/MM/YYYY`, time `12h`, adult `false`, unreleased `true`, language `en`, page size `24`, notification toggles `false`, offset `60`. Checks restrict these enums/ranges, language-code shape, page sizes 12/24/48/96, and offsets 15/30/60/180/1440.

Personal data placement is mandatory:

- TMDB/canonical metadata belongs on shared `movies`.
- Status, `favourite`, `personal_rating`, review, priority, queue, schedule, watched data, and rewatch intent belong on `user_movies`.
- Profile identity-adjacent presentation fields belong on `profiles`.
- Application/display/search/notification choices belong on `user_preferences`.
- Private collection metadata belongs on `lists`; ordered membership references
  `user_movies.id` through `list_movies`, never `movies.id` or a TMDB ID.
- `favourite` is never inferred from ratings and must never be moved to shared `movies`.

## 9. RLS and Database Privileges

| Object | Current version-controlled or documented rule |
|---|---|
| `profiles` | Own-row RLS is documented; migration restricts authenticated UPDATE to `full_name`, `avatar_url`, `country`, `timezone` |
| `movies` | Shared reads follow deployed policy; only the protected secret client performs metadata upserts |
| `user_movies` | Existing own SELECT/UPDATE policies remain; Part 12 narrowly grants authenticated SELECT/UPDATE on `favourite`; existing INSERT/DELETE policies and base grants remain unversioned |
| `user_preferences` | Own SELECT, INSERT, UPDATE policies; no normal DELETE policy |
| `lists` | Own SELECT/INSERT/UPDATE/DELETE policies. Authenticated gets table SELECT/DELETE plus scoped INSERT (`user_id`, `name`, `description`) and UPDATE (`name`, `description`, `updated_at`) privileges |
| `list_movies` | SELECT/INSERT/UPDATE/DELETE policies each require an owned parent list and owned referenced `user_movies` row. Authenticated gets table SELECT/DELETE plus scoped membership INSERT and position-only UPDATE privileges |
| Query/queue/library RPCs | Security invoker, derive `auth.uid()`, accept no browser user ID, execute revoked from public/anon and granted to authenticated |
| Part 13 list RPCs | Security invoker with fixed `public, pg_temp` search path, `auth.uid()`, per-list locks, public/anon execute revocation, authenticated execute only |

Historical issue: `user_preferences` had correct RLS but only SELECT privilege for `authenticated`. The fix grants `SELECT`, `INSERT`, and `UPDATE`, never `DELETE`. RLS policies and SQL privileges are both required.

Nuance: `202607220003_user_settings.sql` used column-level preference grants, but `202607230001_user_preferences_privileges.sql` grants table-level INSERT/UPDATE. RLS still owner-scopes rows and the trigger controls `updated_at`, but older audit-column restriction claims are stale. Profile column restrictions remain intact.

## 10. Supabase Migrations

| Filename | Purpose | Development-project status |
|---|---|---|
| `202607210001_phase_3_movie_management.sql` | Adds `schedule_note`, queue index, normalization/update/move/schedule/remove security-invoker functions and authenticated execute grants | Unknown; file is non-idempotent and must not be rerun blindly |
| `202607220002_schedule_queue_fixes.sql` | Adds `schedule_timezone`, checks, unique queue/schedule indexes, own SELECT/UPDATE policies, and atomic `move_watch_queue_item` RPC | Unknown; repository has no remote history |
| `202607220003_user_settings.sql` | Ensures profile settings columns; creates preferences, checks, RLS, triggers/backfill, grants, and preference-aware add RPC | Unknown; deployment checklist still calls for manual application |
| `202607230001_user_preferences_privileges.sql` | Grants authenticated SELECT/INSERT/UPDATE and backfills preference rows; no DELETE | Unknown; repository has no remote history |
| `202607280001_part_12_library_improvements.sql` | Adds private `favourite`, five owner/query indexes, private row/facet query functions, and transactional bulk-status/bulk-delete functions | Deployed API exposes the bulk-removal function and the user reports Part 12 working; full migration parity/grants still need authenticated inspection |
| `202607290001_part_13_private_custom_lists.sql` | Creates private `lists`/`list_movies`, constraints/indexes/triggers, eight RLS policies, scoped grants, one summary query, five atomic membership/order RPCs, and cascade-delete compaction | Created locally only; do not execute automatically. Apply manually after all five prior migrations and reload PostgREST |

Original creation migrations for `profiles`, `movies`, and `user_movies` are absent. Contract tests inspect SQL text only; they do not prove remote application or multi-user isolation.

Database-dependent application code is not target-complete until its migration is applied and verified there.

## 11. TMDB Integration

- Provider abstraction: `lib/movies/provider.ts`.
- Server-only adapter: `lib/movies/tmdb-provider.ts`; Bearer token, eight-second timeout, page-one requests, `cache: "no-store"`, and explicit 404/429/timeout handling.
- Boundary mapper: `lib/movies/tmdb-mapper.ts`; maps unknown payloads to internal types, including director, top five cast, genres/countries, rating, and preferred YouTube trailer.
- Search: `/search` reads adult, unreleased, and language preferences; disabling unreleased filters future/missing release dates after mapping.
- Detail ingestion: authenticate, fetch `/movie/{id}` with `credits,videos`, admin-upsert shared `movies`, then create private `user_movies` through the authenticated client/RPC.
- CSV matching uses provider defaults (adult off, unreleased included, English), not stored search preferences.
- Shared duplicates use unique `tmdb_id`; private duplicates use unique `(user_id, movie_id)` plus owner lookups/RPC handling.
- `components/movies/movie-poster.tsx` has an accessible missing-poster fallback; `next.config.ts` restricts TMDB image paths.

TMDB tokens must remain server-only. No TMDB attribution UI was found. A paid/commercial launch must resolve attribution and movie-data licensing before payments.

## 12. Feature Status

Status describes repository implementation, not unverified remote migrations.

| Feature | Status | Main routes/files | Notes |
|---|---|---|---|
| Authentication | Complete | `/auth/*`, `lib/supabase/*` | Email/password, verification, recovery, logout |
| Profiles | Complete | `/settings/profile` | Existing profile row required |
| Movie search | Complete | `/search`, `lib/movies/*` | Title search only |
| Add to library | Complete | `actions/library.ts`, `lib/library/service.ts` | Defaults read from preferences |
| Remove from library | Complete locally | `/library`, `/library/[movieId]` | Single and bulk removal share the authenticated Part 12 relationship-delete RPC; live authenticated retest still needs a QA session |
| Movie status | Complete | Movie detail form | Seven statuses |
| Personal rating | Complete | Movie detail form | Decimal 0–10 |
| Review | Complete | Movie detail form | Private, max 5,000 characters |
| Watched date | Complete | Movie detail/import | Stored as UTC-midnight timestamp |
| Favourite field | Complete | `/library`, `/library/[movieId]`, Part 12 migration/actions | Private `user_movies.favourite`; migration-dependent |
| Watch Next queue | Complete | `/watch-next` | One-based private queue |
| Queue reordering | Complete | `move_watch_queue_item` | Migration-dependent up/down controls |
| Scheduling | Partial | `/schedule`, movie detail | Dedicated flow works; detail edit has timezone/note persistence issues |
| Watched/unwatched UI | Complete | `/library?watched=` | Unwatched means every non-watched status; legacy `filter` remains accepted |
| CSV import | Complete | `/import`, `lib/import/*` | In-memory, review before write |
| CSV export | Complete | `/settings/data/export/csv` | Private no-store attachment |
| JSON export | Complete | `/settings/data/export/json` | Format version 1 |
| Profile settings | Complete | `/settings/profile` | Avatar upload deferred |
| Application preferences | Complete | `/settings/preferences` | Applied to search/add/library/display |
| Notification preferences | Complete | `/settings/notifications` | Storage only; no delivery |
| Delete library data | Complete | `/settings/data` | Deletes current user's relationships only |
| Delete account | Partial | `/settings/data` | Code complete; deployed FK cascades/two-user exercise unverified |
| Dashboard statistics | Partial | `/dashboard` | Summary lists only; no KPIs/charts/ranges |
| Statistics page | Not started | None | No `/statistics`, module, test, or chart dependency |
| Advanced library search | Complete | `/library`, `watchflow_library_rows` | Literal substring title/original/director/cast/genre search, max 100 characters |
| Advanced filters | Complete | `/library` | Status, watched, favourite, genre, director, exact/range year, personal-rating range |
| Sorting controls | Complete | `/library`, `lib/library/query.ts` | Twelve stable database sorts; nullable rating/year/watched values last |
| Pagination | Complete | `/library`, `lib/library/supabase-query.ts` | Exact filtered count and server range; preferences/URL sizes 12/24/48/96 |
| Multi-select | Complete | `components/library/library-selection-workspace.tsx` | Current visible page only; resets on URL scope change |
| Bulk actions | Complete | Part 12 actions/RPCs | Status (scheduled excluded) and relationship deletion; atomic queue normalization |
| Private custom lists | Complete locally | `/lists`, `/lists/[listId]`, movie detail, `lib/lists/*` | Create/edit/delete, one-query summaries, library-only multi-add, confirmed membership removal, atomic up/down ordering, and multi-list movie membership; manual migration/live QA pending |
| Recommendations | Not started | None | Part 14 roadmap |
| Notifications | Deferred | Preferences only | Delivery planned for Part 18 |
| Calendar integration | Deferred | None | Part 18 roadmap |
| Payments | Deferred | None | Part 19 only after separate design/licensing |

## 13. Current Dashboard and Statistics

`app/(app)/dashboard/page.tsx` currently renders:

- the first Watch Next item by queue position;
- every movie scheduled for today in its saved timezone, with profile fallback;
- the four most recently added movies;
- the four most recently watched movies, sorted by `watched_at` then `updated_at`, with personal rating when available;
- signed-in email/profile connection state and quick actions.

Every summary has an empty state; missing profile/provider metadata has safe fallbacks.

There are no numeric KPIs, charts, range filters, watched-month grouping, statistics queries/tests, or chart dependency. Generic Tailwind chart colors are not a chart feature.

Private reads use request-scoped cookie clients. `getAuthContext()` uses React `cache()` for render/request deduplication only; no private statistics result uses shared persistent caching. TMDB fetches/exports are no-store.

## 14. CSV Import and Export

### CSV import

- Route/code: `/import`, `components/import/import-wizard.tsx`, `app/(app)/actions/import.ts`, `lib/import/*`.
- Accepts downloaded comma-delimited `.csv` as UTF-8 memory text; MIME may be CSV, Excel CSV, plain text, or empty browser type.
- Limits: 2 MiB, 500 non-empty rows, 100 reconstructed columns, 10,000 characters/cell, 20-row preview.
- Handles BOM, quoted/escaped cells, embedded newlines, CRLF, duplicate/unnamed headers, and empty rows.
- Seven steps: Upload, Map, Preview, Match, Review, Confirm, Results.
- Required mapping: title. Optional: year, director, cast, genres, rating, status, watched date, review, priority.
- Validates year 1888–current UTC year + 5, rating 0–10, integer priority 0–5, review length, and ISO/unambiguous slash dates.
- Status aliases map to seven statuses; unknown values require accepting `want_to_watch`, while empty defaults automatically.
- Matching scores title/original title/year, returns up to five candidates, caches lookups, and runs four searches maximum. Exact/probable may preselect; ambiguous requires choice. Director/cast/genres do not score.
- Confirmation refetches details. Admin upserts shared metadata; authenticated owner writes use unique guards. Watch Next preserves CSV order.
- Results: imported, already in library, skipped, invalid, unmatched, failed; partial success, retry, copy, and failure download exist.
- Limitations: no live Sheets connection or persisted wizard, comma only, and default TMDB preferences.

### CSV export

- Route: `/settings/data/export/csv`.
- Fields: Title, Original Title, Release Year, Director, Cast, Genres, Public Rating, Personal Rating, Status, Favourite, Priority, Review, Watched Date, Scheduled Date, Schedule Timezone, Would Watch Again, Date Added, TMDB ID.
- Requires fresh authenticated identity and an explicit owner filter.
- Generated in memory with private no-store/nosniff attachment headers.
- Standard quoting applies; cells beginning (even after whitespace) with `=`, `+`, `-`, `@`, or `*` receive an apostrophe.
- Filename: `watchflow-library-YYYY-MM-DD.csv`.

### JSON export

- Route: `/settings/data/export/json`.
- Includes export time, email/profile, preferences, movie metadata, personal fields including favourite, queue positions, and derived schedules.
- Excludes raw Auth records, relationship UUIDs, tokens, passwords, keys, and other users' data.
- `metadata.formatVersion` is `1`.
- Filename: `watchflow-account-data-YYYY-MM-DD.json`.

## 15. Settings Architecture

Profile settings use `profiles`: editable `full_name`, optional `country`, validated IANA `timezone`; Auth email/created time are read-only. `avatar_url` is read/exported, but upload awaits private Storage policies.

Application preferences use `user_preferences`:

- default movie status and priority;
- grid/list default and page size 12/24/48/96;
- date formats `DD/MM/YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD`;
- time formats `12h` or `24h`;
- adult and unreleased search toggles;
- language `en`, `ur`, `es`, `fr`, or `de`.

Notification settings store email, reminder, offset, and weekly-summary choices; nothing is delivered.

Data and Privacy provides exports, `DELETE MOVIES` library deletion, and recent-login `DELETE` plus checkbox account deletion. Library deletion never removes shared `movies`.

## 16. Date, Time, and Timezone Rules

- Scheduled instants are stored in `scheduled_for` as `timestamptz`.
- Local date/time plus validated IANA zone becomes a server-side ISO instant; nonexistent DST times and past times are rejected.
- The selected zone belongs in `schedule_timezone`; `schedule_note` is private.
- `profiles.timezone` is the preferred default, then a valid browser zone where used, then UTC.
- A scheduled row's saved zone precedes the profile zone for Today/Upcoming/Past grouping.
- Profile timezone changes do not rewrite timestamps or saved schedule zones.
- Date/time preferences affect settings/schedule displays; native HTML date inputs remain ISO.
- Watched dates normalize to UTC midnight; the dashboard sorts them, but has no month grouping.

Active caveat: movie detail initializes existing schedules with the current profile zone, not the saved zone, and omits `schedule_timezone`/`schedule_note` from its update payload. `/schedule` persists all fields.

## 17. Security Boundaries

The authenticated cookie-bound Supabase client is mandatory for user-owned:

- profile/preference/library reads;
- `user_movies` and preference inserts;
- owner-filtered updates;
- library/preference/data deletes allowed by RLS;
- exports and queue/schedule operations.

The secret/admin client is limited by call-site policy to:

- shared `movies` metadata upserts after a verified user exists; and
- final deletion of that same freshly verified Auth user.

Sensitive provider/admin/adapters use `import "server-only"`. Never import them into Client Components, expose keys, or bypass RLS/privilege errors.

Server Actions validate untrusted input; verified sessions supply user IDs. Never log secrets/tokens/private rows. CSV uploads are memory-only and exports are on-demand private no-store responses.

Part 12 library reads call authenticated security-invoker functions that derive
`auth.uid()` and then apply count/order/range server-side. Favourite updates
filter by both `user_movies.id` and verified `user_id`. Bulk requests accept at
most 100 unique UUIDs, never a user ID; transactional RPCs reject a stale or
foreign mixed selection before mutation and normalize the caller's queue.

Part 13 list actions use the cookie-bound server client plus fresh
`auth.getUser()`. The browser submits list, `list_movies`, and `user_movies`
UUIDs only; it never submits a user ID. Every membership references
`public.user_movies.id`, and each RLS predicate proves both parent-list and
personal-library ownership. Mutations use security-invoker RPCs with a stable
user-movie-then-list lock order. Deleting a list cascades membership rows only;
deleting a library relationship cascades memberships and a statement trigger
compacts every surviving affected list. Shared `movies` rows are never deleted
or directly referenced by list membership.

## 18. Testing and Quality Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js development server |
| `npm run lint` | ESLint over the repository |
| `npm run typecheck` | Scripted `tsc --noEmit` |
| `npx tsc --noEmit` | Required direct TypeScript check |
| `npm test` | All Vitest tests via `vitest run` |
| `npx vitest run <path>` | Focused Vitest file(s) |
| `npm run test:e2e` | All Playwright specs via headless Chrome |
| `npx playwright test <path>` | Focused Playwright spec(s) |
| `npm run build` | Production Next.js build |
| `npm start` | Serve a completed production build |

`vitest.config.ts` includes `lib/**/*.test.ts` in Node. Those tests are unit,
mocked-adapter, server-markup, route/source, and migration contracts; none use
live Supabase. `playwright.config.ts` runs Chrome against the existing or
auto-started local server. Current specs do not store authenticated state or
test live Part 12 or Part 13 data.

The 2026-07-28 Playwright MCP pass exercised `/`, all public auth/error routes,
and logged-out redirects for dashboard, search, library, Watch Next, schedule,
import, and every settings page. After clean server/browser restarts,
`/auth/sign-up` returned 200, `/library` redirected to login, the 390x844 auth
page had no horizontal overflow, and no unexpected console or local-request
failure occurred. `/statistics` correctly exposed the repository's known 404.
The generated signup fallback could not yield a confirmed QA session, so no
authenticated or destructive library flow was attempted.

The 2026-07-29 Part 13 Playwright MCP pass confirmed that anonymous `/lists`
and a UUID `/lists/[listId]` redirect to `/auth/login`, while
`/auth/sign-up` remains public and loads. Its development-server console
reported repeated blocked HMR WebSocket handshakes for the `127.0.0.1` origin;
no failed non-static application request was reported. The repository
Playwright run supplies the reliable five-viewport public sign-up result. Authenticated list
screenshots and mutation/isolation flows remain blocked by the unapplied
migration and absence of two confirmed QA sessions.

### Last verified

| Check | Status | Latest evidence |
|---|---|---|
| Lint | Passed | `npm run lint`, 2026-07-29 |
| TypeScript | Passed | `npx tsc --noEmit`, 2026-07-29 |
| Unit/contract tests | Passed | `npm test`: 41 files, 356 tests, 2026-07-29 |
| Focused Part 13 tests | Passed | `npx vitest run lib/lists`: 6 files, 75 tests, 2026-07-29 |
| Focused Part 13/Part 12 regressions | Passed | 13 files, 184 tests covering lists plus removal/query/bulk contracts, 2026-07-29 |
| Live database integration | Not run | No local Supabase/PostgreSQL harness or applied Part 13 migration; source contracts and mocked adapters do not prove RLS, grants, cascades, or concurrency |
| Production route smoke | Passed | Playwright MCP: `/auth/sign-up` loaded; anonymous `/lists` and UUID detail redirected to login |
| Playwright public/protection E2E | Passed | `npm run test:e2e`: 3 files, 24 tests, 2026-07-29; auth semantics/errors, list protection, keyboard order, and five public sign-up viewports |
| Authenticated Part 12/13 E2E/live RLS | Not verified | No QA credentials/storage states or applied Part 13 migration; destructive/list CRUD, membership, ordering, isolation, and requested authenticated screenshots were not run |
| Production dependency audit | Failed | Three high transitive advisories remain under Next.js/PostCSS/sharp; no safe non-major npm fix is offered |
| Production build | Passed | `npm run build` on Next.js `16.2.12`, 2026-07-29 |

Mark Passed only after that exact command succeeds.

## 19. Known Issues and Historical Regressions

| State | Issue or lesson |
|---|---|
| Resolved/guarded | `/auth/sign-up` was accidentally removed and returned 404; it now exists with a route-contract test |
| Resolved/guarded | `CardTitle` rendered a `div` and auth errors rendered plain paragraphs; page titles are now `h1` and auth errors use `role="alert"` |
| Operational unknown | Committed migrations do not prove remote application; all five incremental migration states must be checked |
| Resolved locally | `user_preferences` had RLS but insufficient INSERT/UPDATE privileges; the latest patch grants SELECT/INSERT/UPDATE, no DELETE |
| Operational unknown | Preference backfill exists in SQL; existing profile/preference rows and onboarding triggers still require target-project verification |
| Preserved boundary | Shared movie writes require the authenticated-first, server-only admin path; never weaken this to solve RLS errors |
| Resolved/guarded | Empty FormData values previously caused numeric/date update errors; current validators map optional rating/date/text values safely |
| Resolved locally | Individual removal called the undeployed legacy `watchflow_remove_library_movie(p_library_id)` RPC and failed with `PGRST202`; it now submits one validated `user_movies.id` UUID through the working Part 12 removal RPC shared with bulk deletion |
| Migration-dependent | Queue reordering requires `move_watch_queue_item`; missing RPC errors are mapped to a migration message |
| Migration-dependent | Scheduling requires `schedule_timezone`/`schedule_note`; missing columns are detected and reported |
| Active | Detail-form schedule editing can use the wrong zone and fails to persist zone/note; use/fix the dedicated schedule contract |
| Active | The preference privilege patch is table-level and supersedes older column-grant claims in architecture/database docs |
| Active | Base profile/user-movie Auth-delete cascades are not versioned or verified; account deletion needs two-user testing |
| Active | `.env.example` omits `SUPABASE_SECRET_KEY` and `TMDB_READ_ACCESS_TOKEN` names |
| Active | `README.md` is still generic Supabase starter documentation |
| Active | `/protected` is leftover starter UI and displays the signed-in member's claims JSON |
| Active | `statistics-v1` points to the settings commit; there is no Part 11 statistics implementation |
| Active | Import failure-report CSV quotes cells but does not neutralize formula-leading imported titles/messages |
| Resolved locally | `/library` previously fetched every row before filtering/slicing; Part 12 now filters, counts, sorts, and ranges through a private database function |
| Migration-dependent | Part 12 requires `202607280001_part_12_library_improvements.sql`; without it `/library` and favourite/bulk actions show a safe migration-required error |
| Migration-dependent | Part 13 requires `202607290001_part_13_private_custom_lists.sql`; missing table, column/schema-cache, RPC, permission, validation, constraint, and generic database failures have distinct safe handling |
| Active limitation | Part 12 literal substring search scans the authenticated member's joined library; it targets several hundred to about 1,000 movies and has no trigram/full-text index |
| Active limitation | Selection is intentionally current-page only and clears on search/filter/sort/view/page changes; bulk `scheduled` is excluded because no date may be invented |
| Operational unknown | Part 12 SQL/source and mocked adapters pass, but no approved QA identity or applied-migration evidence exists; authenticated search/filter/sort/pagination, favourites, selection, bulk actions, two-user RLS, native-dialog focus, and index plans remain browser-unverified |
| Operational unknown | Part 13 SQL/source and mocked adapters pass, but the migration has not been applied here and no two confirmed QA identities/storage states exist; live RLS, grants, cascades, concurrency, authenticated CRUD/reorder/membership flows, and requested screenshots remain unverified |
| Active limitation | The Add Movies picker returns at most 50 owner-scoped results per search and movie-detail membership reconciliation accepts at most 500 desired list UUIDs; list summaries are not paginated |
| Active limitation | Part 13 membership writes share the Part 12 per-user advisory lock and row order, but the legacy full-library settings DELETE does not take that advisory lock; concurrent full-library deletion versus a list batch remains a live stress-test item |
| Active security debt | `npm audit --omit=dev` reports three high transitive advisories through Next.js/PostCSS/sharp after updating to Next.js 16.2.12; do not apply npm's unsafe major/downgrade suggestion blindly |
| Launch blocker | No TMDB attribution UI or resolved commercial movie-data licensing |
| Troubleshooting note | Browser login “Failed to fetch” is not reproduced here; check public env names, Supabase URL/Auth redirect config, network/CORS, and browser extensions |

Migrations 1 and parts of 2 are not safely repeatable; never rerun old SQL blindly.

## 20. Current Project State

- Latest implemented milestone: **Part 13 — private custom movie lists (local code complete)**.
- Part 11 statistics/dashboard upgrade: **not evidenced in the repository**.
- Next milestone: **Part 14 — Movie Picker and Recommendations**.
- Branch/base HEAD: `master`, `3cc82cb` (`part-12-complete`); Part 13 is uncommitted. Tags `settings-v1` and misleading `statistics-v1` remain on `8f92cbe`.
- Latest migration: `202607290001_part_13_private_custom_lists.sql`.
- Latest feature set: private list CRUD, scalable summaries, personal-library multi-add, atomic ordering/removal, cascade compaction, and movie-detail multi-list membership in addition to the completed Part 12 library tools.
- Baseline Git state was clean; only Part 13 and related list-aware revalidation/documentation changes are now uncommitted.
- Manual Supabase action: confirm the prior five migrations, apply only the Part 13 SQL file, reload PostgREST, run the documented verification SQL, and exercise RLS/order/cascade behavior with two QA users.
- Logged-out Playwright coverage protects `/lists` and UUID detail URLs; authenticated Part 12/13 coverage is blocked as described above.
- Missing `/statistics` is unimplemented functionality, not a runtime failure.

## 21. Next Development Queue

This is the roadmap, not completed functionality.

1. **Part 14 — Movie Picker and Recommendations**
2. **Part 15 — Testing and production hardening**
3. **Part 16 — Preview deployment**
4. **Part 17 — Public beta preparation**
5. **Part 18 — Notifications and calendar integration**
6. **Part 19 — Paid SaaS**

## 22. Part 12 Implementation Notes

Implemented contract:

- Main modules: `lib/library/{query,query-mapping,selection,mutations,supabase-query,supabase-mutations}.ts`; UI: `components/library/{library-controls,library-pagination,library-selection-workspace,library-item-actions}.tsx` and `components/movies/favourite-toggle-form.tsx`.
- `lib/library/query.ts` validates canonical URL state. Exact `year` overrides `yearFrom`/`yearTo`; invalid ranges are ignored with a warning.
- `watchflow_library_rows` searches title, original title, director, JSONB cast names, and genres literally. It has no user-ID parameter and ranges only after owner filters.
- Sorts cover title, added date, release year, personal rating, priority, watched date, and favourite in both requested directions. Nullable data is last; `user_movie_id` is the final tie.
- URL `view`/`perPage` override saved defaults. Sizes are 12/24/48/96; invalid pages redirect; selection covers only the visible page.
- Favourite belongs to `public.user_movies`; direct updates use the authenticated client plus relationship/owner filters.
- Bulk status excludes `scheduled`, appends new Watch Next rows in display order, compacts departures, never invents `watched_at`, and preserves latent schedules.
- Bulk deletion removes only selected owned `user_movies`, never `movies`, and compacts the queue transactionally; mixed stale/foreign selections cause no mutation.
- Individual removal validates `userMovieId` as a UUID and passes a one-item selection through that same authenticated bulk-removal RPC. The RPC derives `auth.uid()`, rejects a stale or foreign ID without mutation, deletes only `user_movies`, and deliberately normalizes the queue after every successful removal.
- Five indexes support added-date, status, favourite, personal-rating, and watched-date queries; shared title/genre/trigram indexes are deferred.

## 23. Part 13 Implementation Notes

Implemented contract:

- Routes: protected `/lists` summaries/CRUD and `/lists/[listId]` detail; the
  stored-movie detail page now includes a private Custom Lists membership
  editor. `My Lists` is in the authenticated shell and `/lists` is a protected
  proxy prefix.
- Main module: `lib/lists/{types,validation,errors,mapping,supabase-lists}.ts`;
  Server Actions: `app/(app)/actions/lists.ts`; UI:
  `components/lists/*`.
- `lists` owns private name/description metadata. The normalized
  case/whitespace-insensitive name index is unique per user. Visibility is
  constrained to `private`.
- `list_movies.user_movie_id` references the UUID `user_movies.id`. A movie can
  be in multiple lists but only once per list. Deleting a list removes only its
  memberships; deleting a personal-library row cascades memberships and
  compacts surviving lists.
- One owner-scoped summary RPC returns counts and at most four posters per list.
  Detail rows use one joined request. The Add Movies picker reuses the Part 12
  library query, caps results at 50, labels existing memberships, and submits
  one ordered batch of at most 100 UUIDs.
- Ordering uses a unique `(list_id, position)` constraint, the Part 12 per-user
  advisory lock for cross-feature membership writes, per-list advisory locks,
  Part 12's queue/creation/UUID relationship-row order, and deferred two-stage
  positive positions. First-up and last-down are successful no-ops. Multi-list
  movie-detail saves lock lists in stable order, preserve existing positions,
  append new memberships, and compact removed lists atomically.
- All list reads/mutations use the authenticated SSR client and fresh
  `auth.getUser()` where required. No list operation imports the admin client,
  accepts a browser user ID, exposes raw Postgres errors, caches private data
  globally, or writes public metadata.
- Tests:
  `lib/lists/{validation,mapping,supabase-lists,actions,migration-contract,ui}.test.ts`;
  route-protection coverage also includes `/lists` and one UUID detail URL.
- Migration:
  `supabase/migrations/202607290001_part_13_private_custom_lists.sql`. It is
  intentionally unapplied by this work and must be applied manually after the
  prior migrations, followed by a separate PostgREST schema reload.
- Scaling limits: summaries are currently unpaginated, picker results are
  capped at 50, movie batches at 100, and the movie-detail desired-list set at
  500. Source/mocked tests do not prove live PostgreSQL RLS, privileges,
  cascades, or concurrency.

## 24. Agent Handoff Protocol

Before starting any task, every coding agent must:

1. Read `AGENTS.md`.
2. Read `docs/PROJECT_CONTEXT.md`.
3. Inspect files relevant to the requested feature.
4. Check the current Git diff.
5. Check existing migration files.
6. Present a short plan.
7. Preserve working routes and features, especially critical auth routes.

After completing any task, update `docs/PROJECT_CONTEXT.md` with only relevant:

- new or changed features and routes;
- database fields, migrations, policies, grants, and application status;
- dependencies and environment-variable **names only**;
- tests and latest actual verification results;
- known/resolved issues;
- current milestone and next milestone.

Do not rewrite unrelated sections, erase useful history, duplicate the full
context elsewhere, or add secrets/actual environment values. Keep this document
concise, internally consistent, and grounded in repository evidence.

## Context Change Log

### 2026-07-29 - Codex Part 13 private custom movie lists

- Added: protected `/lists` and `/lists/[listId]`, authenticated navigation,
  private list create/edit/delete dialogs, one-query count/poster summaries,
  personal-library search/filter/multi-add, accessible persisted up/down order,
  confirmed membership-only removal, and movie-detail multi-list membership.
- Database:
  `supabase/migrations/202607290001_part_13_private_custom_lists.sql` creates
  `lists`/`list_movies`, five justified index/index-backed structures, updated
  timestamp triggers, eight RLS policies, scoped authenticated privileges, six
  callable security-invoker functions, and statement-level cascade
  compaction. The migration was created only, not applied remotely.
- Security: membership always references `user_movies.id`; `auth.getUser()`
  supplies identity; no browser user ID or admin client is used. Missing
  table/column/RPC/schema cache, permission, validation, constraint, stale, and
  generic database failures have distinct safe handling and logging remains
  limited to `message`, `code`, `details`, and `hint`.
- Preservation: Part 12 relationship deletions now revalidate list routes, and
  the database membership-delete trigger keeps surviving list positions
  sequential without modifying Part 12 queue RPCs or shared `movies`.
- Tests: Part 13 focused 6 files/75 tests passed; focused Part 13 plus Part 12
  deletion/query regressions 13 files/184 tests passed; full Vitest 41
  files/356 tests, logged-out Playwright 24 tests, lint, direct TypeScript, and
  production build passed.
- Browser limitation: Playwright MCP verified logged-out list protection and
  public sign-up only. The requested authenticated screenshots, CRUD/order,
  two-user isolation, and live database/concurrency checks were not run because
  the migration is intentionally unapplied and no QA credentials/storage
  states exist.
- Milestone: Part 13 is implemented locally; Part 14 Movie Picker and
  Recommendations is next.

### 2026-07-29 - Codex single-movie removal fix

- Diagnosed: the card already submitted `user_movies.id`; the original deployed error was `PGRST202` because `watchflow_remove_library_movie(p_library_id)` was absent from the PostgREST schema cache, whose hint named the available Part 12 bulk-removal function.
- Changed: retired the legacy single-delete adapter, renamed the browser boundary to `userMovieId`, routed one-item removal through the shared authenticated Part 12 helper, added specific safe messages, exact affected-route revalidation, refresh/success behavior, and persisted safe Supabase error fields only.
- Database/queue: no migration or target-data change; deletion remains `user_movies`-only and the existing transactional Part 12 RPC deliberately normalizes the caller's queue after all removals.
- Tests: focused deletion/Part 12 tests passed (7 files, 113 tests); full Vitest passed (35 files, 281 tests); logged-out/public Playwright passed (22 tests); lint, direct TypeScript, and production build passed.
- Browser limitation: Playwright MCP had no authenticated session or QA credentials, so the requested destructive status/queue/two-user/filter/pagination matrix was not executed and is not claimed as passed.
- Part 12 status: local implementation and automated regression coverage are complete; authenticated destructive QA remains before final live sign-off.

### 2026-07-28 - Codex browser QA hardening

- Added: Playwright 1.62.0 configuration plus 22 logged-out auth, route-protection, keyboard, and responsive tests.
- Changed: Auth card titles are semantic headings; auth errors and recovery success are announced.
- Migration: No database change; Part 12 migration application remains unknown and manual.
- Tests: Lint, TypeScript, 271 Vitest tests, 119 focused Part 12 tests, 22 Playwright tests, and production build passed.
- Known issue: Authenticated Part 12/two-user QA is blocked by missing QA credentials/confirmation and unapplied-migration evidence; three high transitive production audit findings remain.
- Next: Apply/verify the Part 12 migration in development, supply two confirmed QA users, complete authenticated browser QA, then proceed to Part 13.

### 2026-07-28 — Codex Part 12

- Added: Private search/facets, filters, twelve sorts, ranged pagination, favourites, current-page selection, and confirmed bulk status/deletion.
- Changed: `/library`, stored-movie detail, CSV/JSON exports, library query/mutation modules, and milestone documentation.
- Migration: `202607280001_part_12_library_improvements.sql`; manual application and live privilege/RLS verification required.
- Tests: Lint, TypeScript, 270 Vitest cases, build, and logged-out route smoke passed; no live Supabase/Playwright test.
- Known issue: Part 11 `/statistics` remains absent; Part 12 search is a bounded literal scan and selection is page-local.
- Next: Part 13 custom lists.

### 2026-07-28 — Codex context-system audit

- Added: Canonical repository-wide project context and mandatory handoff protocol.
- Migration/tests: No schema change; inventoried four migrations; lint, TypeScript, 155 tests, and build passed.
- Known issue: Part 11/statistics is absent despite the `statistics-v1` tag.
- Next: Part 12 search and library improvements; do not implement it during this task.
