# WatchFlow Project Context

Last updated: 2026-07-28  
Last updated by: Codex  
Purpose: Canonical project handoff and single source of truth for coding agents  
Current phase: Part 10B implemented; Part 11 statistics implementation is not present; Part 12 is next  
Current branch: `master` at `8f92cbe` when audited  
Local status: The worktree was clean before this context-only task; dependency and development artifacts are present locally

This document records repository evidence, not assumptions about an uninspected Supabase project. Verify relevant statements against current code and update only affected sections after each milestone.

## 2. Product Overview

WatchFlow is a private, multi-user movie-management SaaS for discovering movies, maintaining a personal library, choosing what to watch next, and planning viewing times.

The implemented flow is:

1. Register or sign in with email and password.
2. Search TMDB from the server and retrieve normalized movie metadata.
3. Add a shared movie record to a private, RLS-protected personal library.
4. Track status, rating, review, priority, watched date, and rewatch intent.
5. Order a Watch Next queue or schedule a local date/time and IANA timezone.
6. Import a downloaded CSV, export private data, and manage account settings.

The product currently supports authentication, profiles, title search, private libraries, movie management, queueing, scheduling, CSV import, CSV/JSON export, settings, and basic dashboard summaries. It does **not** contain a statistics page, charts, favourites, custom lists, recommendations, notification delivery, calendar sync, or payments.

The direction remains a production-oriented SaaS, but paid launch is deferred. The repository contains no billing implementation or proof of a production deployment.

## 3. Technology Stack

| Area | Actual repository choice |
|---|---|
| Framework | Next.js App Router; `next` declared as `latest`, installed/resolved as `16.2.10` |
| UI runtime | React and React DOM `19.2.7` installed (`^19.0.0` declared) |
| Language | TypeScript `5.9.3`, strict mode, path alias `@/*` |
| Styling | Tailwind CSS `3.4.19`, PostCSS, Autoprefixer, `tailwindcss-animate` |
| Components | Radix primitives, shadcn-style local components, Lucide icons, `next-themes` |
| Auth/data | Supabase Auth, PostgreSQL, and RLS through `@supabase/ssr 0.12.3` and `@supabase/supabase-js 2.110.7` |
| Movie data | Server-only TMDB API v3 adapter with provider-neutral internal types |
| Validation | Zod `4.4.3` for settings; typed custom validators for library/import/TMDB inputs |
| CSV parsing | Custom parser in `lib/import/csv.ts`; no third-party CSV package |
| Charts | None; no charting dependency exists |
| Tests | Vitest `4.1.10`, Node environment, React server rendering for limited markup tests |
| Browser E2E | None; Playwright/Cypress are not installed or configured |
| Deployment | Vercel is the intended target inferred from runtime variables/starter UI; no `vercel.json` or deployment record exists |
| Package manager | npm with `package-lock.json` lockfile version 3 |

Notable version risk: Next.js is installed at `16.2.10`, while `eslint-config-next` is pinned to `15.3.1`.

## 4. Repository Structure

| Path | Purpose |
|---|---|
| `app/` | The only App Router root; public/auth routes and protected `(app)` route group |
| `app/(app)/actions/` | Library, management, and CSV-import Server Actions |
| `components/` | Auth, shell, movie, import, settings, and reusable UI components |
| `lib/auth/` | Safe redirect validation and auth route contracts |
| `lib/movies/` | Provider contract, TMDB adapter/mapper, movie types, validation |
| `lib/library/` | Personal-library service, Supabase adapters, queue, schedule, timezone, filters |
| `lib/import/` | CSV parsing, mapping, validation, matching, confirmation, persistence |
| `lib/settings/` | Settings adapters/types, formatting, exports, and data controls |
| `lib/supabase/` | Browser, server, proxy, auth-context, admin, and safe-error modules |
| `docs/` | Architecture, database, product, implementation plan, and this canonical context |
| `supabase/migrations/` | Four incremental SQL migrations; the original base schema is absent |
| `lib/**/*.test.ts` | All 26 Vitest files; there is no separate `tests/` directory |
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
| `/library` | Page | Protected library; current URL keys `filter`, `view`, `page`, `perPage` |
| `/library/[movieId]` | Dynamic page | Protected stored movie detail and personal management |
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

