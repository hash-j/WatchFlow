# WatchFlow Project Context

Last updated: 2026-07-30
Last updated by: Codex  
Purpose: Canonical project handoff and single source of truth for coding agents  
Current phase: Part 15 hardening and test architecture are implemented locally; the required authenticated workflow matrix and live Preview verification remain incomplete because migrations are unapplied and disposable QA credentials were unavailable
Current branch: `master` at `6d5352a` (`feat: add random movie picker and rule-based recommendations`); Part 15 is uncommitted
Local status: The inspected Part 14 baseline was clean; Part 15 application, test, SQL-verification, dependency, and documentation changes are local only; no remote database schema, account, or target data was modified

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
7. Pick a filtered random library movie or review transparent, rule-based
   recommendations from the private library.
8. Import a downloaded CSV, export private data, and manage account settings.

The product currently supports authentication, profiles, title search, private
libraries, movie management, queueing, scheduling, favourites, private custom
lists, a random picker, rule-based recommendations, CSV import, CSV/JSON
export, settings, and basic dashboard summaries. It does **not** contain a
statistics page, charts, public/shared lists, AI recommendations, notification
delivery, calendar sync, or payments.

The direction remains a production-oriented SaaS, but paid launch is deferred. The repository contains no billing implementation or proof of a production deployment.

## 3. Technology Stack

| Area | Actual repository choice |
|---|---|
| Framework | Next.js App Router; `next` pinned and installed as `16.2.12` |
| UI runtime | React and React DOM `19.2.7` installed (`^19.0.0` declared) |
| Language | TypeScript `5.9.3`, strict mode, path alias `@/*` |
| Styling | Tailwind CSS `3.4.19`, PostCSS, Autoprefixer, `tailwindcss-animate` |
| Components | Radix primitives, shadcn-style local components, Lucide icons, `next-themes` |
| Auth/data | Supabase Auth, PostgreSQL, and RLS through `@supabase/ssr 0.12.3` and `@supabase/supabase-js 2.110.7` |
| Movie data | Server-only TMDB API v3 adapter with provider-neutral internal types |
| Validation | Zod `4.4.3` for settings and custom lists; typed custom validators for library/import/TMDB inputs |
| CSV parsing | Custom parser in `lib/import/csv.ts`; no third-party CSV package |
| Charts | None; no charting dependency exists |
| Tests | Vitest `4.1.10`; 55 unit/contract files plus a guarded real-Supabase integration configuration |
| Browser E2E | `@playwright/test 1.62.0`, headless Chrome, safe in-memory QA contexts, public regressions, and credential-gated authenticated/two-user/account-deletion suites |
| Deployment | Vercel is the intended target inferred from runtime variables/starter UI; no `vercel.json` or deployment record exists |
| Package manager | npm with `package-lock.json` lockfile version 3 |

Part 15 aligns `eslint-config-next` with Next `16.2.12`, migrates ESLint to
the native flat configuration, and overrides Next's internal PostCSS/sharp
versions to audited compatible releases. Final production-only and full
`npm audit` runs both report zero vulnerabilities.

## 4. Repository Structure

| Path | Purpose |
|---|---|
| `app/` | The only App Router root; public/auth routes and protected `(app)` route group |
| `app/(app)/actions/` | Library, management, CSV-import, Part 13 list, and Part 14 picker Server Actions |
| `components/` | Auth, shell, movie, import, settings, library/list UI, Part 14 discovery UI, and reusable UI components |
| `lib/auth/` | Safe redirect validation and auth route contracts |
| `lib/movies/` | Provider contract, TMDB adapter/mapper, authenticated rate limiting, shared metadata cache, movie types, and validation |
| `lib/library/` | Legacy/detail library service plus Part 12 query parsing, URL state, mapping, selection, mutations, queue, schedule, and Supabase adapters |
| `lib/import/` | CSV parsing, mapping, validation, matching, confirmation, persistence |
| `lib/settings/` | Settings adapters/types, formatting, exports, and data controls |
| `lib/lists/` | Part 13 list types, Zod validation, defensive mapping, safe errors, authenticated queries/mutations, and tests |
| `lib/discovery/` | Part 14 private dataset adapter, mapping, picker validation/matching, mood rules, recommendation scoring/diversity, errors, types, and tests |
| `lib/supabase/` | Browser, server, proxy, auth-context, admin, and safe-error modules |
| `docs/` | Architecture, database, product, testing/security/readiness reports, implementation plan, and this canonical context |
| `supabase/migrations/` | Seven incremental SQL migrations; the original base schema is absent |
| `supabase/verification/` | Read-only database readiness and production security audit scripts |
| `integration/`, `vitest.integration.config.ts` | Guarded, read-only, two-user real-Supabase RLS verification |
| `scripts/` | Post-build client-secret-pattern scanner |
| `lib/**/*.test.ts` | Vitest unit, adapter, route/source, and migration-contract tests |
| `e2e/`, `playwright.config.ts` | Public auth/protection/responsive tests plus guarded in-memory QA fixtures, two-user isolation, controlled mutation, CSV, and disposable deletion coverage |
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
| `/picker` | Page | Protected random picker using explicit private-library filters, URL filter state, and session-memory repeat avoidance |
| `/recommendations` | Page | Protected transparent rule-based recommendations from eligible unwatched private-library movies |
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
| `/protected` | Page | Protected compatibility route that redirects to `/dashboard`; it no longer renders starter claims/tutorial content |

