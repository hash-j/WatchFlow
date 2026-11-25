# WatchFlow

WatchFlow is a private, multi-user movie-management web application. Each member
builds a personal movie library from TMDB search, records their own status,
rating, review and watched date, orders a Watch Next queue, schedules viewings
in their own timezone, groups movies into private custom lists, and receives
scheduled reminders in-app and through browser push.

Everything a member stores is private to their account. There are no public
profiles, shared lists, social feeds or cross-user analytics.

## Scope

**v1 is movies only.** Series/TV support and payments are out of scope and
deferred to post-v1. See [Post-v1 roadmap](#post-v1-roadmap).

## Features

**Library and movies**
- Server-side TMDB search with duplicate prevention
- Statuses: Saved, Watch Next, Scheduled, Watched (plus legacy Currently
  Watching, On Hold and Dropped values retained for imported data)
- Personal rating, private review, watched date, "would watch again" and
  favourites
- Filtering by status, genre, director, actor, year and watched state; sorting
  by title, date added, release year, rating, priority and recent activity;
  grid and list views with pagination
- Bulk selection for status changes, list membership and removal

**Watch Next** — an ordered queue with priorities 0–5 and manual reordering
within a priority.

**Schedule** — plan a movie for a local date and time in any IANA timezone.
Instants are stored as `timestamptz` with the chosen timezone preserved, and
grouped into Today, Upcoming and Past.

**Custom lists** — private collections with an optional cover image,
description, membership management, five sort modes and saved manual ordering.

**Discovery** — a filtered random Movie Picker and transparent rule-based
recommendations drawn only from the member's own library. No AI or predictive
modelling is involved; each suggestion states the rule that produced it.

**Statistics** — private counts, status and genre distribution, watched history
over time, rating distribution and top-rated movies.

**Notifications** — a private notification centre with per-category
preferences, browser push subscriptions and scheduled movie reminders with a
configurable lead time (15 minutes, 30 minutes, 1 hour, 3 hours or 1 day).

**Data controls** — CSV import, CSV and JSON export, library deletion and
account deletion.

## Tech stack

| Area | Choice |
|---|---|
| Framework | Next.js 16 (App Router, React 19, Server Components) |
| Language | TypeScript |
| Styling | Tailwind CSS 3, Radix primitives, `lucide-react` icons |
| Database and auth | Supabase (PostgreSQL, Auth, Storage, Row Level Security) |
| Supabase clients | `@supabase/ssr`, `@supabase/supabase-js` |
| Movie data | TMDB, accessed server-side only |
| Push delivery | `web-push` (VAPID) |
| Background triggers | Upstash QStash |
| Image processing | `sharp` |
| Validation | `zod` |
| Tests | Vitest (unit and contract), Playwright (browser) |

Fonts are self-hosted (Geist WOFF2 in `app/fonts`); there is no Google Fonts
request at build or runtime.

## Architecture

- **Server Components by default.** `"use client"` is added only where browser
  state or event handlers are required.
- **Mutations are Server Actions** that re-validate the session and input.
- **Row Level Security is the authorization boundary.** User-owned reads and
  writes use the signed-in member's SSR client so RLS applies. Application code
  never bypasses it.
- **Identity comes from the server.** `supabase.auth.getClaims()` (or
  `getUser()` where fresh Auth-server data is needed) establishes the user; a
  browser-supplied user ID is never trusted. `proxy.ts` refreshes auth cookies.
- **The secret-key admin client is narrow**, restricted to shared `movies`
  metadata and fixed-payload trusted system producers, plus final deletion of a
  freshly verified Auth user.
- **TMDB and admin modules are marked `import "server-only"`** so secrets cannot
  reach browser bundles.

Deeper detail lives in `docs/ARCHITECTURE.md`, `docs/DATABASE.md` and
`docs/SECURITY.md`.

### Route groups

| Path | Contents |
|---|---|
| `app/(public)` | Privacy, terms, data deletion, support, about |
| `app/auth` | Login, sign-up, verification, password reset and callbacks |
| `app/(app)` | Dashboard, library, watch-next, schedule, lists, search, picker, recommendations, statistics, notifications, import, settings |
| `app/api/internal` | Scheduler-authenticated reminder and calendar-sync executors |
| `app/api/artwork` | Owner-scoped private artwork delivery |
| `app/api/calendar/google` | Google OAuth start and callback |

## Local development

Requirements: a Node.js version supported by Next.js 16, npm with the committed
lockfile, a non-production Supabase project, a TMDB read-access token, and
Chrome for Playwright.

```bash
npm ci
```

```bash
npm run dev
```

The default origin is `http://localhost:3000`. The Supabase Auth Site URL and
allowed redirect URLs must include the local callback and recovery routes
described in `docs/ARCHITECTURE.md`.

## Environment variables

Copy `.env.example` to an ignored `.env.local`. **Names only are listed here;
never commit values.**

**Required**

| Name | Exposure |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-safe |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe |
| `SUPABASE_SECRET_KEY` | Server-only secret |
| `TMDB_READ_ACCESS_TOKEN` | Server-only secret |

**Scheduled reminders and push**

| Name | Exposure |
|---|---|
| `WATCHFLOW_SCHEDULER_SECRET` | Server-only secret (bearer for internal executors) |
| `WATCHFLOW_EXPECTED_SUPABASE_PROJECT_REF` | Server-only configuration (executor target guard) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Browser-safe |
| `VAPID_PRIVATE_KEY` | Server-only secret |
| `VAPID_SUBJECT` | Server-only configuration (`mailto:` address or HTTPS URL) |

**Google Calendar**

| Name | Exposure |
|---|---|
| `GOOGLE_CALENDAR_CLIENT_ID` | Server-only configuration |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Server-only secret |
| `GOOGLE_CALENDAR_REDIRECT_URI` | Server-only configuration (ends in `/api/calendar/google/callback`) |
| `CALENDAR_TOKEN_ENCRYPTION_KEY` | Server-only secret (base64 32-byte AES key) |
| `CALENDAR_TOKEN_ENCRYPTION_KEY_VERSION` | Server-only configuration |

**Optional**

| Name | Purpose |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Application origin used in calendar event links |

Test-only names (`RUN_*_INTEGRATION_TESTS`, `PLAYWRIGHT_BASE_URL` and the E2E
guards) are documented in `.env.example` and `docs/TESTING.md`.

## Database and Supabase setup

Schema lives in `supabase/migrations` as an ordered, incremental sequence.
Migrations create tables, RLS policies, database functions and RPCs, and the
private artwork Storage bucket.

Core tables:

| Table | Holds |
|---|---|
| `profiles` | Application profile data for an Auth user |
| `movies` | Shared movie catalogue records |
| `user_movies` | Per-user movie state, queue position, personal metadata and scheduling |
| `user_preferences` | Private application, display, search and notification choices |
| `lists`, `list_movies` | Private custom lists and membership |
| `notifications`, `push_subscriptions` | Notification centre and browser subscriptions |
| `scheduled_notification_jobs`, `scheduled_notification_deliveries` | Reminder jobs and per-subscription delivery ledger |
| `calendar_connections` | Encrypted Google Calendar credentials and sync state |

Rules that apply to every environment:

- RLS is enabled on all application tables and must stay enabled.
- Apply migrations in filename order against a known target. Never apply them
  blindly to an unknown or production database.
- Verify afterwards with the read-only scripts in `supabase/verification`
  (`development_readiness.sql`, `production_security_audit.sql`) and investigate
  every `MISSING` or `REVIEW_*` result.
- Use disposable accounts for destructive QA.

See `docs/DATABASE.md` for the full contract.

## Authentication

Supabase Auth with cookie-based SSR sessions. Sign-up, email verification,
login, password reset, password change and account deletion are implemented.
`proxy.ts` refreshes auth cookies and preserves every cookie Supabase writes.
Protected routes redirect unauthenticated visitors to `/auth/login`, and
callback redirect parameters are restricted to internal application paths.

## Notifications and Web Push

In-app notifications are created for watch status changes, Watch Next
additions, custom list additions, CSV import completion and scheduled movie
reminders, each gated by the member's category preferences.

Browser push uses VAPID. A subscription is stored per browser and is owned by
the member who created it. Delivery is idempotent: one deterministic
notification per reminder, one ledger row per subscription and schedule
version, bounded retries, and automatic cleanup of subscriptions the push
service reports as gone. Push-service acceptance is recorded as acceptance, not
as proof the OS displayed the notification.

Email and weekly summaries are not delivered; those preferences are stored for
future use and labelled as such in the UI.

## Background jobs (QStash)

Two internal endpoints perform the scheduled work:

- `/api/internal/notifications/scheduled-reminders`
- `/api/internal/calendar/sync`

Both require a bearer matching `WATCHFLOW_SCHEDULER_SECRET` and verify that the
configured Supabase project matches `WATCHFLOW_EXPECTED_SUPABASE_PROJECT_REF`
before doing any work. They return aggregate counters only.

Upstash QStash is the intended automatic trigger: it calls each endpoint on a
cron schedule. Work is claimed in bounded batches with row locks and leases, so
overlapping ticks cannot double-process a job. A repository GitHub Actions
workflow can invoke the same endpoints, but it is gated behind repository
variables and stays disabled; running two triggers at once is not supported.

`vercel.json` also declares Vercel Cron entries for the same paths. Only one
trigger should ever be active per environment.

## Google Calendar

Optional, per-member, and outbound only. A connected member's scheduled movies
are written to their primary Google Calendar. WatchFlow does not read calendar
events back and does not support other providers.

Refresh tokens are encrypted at rest with `CALENDAR_TOKEN_ENCRYPTION_KEY` and a
stored key version. Reauthorization is restricted to the same Google subject,
and disconnecting runs a reconciliation that cleans up previously written
events. Sync can be paused without disconnecting.

## CSV import

A guided wizard: upload, map columns, preview and validate, match against TMDB,
review matches, confirm, results.

- Limits: 2 MB, 500 movie rows, 100 columns, 10,000 characters per cell
- Column headers are auto-mapped from common aliases; title is required
- Duplicate rows, missing titles and invalid values are flagged before anything
  is written, and each row is processed independently
- An existing library movie receives the supplied metadata as an update instead
  of being added again
- Results report added, updated, skipped, invalid and failed counts with a
  downloadable failure report

Uploads stay in memory and bounded. CSV exports are generated on demand, sent
as no-store attachments, and protected against spreadsheet formula execution.

## Private artwork and storage

Profile pictures and custom list covers are stored in a private Supabase
Storage bucket and served through `/api/artwork`, which authorizes the request
against the signed-in owner and responds `private, no-store`. Uploads accept
JPEG, PNG and WebP up to 2 MiB and 20 megapixels; images are re-encoded to WebP
with `sharp`, which strips metadata. There are no public artwork URLs.

## Testing

```bash
npm test                  # Vitest unit and contract suites
npm run test:integration  # guarded Supabase/TMDB integration suites
npm run test:e2e          # Playwright
npm run test:release      # Playwright release profile
```

The unit suite covers validation, mapping, RPC and migration contracts,
security contracts, revalidation, and UI source contracts. Integration and
authenticated/destructive Playwright suites are deliberately guarded: they
require an explicitly pinned development Supabase target and disposable
credentials, and they skip rather than run against an unknown environment. A
skipped live test is not a passing workflow. See `docs/TESTING.md`.

## Build and quality commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run scan:client-secrets
```

Run the client-secret scan after a successful production build; it checks built
browser chunks and rendered payloads for forbidden secret names and values
without printing them.

## Deployment notes

- Deploy targets are Vercel projects; development and production use separate
  Vercel projects and separate Supabase projects.
- Every required environment variable must exist in the target's own scope
  before deploying. Preview deployments must never receive production database
  credentials.
- Apply the pending migrations to the target database, in order, before the
  application build that depends on them.
- Background schedulers are created per environment and should stay paused
  until that environment's scheduler acceptance check has passed.
- Google OAuth requires the target's exact redirect URI registered in the
  Google console.
- `docs/BACKGROUND_EXECUTORS.md` describes the executor contract and the
  deployment method used for the development project.

## Project status

v1 is movies-only and feature-complete, with application development frozen
pending release. The latest full local gate passed: 150 Vitest files / 1,260
tests, TypeScript, ESLint, the post-build client-secret scan, and a successful
remote production build. The scheduled reminder path has passed end-to-end
acceptance on the development environment, including an owner-confirmed browser
push.

Remaining work is release infrastructure rather than application code:
production environment variables, the production migration run, preview/
production isolation, and the scheduler acceptance checkpoint.
`docs/WATCHFLOW_V1_RELEASE_CHECKLIST.md` tracks the current gate status and
`docs/PROJECT_CONTEXT.md` is the canonical handoff document.

## Post-v1 roadmap

- **Series / TV integration** — deliberately excluded from v1
- **Android / Play distribution** — the PWA is implemented; packaging, signing
  and store submission are a separate phase (`docs/ANDROID_PLAY_RELEASE.md`)
- **UI and UX polish** — nine deferred low-severity findings covering date
  format consistency, CSV status naming, import step messaging, empty-state
  tidying, form control styling, accessible names and post-login deep links
- **Delivery channels** — email and weekly summaries, currently stored as
  preferences only
- **Payments** — out of scope for v1

## Repository orientation

Read before changing the application:

1. `AGENTS.md`
2. `docs/PROJECT_CONTEXT.md`
3. The relevant architecture, database and security documents

| Document | Covers |
|---|---|
| `docs/ARCHITECTURE.md` | Application and data-flow boundaries |
| `docs/DATABASE.md` | Tables, RLS, RPCs, migrations, indexes |
| `docs/SECURITY.md` | Permanent security rules |
| `docs/TESTING.md` | Unit, integration, database and Playwright architecture |
| `docs/BACKGROUND_EXECUTORS.md` | Scheduler endpoints and triggers |
| `docs/PRODUCT_SPEC.md` | Implemented product behaviour |
| `docs/WATCHFLOW_V1_RELEASE_CHECKLIST.md` | v1 release gate status |