`.env.example` lists only the two public Supabase names and is incomplete. `NEXT_PUBLIC_APP_URL`, `TMDB_API_BASE_URL`, and `TMDB_IMAGE_BASE_URL` are not environment variables here; TMDB API/image bases are module constants.

## 8. Database Schema

Important limitation: there is no original base migration, schema dump, generated database types, Supabase CLI config, or remote migration history. `docs/DATABASE.md` combines a prior read-only live inspection with incremental SQL; recheck unversioned base FKs, policies, grants, and indexes against the target project.

| Table | Ownership and purpose | Important current contract | RLS |
|---|---|---|---|
| `profiles` | User-owned, one application profile per Auth identity | `id`, `full_name`, `avatar_url`, `country`, `timezone`, `subscription_plan`, `created_at`, `updated_at`; exact base FK/cascade not versioned | Documented enabled; own-row access expected |
| `movies` | Shared TMDB-derived metadata | Shared ID, unique `tmdb_id`, titles, overview, poster/backdrop, release date/year, runtime, JSONB genres/cast/countries, director, language, public rating, trailer, metadata timestamp | Documented enabled; shared read policy not versioned |
| `user_movies` | User-owned relationship between a user and shared movie | UUID `id`, `user_id`, bigint `movie_id`, status, rating, review, priority, queue, schedule, watched/rewatch, audit timestamps | Enabled; ownership is `auth.uid() = user_id` |
| `user_preferences` | User-owned one-row-per-Auth-user defaults/preferences | UUID `user_id` PK/FK to `auth.users` with delete cascade, application/display/search/notification fields, audit timestamps | Enabled with explicit own-row policies |

`movies.tmdb_id` and `user_movies (user_id, movie_id)` are confirmed unique guards. Exact base FK DDL for `profiles`/`user_movies` is absent; confirm account-deletion cascades before production use.

`user_movies` statuses are `want_to_watch`, `watch_next`, `scheduled`, `currently_watching`, `watched`, `on_hold`, and `dropped`. Important fields are `personal_rating`, `review`, `priority`, `queue_position`, `scheduled_for`/`watched_at` (`timestamptz`), `schedule_timezone`, `schedule_note`, and `would_watch_again`. SQL adds positive-queue and note-length checks plus partial queue/schedule indexes.

`user_preferences` defaults: status `want_to_watch`, priority `0`, view `grid`, date `DD/MM/YYYY`, time `12h`, adult `false`, unreleased `true`, language `en`, page size `24`, notification toggles `false`, offset `60`. Checks restrict these enums/ranges, language-code shape, page sizes 12/24/48/96, and offsets 15/30/60/180/1440.

Personal data placement is mandatory:

- TMDB/canonical metadata belongs on shared `movies`.
- Status, `personal_rating`, review, priority, queue, schedule, watched data, rewatch intent, and future favourite belong on `user_movies`.
- Profile identity-adjacent presentation fields belong on `profiles`.
- Application/display/search/notification choices belong on `user_preferences`.
- No favourite column currently exists.

## 9. RLS and Database Privileges

| Object | Current version-controlled or documented rule |
|---|---|
| `profiles` | Own-row RLS is documented; migration restricts authenticated UPDATE to `full_name`, `avatar_url`, `country`, `timezone` |
| `movies` | Shared reads follow deployed policy; only the protected secret client performs metadata upserts |
| `user_movies` | Migration adds own SELECT and UPDATE (`USING` plus `WITH CHECK`); existing INSERT/DELETE policies and base grants are not versioned |
| `user_preferences` | Own SELECT, INSERT, UPDATE policies; no normal DELETE policy |
| Queue/library RPCs | Security invoker, derive `auth.uid()`, execute revoked from public/anon and granted to authenticated |

Historical issue: `user_preferences` had correct RLS but only SELECT privilege for `authenticated`. The fix grants `SELECT`, `INSERT`, and `UPDATE`, never `DELETE`. RLS policies and SQL privileges are both required.

Nuance: `202607220003_user_settings.sql` used column-level preference grants, but `202607230001_user_preferences_privileges.sql` grants table-level INSERT/UPDATE. RLS still owner-scopes rows and the trigger controls `updated_at`, but older audit-column restriction claims are stale. Profile column restrictions remain intact.

## 10. Supabase Migrations