No `/statistics` or `/api/*` route exists. Loading, error, not-found, layout, favicon, and metadata-image files are framework boundaries/assets, not routes.

## 6. Authentication Architecture

- Supabase email/password Auth uses cookie-backed `@supabase/ssr` clients.
- Browser client: `lib/supabase/client.ts`; public URL and publishable key only.
- Server client: `lib/supabase/server.ts`; one request-scoped client using `cookies()`.
- Session proxy: root `proxy.ts` delegates to `lib/supabase/proxy.ts`, preserves every Supabase cookie mutation, calls `auth.getClaims()`, and redirects anonymous protected prefixes to `/auth/login`.
- The protected `app/(app)/layout.tsx` repeats the verified-claims boundary through `lib/supabase/auth.ts` and owner-filters the profile by `claims.sub`.
- Settings, library mutations, imports, exports, discovery reads, and
  destructive operations use fresh `auth.getUser()` checks where current
  Auth-server data is required.
- Login calls `signInWithPassword()`, then replaces navigation with `/dashboard` and refreshes Server Components.
- Signup calls `signUp()` with an email redirect to `/auth/callback?next=/dashboard`, then shows `/auth/sign-up-success`.
- `/auth/callback` supports PKCE `code` exchange and token-hash OTP verification;
  `/auth/confirm` supports token-hash links.
- `lib/auth/safe-redirect.ts` accepts only internal single-slash paths and rejects missing, protocol-relative, or backslash-containing redirect values.
- Recovery uses `/auth/callback?next=/auth/update-password`; the reset/update page verifies claims before the browser calls `updateUser()`.
- Callback OTP types are allowlisted and callback failures use stable reason
  codes rather than provider messages in URLs.
- Sign-out is a cookie-aware Server Action, checks fresh Auth state, clears the
  local session, disables repeat submission while pending, and redirects only
  after Supabase succeeds.
- Browser Supabase configuration is validated before client construction;
  public auth forms map configuration, network, and provider failures to
  controlled messages and never expose a configuration-related `Failed to
  fetch`.
- Auth cards expose page-level `h1` headings; form/provider errors use `role="alert"`, and forgot-password success uses `role="status"`.
- The final Playwright MCP/repository E2E pass confirmed public auth semantics,
  controlled callback failures, keyboard order, and `/auth/sign-up` route
  stability. The real invalid-provider-login case was guarded and skipped in
  that final run; source tests still enforce controlled auth-error mapping.

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
| `NEXT_PUBLIC_APP_URL` | Reserved public application origin name; current source does not consume it | Browser-safe public | Optional |
| `VERCEL_URL` | Platform-provided metadata base URL | Server/runtime | Optional; localhost fallback |
| `VERCEL_ENV` | Referenced only by a dormant starter tutorial component; no current route renders it | Server/runtime | Optional |
| `VERCEL_PROJECT_PRODUCTION_URL` | Referenced only by a dormant starter tutorial component; no current route renders it | Server/runtime | Optional |
| `NODE_ENV` | Framework mode and development-only safe error logging | Runtime | Framework-provided |
| `PLAYWRIGHT_BASE_URL` | Optional Playwright target override; defaults to `http://localhost:3000` | Test runtime | Optional |
| `E2E_BASE_URL` | Preferred Playwright target override | Test runtime | Optional |
| `E2E_WEB_SERVER_COMMAND` | Local command Playwright manages for the target | Test runtime | Optional |
| `E2E_TARGET_ENV` | Must equal `development` before authenticated QA mutations are enabled | Test runtime | Required for authenticated QA |
| `E2E_EXPECTED_SUPABASE_URL` | Exact disposable-development project pin; must match `NEXT_PUBLIC_SUPABASE_URL` | Test runtime | Required for authenticated QA and live integration |
| `E2E_USER_A_EMAIL`, `E2E_USER_A_PASSWORD` | Disposable QA User A | Test secret | Required for authenticated QA |
| `E2E_USER_B_EMAIL`, `E2E_USER_B_PASSWORD` | Disposable QA User B | Test secret | Required for isolation QA |
| `E2E_DELETE_ACCOUNT_EMAIL`, `E2E_DELETE_ACCOUNT_PASSWORD` | Dedicated one-shot deletion account, distinct from A/B | Test secret | Required only for deletion QA |
| `E2E_RUN_ACCOUNT_DELETION` | Explicit one-shot deletion opt-in | Test runtime | Required only for deletion QA |
| `E2E_TEST_MOVIE_QUERY` | Controlled QA search title | Test runtime | Optional |
| `RUN_SUPABASE_INTEGRATION_TESTS` | Explicit real-development-project RLS suite opt-in | Test runtime | Required for live integration |
| `CI` | Enables CI retries, one worker, and strict `test.only` rejection | Test runtime | Optional |

`.env.example` records these names and non-secret local placeholders only.
Real values remain in ignored local/CI configuration. `TMDB_API_BASE_URL` and
`TMDB_IMAGE_BASE_URL` are not environment variables here; TMDB API/image bases
remain fixed module constants.

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
| `202607300001_part_15_tmdb_rate_limits.sql` | Adds durable authenticated TMDB rate-limit buckets/RPC, canonical shared-cache columns, browser write revocation for `movies`, transactional management/schedule RPC replacements, and preference-default repair | Created locally only; do not execute automatically. Apply manually after prior migrations, then reload PostgREST and run both Part 15 verification scripts |

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
| Scheduling | Complete locally | `/schedule`, movie detail, transactional management RPCs | Saved timezone/note are preserved; migration application and authenticated QA remain pending |
| Watched/unwatched UI | Complete | `/library?watched=` | Unwatched means every non-watched status; legacy `filter` remains accepted |
| CSV import | Complete | `/import`, `lib/import/*` | In-memory, review before write |
| CSV export | Complete | `/settings/data/export/csv` | Private no-store attachment |
| JSON export | Complete | `/settings/data/export/json` | Format version 2 includes owned custom lists/memberships without internal IDs |
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
| Random movie picker | Complete locally | `/picker`, `lib/discovery/*` | URL filters, eight moods, secure server selection, capped session-memory repeat avoidance; authenticated browser QA pending |
| Rule-based recommendations | Complete locally | `/recommendations`, `lib/discovery/*` | Transparent seeds, scoring, concrete reasons, diversity, refresh, and cold starts; authenticated two-user QA pending |
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
- Status aliases map to the six non-scheduled statuses; `scheduled` and other
  unknown values require accepting `want_to_watch` because CSV has no schedule
  instant/timezone fields. Empty status defaults automatically.
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
- `metadata.formatVersion` is `2`.
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

Movie detail and the dedicated schedule route prefer the row's saved timezone,
persist timezone/note values, and use transactional RPCs so queue compaction
cannot fail after the primary schedule/status mutation commits.

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
| `npm run test:integration` | Guarded real-development-Supabase RLS suite |
| `npx vitest run <path>` | Focused Vitest file(s) |
| `npm run test:e2e` | All Playwright specs via headless Chrome |
| `npx playwright test <path>` | Focused Playwright spec(s) |
| `npm run scan:client-secrets` | Scan browser/rendered build artifacts for server-secret patterns |
| `npm run build` | Production Next.js build |
| `npm start` | Serve a completed production build |

`vitest.config.ts` includes `lib/**/*.test.ts` in Node. Those tests are unit,
mocked-adapter, server-markup, route/source, and migration contracts; none use
live Supabase. The separate integration config is opt-in, read-only, and
requires a confirmed development target and two QA identities.
`playwright.config.ts` runs Chrome against an existing or auto-started local
server. Authenticated specs create isolated in-memory contexts and never write
storage state; they remain skipped until the development/credential guards are
satisfied.

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

The 2026-07-29 Part 14 Playwright MCP pass confirmed anonymous `/picker` and
`/recommendations` redirect to `/auth/login`; `/auth/sign-up` remained public,
rendered its `Sign up` heading at 390x844, matched the 390px document width, and
kept inspected controls inside the viewport. No non-static failed request or
application/hydration error was observed. The MCP development connection again
reported only its repeated HMR WebSocket handshake failure. The repository has
no QA credentials or authenticated storage states, so none of the requested
authenticated picker/recommendation/two-user flows or discovery screenshots
were run.

The 2026-07-30 Part 15 production-server run passed 35 public/protection/auth/
responsive tests with automatic safe console/network assertions and skipped 6
credential-gated authenticated/destructive tests. A clean-restart Playwright
MCP pass found zero public warnings/errors, no failed application request, no
inline secret pattern, and no storage/cookie residue. It did not authenticate
or mutate data.

### Last verified

| Check | Status | Latest evidence |
|---|---|---|
| Lint | Passed | `npm run lint`, 2026-07-30; Next 16 native flat config, no rule suppressions |
| TypeScript | Passed | `npx tsc --noEmit`, 2026-07-30 |
| Unit/contract tests | Passed | `npm test`: 55 files, 534 tests, 2026-07-30 |
| Focused Part 14 tests | Passed | `npx vitest run lib/discovery`: 7 files, 113 tests covering moods, picker parsing/matching/randomness, recommendation rules, mapping, authenticated adapter, action, and UI/security contracts |
| Focused Part 13 tests | Passed | `npx vitest run lib/lists`: 6 files, 75 tests, 2026-07-29 |
| Focused Part 13/Part 12 regressions | Passed | 13 files, 184 tests covering lists plus removal/query/bulk contracts, 2026-07-29 |
| Live database integration | Skipped | `npm run test:integration` loaded 1 file/5 tests, but all were skipped because the live development guard/QA credentials were absent |
| Production route smoke | Passed, public only | Clean Playwright MCP: canonical signup, auth failure/not-found, protected redirects, mobile overflow/touch size, clean storage, safe console/network/HTML |
| Playwright public/protection E2E | Passed | `npx playwright test --workers=1`: 35 passed, 6 credential-gated skipped, 2026-07-30 |
| Authenticated Part 12-15 E2E/live RLS | Not verified | No confirmed QA credentials or applied-migration evidence; guarded suites exist but were not executed |
| Client secret scan | Passed | 462 artifacts, no forbidden/configured-value leak; one reviewed Supabase SDK sentinel |
| Dependency audits | Passed | Production-only and full `npm audit`: zero vulnerabilities |
| Production build | Passed | `npm run build` on Next.js `16.2.12`; TypeScript and 34 static page generations completed, 2026-07-30 |

Mark Passed only after that exact command succeeds.