| Filename | Purpose | Development-project status |
|---|---|---|
| `202607210001_phase_3_movie_management.sql` | Adds `schedule_note`, queue index, normalization/update/move/schedule/remove security-invoker functions and authenticated execute grants | Unknown; file is non-idempotent and must not be rerun blindly |
| `202607220002_schedule_queue_fixes.sql` | Adds `schedule_timezone`, checks, unique queue/schedule indexes, own SELECT/UPDATE policies, and atomic `move_watch_queue_item` RPC | Unknown; repository has no remote history |
| `202607220003_user_settings.sql` | Ensures profile settings columns; creates preferences, checks, RLS, triggers/backfill, grants, and preference-aware add RPC | Unknown; deployment checklist still calls for manual application |
| `202607230001_user_preferences_privileges.sql` | Grants authenticated SELECT/INSERT/UPDATE and backfills preference rows; no DELETE | Unknown; latest relevant migration |

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
| Remove from library | Complete | `/library/[movieId]` | Authenticated RPC and confirmation |
| Movie status | Complete | Movie detail form | Seven statuses |
| Personal rating | Complete | Movie detail form | Decimal 0–10 |
| Review | Complete | Movie detail form | Private, max 5,000 characters |
| Watched date | Complete | Movie detail/import | Stored as UTC-midnight timestamp |
| Favourite field | Not started | None | No column, migration, type, UI, or test |
| Watch Next queue | Complete | `/watch-next` | One-based private queue |
| Queue reordering | Complete | `move_watch_queue_item` | Migration-dependent up/down controls |
| Scheduling | Partial | `/schedule`, movie detail | Dedicated flow works; detail edit has timezone/note persistence issues |
| Watched/unwatched UI | Complete | `/library?filter=` | Unwatched means every non-watched status |
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
| Advanced library search | Not started | None | No personal-library query |
| Advanced filters | Partial | `/library` | Only All/Watched/Unwatched |
| Sorting controls | Not started | None | Fixed newest-added ordering |
| Pagination | Partial | `/library` | URL page size exists, but all rows load before slicing |
| Multi-select | Not started | None | Part 12 roadmap |
| Bulk actions | Not started | None | No bulk status/delete |
| Custom lists | Not started | None | Part 13 roadmap |
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
- Fields: Title, Original Title, Release Year, Director, Cast, Genres, Public Rating, Personal Rating, Status, Priority, Review, Watched Date, Scheduled Date, Schedule Timezone, Would Watch Again, Date Added, TMDB ID.
- Requires fresh authenticated identity and an explicit owner filter.
- Generated in memory with private no-store/nosniff attachment headers.
- Standard quoting applies; cells beginning (even after whitespace) with `=`, `+`, `-`, `@`, or `*` receive an apostrophe.
- Filename: `watchflow-library-YYYY-MM-DD.csv`.

### JSON export

- Route: `/settings/data/export/json`.
- Includes export time, email/profile, preferences, movie metadata, personal fields, queue positions, and derived schedules.
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

## 18. Testing and Quality Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js development server |
| `npm run lint` | ESLint over the repository |
| `npm run typecheck` | Scripted `tsc --noEmit` |
| `npx tsc --noEmit` | Required direct TypeScript check |
| `npm test` | All Vitest tests via `vitest run` |
| `npx vitest run <path>` | Focused Vitest file(s) |
| `npm run build` | Production Next.js build |
| `npm start` | Serve a completed production build |

`vitest.config.ts` includes `lib/**/*.test.ts` in Node. Its 26 files/155 cases are unit, mocked-adapter, server-markup, route/source/migration contracts; none use live Supabase or a browser. No Playwright/E2E suite exists.

### Last verified

| Check | Status | Latest evidence |
|---|---|---|
| Lint | Passed | `npm run lint`, 2026-07-28 |
| TypeScript | Passed | `npx tsc --noEmit`, 2026-07-28 |
| Unit/contract tests | Passed | `npm test`: 26 files, 155 tests, 2026-07-28 |
| Integration/E2E tests | Not recently verified | No suite is configured |
| Production build | Passed | `npm run build`, 2026-07-28; Google Fonts network access was required |

Mark Passed only after that exact command succeeds.

## 19. Known Issues and Historical Regressions