## 19. Known Issues and Historical Regressions

| State | Issue or lesson |
|---|---|
| Resolved/guarded | `/auth/sign-up` was accidentally removed and returned 404; it now exists with a route-contract test |
| Resolved/guarded | `CardTitle` rendered a `div` and auth errors rendered plain paragraphs; page titles are now `h1` and auth errors use `role="alert"` |
| Operational unknown | Committed migrations do not prove remote application; all seven incremental migration states must be checked |
| Resolved locally | `user_preferences` had RLS but insufficient INSERT/UPDATE privileges; the latest patch grants SELECT/INSERT/UPDATE, no DELETE |
| Operational unknown | Preference backfill exists in SQL; existing profile/preference rows and onboarding triggers still require target-project verification |
| Preserved boundary | Shared movie writes require the authenticated-first, server-only admin path; never weaken this to solve RLS errors |
| Resolved/guarded | Empty FormData values previously caused numeric/date update errors; current validators map optional rating/date/text values safely |
| Resolved locally | Individual removal called the undeployed legacy `watchflow_remove_library_movie(p_library_id)` RPC and failed with `PGRST202`; it now submits one validated `user_movies.id` UUID through the working Part 12 removal RPC shared with bulk deletion |
| Migration-dependent | Queue reordering requires `move_watch_queue_item`; missing RPC errors are mapped to a migration message |
| Migration-dependent | Scheduling requires `schedule_timezone`/`schedule_note`; missing columns are detected and reported |
| Resolved/guarded | Detail-form schedule editing now defaults to its saved schedule zone and persists/clears zone and note through the dedicated contract |
| Resolved/documented | The preference privilege patch is table-level; architecture/database/security verification now use that source-of-truth contract |
| Active | Base profile/user-movie Auth-delete cascades are not versioned or verified; account deletion needs two-user testing |
| Resolved locally | `.env.example` lists server/test variable names without real secret values |
| Resolved locally | `README.md` is WatchFlow-specific and documents guarded setup/migration/testing steps |
| Resolved locally | `/protected` redirects to the dashboard and no longer renders claims JSON |
| Active | `statistics-v1` points to the settings commit; there is no Part 11 statistics implementation |
| Resolved/guarded | Shared CSV escaping neutralizes formula-leading values, including after whitespace or line breaks, in exports and import failure reports |
| Resolved locally | `/library` previously fetched every row before filtering/slicing; Part 12 now filters, counts, sorts, and ranges through a private database function |
| Migration-dependent | Part 12 requires `202607280001_part_12_library_improvements.sql`; without it `/library` and favourite/bulk actions show a safe migration-required error |
| Migration-dependent | Part 13 requires `202607290001_part_13_private_custom_lists.sql`; missing table, column/schema-cache, RPC, permission, validation, constraint, and generic database failures have distinct safe handling |
| Active limitation | Part 12 literal substring search scans the authenticated member's joined library; it targets several hundred to about 1,000 movies and has no trigram/full-text index |
| Active limitation | Selection is intentionally current-page only and clears on search/filter/sort/view/page changes; bulk `scheduled` is excluded because no date may be invented |
| Operational unknown | Part 12 SQL/source and mocked adapters pass, but no approved QA identity or applied-migration evidence exists; authenticated search/filter/sort/pagination, favourites, selection, bulk actions, two-user RLS, native-dialog focus, and index plans remain browser-unverified |
| Operational unknown | Part 13 SQL/source and mocked adapters pass, but the migration has not been applied here and no two confirmed QA identities/storage states exist; live RLS, grants, cascades, concurrency, authenticated CRUD/reorder/membership flows, and requested screenshots remain unverified |
| Active limitation | The Add Movies picker returns at most 50 owner-scoped results per search and movie-detail membership reconciliation accepts at most 500 desired list UUIDs; list summaries are not paginated |
| Active limitation | Part 13 membership writes share the Part 12 per-user advisory lock and row order, but the legacy full-library settings DELETE does not take that advisory lock; concurrent full-library deletion versus a list batch remains a live stress-test item |
| Active limitation | Part 14 processes at most the 1,000 most recently added `user_movies` relationships per request, keeps at most 50 recent picker IDs in component memory, and renders at most 16 recommendations |
| Operational unknown | Part 14 pure rules, mocked authenticated adapter, route contracts, and logged-out browser protection pass, but no two confirmed QA sessions exist; authenticated discovery screens, mutations, screenshots, responsive layouts, and live cross-user isolation remain browser-unverified |
| Browser tooling note | Playwright MCP reports repeated development HMR WebSocket handshake failures for its `127.0.0.1` origin; the repository Playwright run completed without application request failures |
| Resolved locally | Next `16.2.12`, aligned ESLint config, and compatible internal PostCSS/sharp overrides produce zero-vulnerability production-only and full audits |
| Launch blocker | No TMDB attribution UI or resolved commercial movie-data licensing |
| Resolved/guarded | Browser auth configuration/network failures map to controlled messages; source contracts guard the mapping, while the real invalid-provider Playwright case remains development-gated and was skipped in the final run |
| Resolved/guarded | Credentialed QA previously trusted a loopback app URL without pinning its Supabase backend; authenticated/integration suites now require an exact expected-project URL match and credentialed Playwright never reuses an unknown listener |
| Resolved/guarded | ASCII-only CSV title normalization collapsed distinct Urdu titles in matching and duplicate detection; shared Unicode normalization and regressions preserve letters/numbers |
| Resolved/guarded | CSV accepted `scheduled` without an instant/timezone; it now requires explicit fallback to an unscheduled status |
| Resolved locally | Per-user detail locales could churn the one-row-per-TMDB shared cache and expose preference-derived shared state; detail metadata is canonical English and preferred language remains search-only |
| Resolved locally | Status/schedule updates could commit before a separate queue-normalization call failed; the Part 15 patch and application now use transactional owner-derived RPCs |
| Resolved locally | The concise SQL security result could miss required policy operations or column-level privilege leaks; it now includes both checks |

Migrations 1 and parts of 2 are not safely repeatable; never rerun old SQL blindly.

## 20. Current Project State

- Latest work: **Part 15 testing and production hardening**. Its hardening and
  test architecture are implemented locally; the required authenticated
  workflow matrix and live Preview verification remain incomplete.
- Part 11 statistics/dashboard upgrade: **not evidenced in the repository**.
- Next milestone: **Part 16 — Preview Deployment**.
- Branch/base HEAD: `master`, `6d5352a` (`feat: add random movie picker and rule-based recommendations`); Part 15 is uncommitted. Tags `settings-v1` and misleading `statistics-v1` remain historical.
- Latest migration: `202607300001_part_15_tmdb_rate_limits.sql` (local only, unapplied).
- Latest feature set: private custom lists plus a URL-filtered random picker,
  eight explicit moods, bounded in-session repeat avoidance, and transparent
  scored/deduplicated/diversified private-library recommendations.
- Baseline Git state at `6d5352a` was clean; the current worktree contains the
  Part 15 hardening/test architecture, SQL verification, migration, dependency,
  and documentation changes.
- Part 15 requires manual migration application and database-object
  verification in the Preview development project. No remote schema was
  changed during this milestone.
- Public/protection Playwright is green; authenticated Part 12-15 and live RLS
  coverage is blocked as described above.
- Missing `/statistics` is unimplemented functionality, not a runtime failure.

## 21. Next Development Queue

This is the roadmap, not completed functionality.

1. **Part 16 — Preview deployment**
2. **Part 17 — Public beta preparation**
3. **Part 18 — Notifications and calendar integration**
4. **Part 19 — Paid SaaS**

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

## 24. Part 14 Implementation Notes

Implemented contract:

- Routes: protected `/picker` and `/recommendations`; both appear in the
  authenticated shell and proxy prefix set. Anonymous requests redirect to
  `/auth/login`. The private pages remain request-scoped Server Components
  under Suspense and expose neither private metadata nor user IDs through
  public route metadata.
- Main module:
  `lib/discovery/{types,moods,picker,recommendations,mapping,errors,supabase-discovery}.ts`;
  picker Server Action: `app/(app)/actions/discovery.ts`; UI:
  `components/discovery/*`.
- Dataset: one exact-column `user_movies -> movies!inner` query through the
  normal cookie-bound SSR client after fresh `auth.getUser()`. RLS and an
  explicit verified-user filter both apply. The query is stable, bounded to
  rows 0-999, returns an exact count/truncation flag, calls neither TMDB nor an
  admin client, and never selects or returns `user_id`. The picker action
  projects out recommendation-only `personal_rating` before its one selected
  movie crosses the Client Component boundary.
- Picker filters: represented genre; maximum runtime 90/120/150/180; minimum
  **public** rating from `movies.public_rating`; eight explicit moods; decade
  period; watched/unwatched/any; Watch Next only; and favourite only. Runtime,
  public-rating, and year nulls remain eligible with no corresponding filter
  and are excluded when that filter is active. Default Unwatched follows the
  requested `status !== "watched"` definition, including Dropped; Watch Next
  requires the exact `watch_next` status and overrides watched-state display.
- Mood rules: Exciting = Action/Adventure; Relaxing =
  Animation/Comedy/Romance plus runtime <=130; Funny = Comedy; Emotional =
  Drama/Romance; Dark = Crime/Horror/Thriller; Intense =
  Action/Crime/Thriller/War; Mind-Bending =
  Mystery/Science Fiction/Thriller; Family-oriented =
  Adventure/Animation/Family. Family-oriented copy explicitly states that
  incomplete certification metadata cannot establish child suitability.
- Picker selection: all filters apply before secure server randomness.
  Excluded values must be at most 50 valid `user_movies.id` UUIDs and only
  subtract from the newly authenticated owned candidate set. The Client
  Component keeps exclusions in memory only, avoids repeats while alternatives
  remain, resets after exhausting the eligible pool, and preserves validated
  filters—not private IDs—in the URL.
- Recommendation seeds: personal rating >=8 first, then watched favourites,
  then watched rating >=7; at most five seeds and three rendered seed groups.
  Rated-genre weights are divided across a movie's genres. A director pattern
  needs at least two ratings averaging >=7.
- Recommendation candidates: only `want_to_watch`, `watch_next`, `scheduled`,
  and `on_hold`; `currently_watching`, `watched`, and `dropped` are excluded.
  Seeds are excluded from output. Recommendations are globally deduplicated
  and capped at 16.