| State | Issue or lesson |
|---|---|
| Resolved/guarded | `/auth/sign-up` was accidentally removed and returned 404; it now exists with a route-contract test |
| Operational unknown | Committed migrations do not prove remote application; all four incremental migration states must be checked |
| Resolved locally | `user_preferences` had RLS but insufficient INSERT/UPDATE privileges; the latest patch grants SELECT/INSERT/UPDATE, no DELETE |
| Operational unknown | Preference backfill exists in SQL; existing profile/preference rows and onboarding triggers still require target-project verification |
| Preserved boundary | Shared movie writes require the authenticated-first, server-only admin path; never weaken this to solve RLS errors |
| Resolved/guarded | Empty FormData values previously caused numeric/date update errors; current validators map optional rating/date/text values safely |
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
| Active | Library pagination loads the full private library before filtering/slicing |
| Launch blocker | No TMDB attribution UI or resolved commercial movie-data licensing |
| Troubleshooting note | Browser login “Failed to fetch” is not reproduced here; check public env names, Supabase URL/Auth redirect config, network/CORS, and browser extensions |

Migrations 1 and parts of 2 are not safely repeatable; never rerun old SQL blindly.

## 20. Current Project State

- Latest implemented milestone: **Part 10B — settings, preferences, exports, and account data controls**.
- Part 11 statistics/dashboard upgrade: **not evidenced in the repository**.
- Requested next milestone: **Part 12 — search and library improvements**.
- Branch/HEAD at audit: `master`, `8f92cbe` (`feat: complete settings and account controls`).
- Tags `settings-v1` and misleading `statistics-v1` both point to that commit.
- Latest migration: `202607230001_user_preferences_privileges.sql`.
- Latest feature set: protected settings, preferences, exports/data controls, plus earlier import/library flows.
- Baseline Git state was clean; this task adds the context and updates `AGENTS.md`.
- Manual Supabase action: verify/apply migrations in order and exercise RLS/cascades with two users.
- No failing route is known. `/auth/sign-up` exists, but no live browser/E2E run was performed.
- Missing `/statistics` is unimplemented functionality, not a runtime failure.

## 21. Next Development Queue

This is the roadmap, not completed functionality.

1. **Part 12 — Search and library improvements**
   - Search within the personal library.
   - Genre, status, release-year, personal-rating, and director filters.
   - URL-based sorting and pagination.
   - Multi-select, bulk status changes, and bulk deletion.
   - Favourite movies.
2. **Part 13 — Custom lists**
3. **Part 14 — Movie picker and recommendations**
4. **Part 15 — Testing and production hardening**
5. **Part 16 — Preview deployment**
6. **Part 17 — Public beta preparation**
7. **Part 18 — Notifications and calendar integration**
8. **Part 19 — Paid SaaS**

Basic URL pagination and watched/unwatched filtering exist; Part 12 should extend them.

## 22. Part 12 Implementation Notes

Do not implement Part 12 as part of context maintenance.

- Favourite is personal and must be stored on `public.user_movies`, never
  `public.movies`.
- Add any favourite column through a reviewed migration with RLS preserved;
  application code is not target-complete until that migration is applied.
- Treat URL search/filter/sort/page parameters as untrusted and validate them
  server-side.
- Keep filter and sort state in canonical URLs for shareable/reload-safe views.
- Move filtering, sorting, and pagination toward owner-scoped database queries;
  the current full-library fetch/slice approach is unsuitable for several
  hundred movies.
- Use the authenticated SSR client and verified user identity for reads,
  favourite toggles, multi-select, bulk status updates, and bulk deletion.
- Every bulk mutation must owner-filter each affected `user_movies` row and
  preserve queue/schedule invariants.
- Add accessible selection controls, clear empty/error states, deterministic
  sorting, pagination bounds, and focused tests for validation and cross-user
  isolation.

## 23. Agent Handoff Protocol

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

### 2026-07-28 — Codex context-system audit

- Added: Canonical repository-wide project context and mandatory handoff protocol.
- Changed: Centralized route, schema, feature, security, roadmap, and verification state.
- Migration: No schema change; inventoried four migrations, with remote application unknown.
- Tests: Lint, TypeScript, 155 Vitest cases, and production build passed.
- Known issue: Part 11/statistics is absent despite the `statistics-v1` tag.
- Next: Part 12 search and library improvements; do not implement it during this task.