- Score weights: +4 per shared genre capped at +12, +3 same director, +1
  release years within 10, +1 runtime within 30 minutes, +1 favourite, +1
  Watch Next, +1 public rating >=7 or +2 >=8, and seed weight +1 at rating 9
  or +2 at 10. Missing metadata adds no quality penalty. Stable ties use public
  rating, title, and relationship UUID. Soft genre/director diversity may
  select within two points of the current best; refresh only changes
  equal-score presentation after the diversity penalty.
- Every displayed item has a concrete stored-signal reason. Cold starts
  distinguish empty library, no eligible candidates, no ratings, and no
  suitable recommendations. The UI says Rule-based recommendations and makes
  no AI, prediction, psychological, or family-safety claim.
- Integration: result cards reuse Part 12 favourite and one-item Watch Next
  mutations and link to the Part 13 movie-detail membership editor. Viewing or
  picking is read-only. Library/management/import/full-library deletion paths
  revalidate both discovery routes.
- Database: no Part 14 migration, index, table, RPC, policy, grant, trigger, or
  stored recommendation result. No dependency or environment variable was
  added.
- Tests:
  `lib/discovery/{moods,picker,recommendations,mapping,supabase-discovery,actions,ui}.test.ts`;
  logged-out E2E route protection also covers both routes.
- Browser limitation: repository Playwright passed the public/protection suite,
  and MCP confirmed both new routes redirect to login plus `/auth/sign-up`
  remains public at 390x844 with no overflow. No confirmed QA sessions or
  storage states exist, so authenticated picker/recommendation flows,
  mutation shortcuts, two-user isolation, five-viewport discovery layouts,
  and requested discovery screenshots were not run and are not claimed.

## 25. Part 15 Testing and Production-Hardening Notes

### Local hardening and test architecture

Part 15 hardening and test architecture are implemented locally. The required
authenticated workflow matrix and live Preview verification are incomplete;
this is not a production-readiness claim.

- Unit/contract tests use typed Supabase/provider mocks and source/migration
  contracts; they never connect to the configured project.
- `integration/supabase-rls.integration.test.ts` is a read-only, two-user,
  real-development-project suite. It requires
  `RUN_SUPABASE_INTEGRATION_TESTS=true`, `E2E_TARGET_ENV=development`, the
  public Supabase names, an exact `E2E_EXPECTED_SUPABASE_URL` match, and QA A/B
  credentials. It creates no records, signs out locally, and performs no data
  cleanup; the operator must still confirm the pinned project is disposable
  development infrastructure.
- Playwright creates fresh in-memory browser contexts and never serializes
  cookies or auth state. Public tests always run. Authenticated mutations
  require the same development/loopback guard, an exact expected Supabase URL
  pin, and QA A/B credentials. Credentialed runs start the configured server
  rather than reusing an unknown loopback listener; helpers remove only the
  exact TMDB/list records they created. Account deletion additionally requires
  a distinct dedicated account and `E2E_RUN_ACCOUNT_DELETION=true`.
- CSV browser fixtures are generated in memory, capped, and are not confirmed
  unless a test explicitly owns the cleanup. QA artifacts and auth state are
  ignored by Git.
- Required environment-variable names and destructive/non-destructive
  boundaries are documented in `docs/TESTING.md` and `.env.example`; no values
  are committed.

Final local results on 2026-07-30:

- `npm run lint`: passed with the Next 16 native flat configuration and no
  rule suppressions.
- `npx tsc --noEmit`: passed.
- `npm test`: 55 files, 534 tests passed.
- `npm run test:integration`: runner passed, but 1 file/5 tests were skipped
  because the live-development guard and QA credentials were absent. Live RLS
  is therefore unverified.
- `npx playwright test --workers=1` against a managed production server: 35
  passed, 6 credential-gated tests skipped, 0 failed. The passing suite covers
  public auth semantics, callback/reset failure handling, `/auth/sign-up`
  non-404, all logged-out protected-route redirects, no redirect loops,
  automatic safe console/network diagnostics, keyboard focus, and the five
  requested public viewports.
- Playwright MCP restarted the production server, opened a clean context with
  zero cookies/storage entries, verified canonical signup, controlled auth
  errors, protected redirects, mobile overflow/touch size, and a friendly
  not-found page. It found no unexpected public console warning/error, failed
  application request, or inline secret pattern. Safe screenshots exist only
  under ignored `qa-artifacts/`.
- `npm run scan:client-secrets`: 462 built artifacts checked, passed. One
  Supabase SDK `sb_secret_` sentinel in a client chunk was reviewed; no
  configured secret value leaked.
- `npm audit --omit=dev` and full `npm audit`: zero vulnerabilities.
- `npm run build`: passed on Next `16.2.12`, including TypeScript and all 34
  static page generations. The route output confirms that `/statistics` is
  still absent.

### Security, RLS, and database readiness

- `docs/SECURITY_AUDIT.md` records the Server Action, Route Handler,
  admin-client, upload, export, authentication, logging, and browser-boundary
  review. User identity comes from fresh `auth.getUser()` at mutation/export/
  provider boundaries; browser user IDs are not accepted; normal user-owned
  operations use the cookie-bound client so RLS remains final enforcement.
- The server-only admin client is imported only by shared movie metadata
  upsert logic and final deletion of the same freshly verified Auth user. It
  disables persistence, refresh, and URL session detection. No Client
  Component or client-safe barrel imports it.
- Auth callback/confirmation inputs are allowlisted, redirect targets remain
  internal-only, auth/configuration errors are controlled, Supabase diagnostic
  logs contain only sanitized code/category, and logout is cookie aware.
- CSV input is authenticated before parsing, limited to 2 MB/500 rows/100
  columns/10,000 characters per cell, validates temporary JSON at 4 MiB before
  returning it to the browser, and uses a 6 MiB Server Action transport ceiling.
  Decision batches are capped, matching concurrency is four, and uploaded
  content is neither stored nor logged. CSV exports neutralize formula prefixes
  including leading whitespace or line breaks. CSV/JSON responses are private,
  `no-store`, `nosniff` attachments.
- Static migration inspection found no unrestricted `true` policy in the
  versioned user-owned tables. `user_preferences` includes authenticated
  SELECT/INSERT/UPDATE grants and owner policies; list tables have owner RLS;
  the limiter table has RLS, no policies, and no direct browser-role grants.
  The base schema for `profiles`, `movies`, and `user_movies` is not
  version-controlled, so its live policies, privileges, and cascades cannot be
  certified from the repository.
- `supabase/verification/production_security_audit.sql` reports table RLS,
  policies, expected policy operations, effective/raw authenticated and anon
  privileges, limiter isolation, and missing protections without mutation.
- `supabase/verification/development_readiness.sql` reports required tables,
  columns, RLS/policies, privileges, functions/grants, constraints/cascades,
  triggers, indexes, backfills, queue normalization, scheduling, favourites,
  lists, and Part 15 objects as `INSTALLED` or `MISSING`. Database objects, not
  migration-history rows, are the source of truth.

### TMDB limits, caching, duplicate prevention, and performance

- Migration
  `supabase/migrations/202607300001_part_15_tmdb_rate_limits.sql` is the single
  Part 15 patch and is intentionally unapplied. It adds nullable
  `movies.tmdb_adult`/`metadata_language`, repairs the impossible `scheduled`
  preference default, makes shared `movies` authenticated-read/server-write-
  only at table and column privilege levels, replaces management/schedule RPCs
  so mutation and queue normalization are transactional, creates the private
  `watchflow_tmdb_rate_limits` counter table, and grants authenticated callers
  only the hardened `watchflow_take_tmdb_rate_limit(text, integer)` RPC.
- The durable PostgreSQL fixed windows are per authenticated user and
  operation: search 30/60 seconds; details 20/60 seconds; import search and
  import details each 120/600 seconds. Advisory plus row locks serialize a
  bucket across server instances. No unauthenticated route calls TMDB, so no
  public fallback bucket exists; one is required before adding such a route.
- `public.movies` is the only persistent shared metadata cache. Its one row per
  `tmdb_id` uses canonical English, while preferred language remains
  request-scoped to search. A row is fresh for 30 days only when timestamp,
  canonical language, and adult classification are safe for the request.
  Stale/missing rows refresh through authenticated, rate-limited, server-only
  logic and upsert on unique `tmdb_id`. Private `user_movies`, profiles,
  preferences, lists, picker state, and exports are never globally cached.
- Per-process in-flight maps deduplicate identical search, detail, import, and
  provider URL requests. Database uniqueness remains authoritative for
  `movies.tmdb_id`, `(user_id,movie_id)`, normalized list names, memberships,
  queue positions, and list positions. Pending controls cover repeat form
  submission.
- Watch Next now queries only the ordered owner queue, selects explicit fields,
  detects truncation at 500, and normalizes inside transactional RPCs rather
  than an N+1 update loop or a post-commit second call. Import matching is
  concurrency-limited, Unicode-safe, and reuses title/detail promises within a
  batch. Client logout no longer ships the browser Supabase SDK in the
  authenticated shell.
- The final build contains 47 static JS chunks totaling 1,746,342 raw bytes.
  The largest route entry is `/library` at 486,629 raw bytes; auth signup/login
  are about 333 KB, import 218,819 bytes, list detail 214,464 bytes, and picker
  214,351 bytes. These are uncompressed build-artifact measurements, not
  network timings. Library remains the first bundle-splitting candidate.
- Existing indexes match the inspected owner/status/time/order query patterns.
  No speculative workload index was added; only the limiter primary key on
  `(user_id, operation)` creates a new index. Live `EXPLAIN ANALYZE` evidence
  is still needed before adding text/facet indexes.

### Reliability and UI hardening

- TMDB requests have an eight-second abort timeout, provider 429 handling,
  friendly retry text, stable input normalization/limits, and server-only
  credentials.
- Movie posters and list collages use `next/image`, reserve aspect ratio,
  validate fixed TMDB paths, use `w342`/`w500` sources and `sizes`, lazy-load by
  default, prioritize only explicit detail art, and fall back after missing or
  failed images. The only remote image pattern is HTTPS
  `image.tmdb.org/t/p/**`.
- A shared authenticated loading skeleton covers all implemented protected
  routes; import/lists/picker/recommendations retain focused loaders and
  long-running controls expose pending status. Route error boundaries now
  cover the authenticated shell, library, search, import, lists, picker,
  recommendations, and settings. Root/list/movie not-found states are
  controlled and contain no raw errors.
- Dashboard, library, Watch Next, schedule, import, lists, picker, and
  recommendations expose contextual empty/limited states and a relevant next
  action. The absent statistics feature has no false zero-metric placeholder.
- Native Next 16 linting exposed render-inside-catch and synchronous
  effect-state patterns. They were refactored through data result objects,
  keyed state scopes, derived selections, input refs, and
  `useSyncExternalStore`; no lint rule was disabled.
- Security headers now include a scoped CSP, `nosniff`, frame denial,
  referrer policy, and a restrictive permissions policy.

### Known blockers and readiness

- The new Part 15 migration and all prior locally created migrations have not
  been proven installed on the intended Preview Supabase project. Apply them
  in order, run `notify pgrst, 'reload schema';` as a separate statement, then
  run both read-only verification scripts and resolve every `MISSING`.
- No disposable QA credentials were available. Valid/duplicate/unconfirmed
  signup, real login/logout/session persistence, authenticated search/library/
  detail/queue/schedule/import/settings/export/list/picker/recommendation
  flows, complete two-user isolation, and destructive account cascades were
  not executed. The guarded tests exist but are not claimed as passing.
- Password-reset request validation and invalid/expired local routes pass; the
  delivered email-link step is blocked without a test inbox.
- Account deletion is blocked until the dedicated one-shot account and target
  cascade verification are available. QA A/B or a developer account must
  never substitute.
- `/statistics` is proxy-protected but has no route or implementation. This is
  a scope discrepancy, not a passing protected feature.
- Search provider pagination, list-summary pagination, schedule/dashboard
  large-library bounds, cross-instance metadata refresh deduplication,
  concurrent queue-append retry, slow-network image checks, authenticated
  five-viewport/dialog accessibility, monitoring, backups, email delivery,
  legal pages, TMDB attribution/licensing, production Supabase/Vercel
  separation, domain redirects, and analytics remain Preview/production work.
- `docs/PRODUCTION_READINESS.md` is the status checklist. Recommendation:
  proceed only to a controlled Part 16 Preview setup, not public production.

Current milestone: Part 15 Testing and Production Hardening. Local hardening
and test architecture are implemented; the required authenticated matrix and
live Preview gates remain incomplete.

Next milestone: Part 16 Preview Deployment.

## 26. Agent Handoff Protocol

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

### 2026-07-30 - Codex Part 15 testing and production hardening

- Added guarded public/authenticated/two-user/disposable-account Playwright
  architecture, a read-only live-Supabase integration suite, automatic
  redacted console/network diagnostics, two read-only SQL verification
  reports, post-build secret scanning, and testing/security/readiness
  documentation.
- Hardened auth callbacks/errors/logout, Supabase logging, private exports, CSV
  validation/formula protection, Server Action inputs, shared metadata
  ingestion, queue normalization/reads, scheduling fields/defaults, route
  errors/loading/empty states, poster fallbacks, accessibility semantics,
  security headers, and Next 16 lint compatibility.
- Added unapplied migration
  `202607300001_part_15_tmdb_rate_limits.sql`: durable per-user TMDB fixed
  windows, private limiter storage/RPC, canonical shared-cache markers,
  authenticated-read/server-write-only `movies` privileges, transactional
  movie-management/schedule RPC replacements, and preference-default repair.
  No speculative query index was added; the only new index is the limiter
  primary key.
- Final local verification: lint and direct TypeScript passed; 55 files/534
  unit tests passed; guarded integration loaded with 5 tests skipped;
  Playwright passed 35 and skipped 6 credential-gated cases; public clean
  Playwright MCP passed; both npm audits reported zero vulnerabilities; 462
  built artifacts passed the secret scan; and the Next `16.2.12` production
  build passed with 34 static page generations.
- Live limitations: no migration was applied, no real QA account/data was
  mutated, password email delivery and account deletion were not tested, live
  RLS/privileges/cascades remain unverified, protected screenshots/responsive
  QA remain blocked, and `/statistics` remains absent.
- Milestone: Part 15 hardening/test architecture is locally implemented; the
  required authenticated matrix and live Preview gates remain incomplete. Part
  16 Preview Deployment is next.

### 2026-07-29 - Codex Part 14 picker and rule-based recommendations

- Added protected `/picker` and `/recommendations`, authenticated navigation,
  URL-backed picker filters, eight documented moods, server random selection,
  in-memory repeat avoidance, transparent seed/scoring/diversity rules,
  concrete recommendation reasons, cold starts, refresh ordering, and safe
  favourite/Watch Next/custom-list integrations.
- Security/data: one fresh-`getUser`, owner-filtered, RLS-protected,
  exact-column dataset query handles at most 1,000 relationships. No browser
  user ID, full-library Client Component payload, admin client, TMDB/AI call,
  global cache, public metadata, or stored result was added.
- Database: no Part 14 migration, table, index, RPC, policy, privilege, trigger,
  dependency, or environment variable.
- Tests: seven focused Part 14 files/113 tests and the full 48-file/469-test
  Vitest suite passed. Logged-out/public Playwright passed 26 tests, including
  both new redirects and the sign-up regression at five public viewports.
  Lint, direct TypeScript, and production build passed.
- Browser limitation: MCP confirmed logged-out protection and the public
  390x844 sign-up layout only. Authenticated discovery flows, two-user
  isolation, mutation shortcuts, discovery-responsive screenshots, and live
  database behavior remain unverified because no confirmed QA sessions exist.
- Milestone: Part 14 is implemented locally; Part 15 Testing and Production
  Hardening is next.

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
