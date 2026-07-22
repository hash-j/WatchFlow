# WatchFlow Product Specification

## Product summary

WatchFlow is a multi-user SaaS for maintaining a personal movie library,
choosing what to watch next, and planning future viewing. Each user's account
and movie activity are private and isolated through Supabase Auth and database
RLS.

## Phase 1 goal

Establish a secure, deployable application foundation with complete email and
password authentication and an authenticated product shell.

## Phase 1 users and journeys

### New member

1. A visitor creates an account with an email address and password.
2. WatchFlow asks the visitor to verify their email.
3. The verification callback exchanges the Supabase auth code or token hash for
   a cookie-backed session.
4. The verified member enters the protected dashboard.

### Returning member

1. A member signs in with email and password.
2. WatchFlow sends them to `/dashboard`.
3. The member can navigate the authenticated application or sign out.

### Password recovery

1. A member requests a recovery email without revealing whether an account
   exists.
2. The recovery link enters the server callback, which establishes the recovery
   session.
3. Only an authenticated recovery session can open the reset form.
4. After selecting and confirming a new password, the member returns to the
   dashboard.

## Phase 1 functional requirements

- Email/password sign-up, sign-in, sign-out, verification, forgotten-password,
  and reset-password flows.
- Server-side protection for `/dashboard`, `/search`, `/library`,
  `/watch-next`, `/schedule`, and `/settings`.
- Redirect unauthenticated application visitors to `/auth/login`.
- Show the signed-in email address and load the member's `profiles` record.
- Provide a responsive authenticated shell with navigation for Dashboard,
  Search Movies, My Library, Watch Next, Schedule, and Settings.
- Provide intentional placeholder screens for features not yet implemented.
- Provide useful loading, form error, callback error, and route error states.

## Non-functional requirements

- Server Components are the default rendering boundary.
- Client Components are limited to interactive auth forms, sign-out, theme
  controls, and required error-boundary behavior.
- The publishable Supabase key may be used by browser code; secret/service-role
  keys must never enter the client bundle.
- User data access must use RLS-scoped Supabase clients.
- Layouts must work from mobile through desktop widths.

## Explicitly out of scope

- TMDB API integration, movie ingestion, and live movie search.
- Payments, subscriptions, plans, invoices, and billing-provider integration.
- Database schema changes.
- Fully implemented library, queue, schedule, or settings workflows.

## Phase 1 acceptance criteria

- All specified routes exist and protected routes reject anonymous access.
- Authentication callbacks create server-visible cookie sessions.
- The dashboard renders the authenticated email and profile availability.
- The repository passes ESLint, TypeScript checking, and a production build.

## Phase 2: discovery and private library

Phase 2 adds server-side TMDB title search and a private library. Search results
show poster availability, localized and original titles, release year, overview,
and public rating. Adding a result fetches complete details, director, main cast,
and a suitable YouTube trailer before shared metadata is upserted.

Every personal library operation derives the member identity from verified
server claims and uses the authenticated Supabase client under RLS. Members can
view a responsive library grid, open stored movie details, and remove an item
only after confirmation.

Still out of scope: queue ordering, scheduling implementation, payments, social
features, and recommendations.

## Phase 3: management, Watch Next, and scheduling

Phase 3 turns each private library relationship into a manageable viewing
record. Members can choose Want to Watch, Watch Next, Scheduled, Currently
Watching, Watched, On Hold, or Dropped; save a 0–10 personal rating, review,
0–5 priority, rewatch preference, and watched date; and edit those values from
the stored movie detail page.

Watch Next is a one-based ordered queue. Members can move items earlier or
later with keyboard-accessible controls. Adding, leaving, moving, scheduling,
or removing an item keeps positions sequential for that authenticated member
without affecting another member's queue.

Scheduling accepts a local date, time, IANA timezone, and optional private
note. WatchFlow stores an absolute timezone-aware timestamp, remembers the
member timezone, and groups scheduled movies into Today, Upcoming, and Past.
The dashboard summarizes the next queued movie, today's schedule, recently
added movies, and recently watched movies.

Still out of scope: external calendar synchronization, email reminders,
payments, social features, and recommendations.

## Part 10A: Google Sheets CSV import

Part 10A lets an authenticated member export an existing Google Sheet as CSV
and import up to 500 non-empty movie rows into their private WatchFlow library.
The protected `/import` workflow has seven explicit steps: upload, map columns,
preview and validate, match with TMDB, review ambiguous or unmatched rows,
confirm, and review results. No database write occurs before confirmation.

### Supported mapped fields

- Movie title (required)
- Release year, director, cast, and genres
- Personal rating, status, watched date, review, and priority

Header suggestions recognize common names such as Movie Name, Name, Year,
Type, Actors, Notes, and Personal Rating. A generic Rating header is never
silently interpreted as a personal rating. Unexpected columns can remain
unmapped, duplicate headers remain individually selectable, and only one CSV
column may supply each WatchFlow field.

### Imported status meanings

- Want to Watch, Unwatched, and Pending become `want_to_watch`.
- Watch Next and Next become `watch_next`.
- Scheduled becomes `scheduled`.
- Watching and Currently Watching become `currently_watching`.
- Watched, Complete, Completed, and Yes become `watched`.
- On Hold and Paused become `on_hold`.
- Dropped and Abandoned become `dropped`.

Unrecognized status values require explicit confirmation before WatchFlow uses
the `want_to_watch` default. Empty statuses use that default automatically.

### Import result meanings

- Imported: a new private `user_movies` relationship was created.
- Already in library: the shared movie was found or refreshed, but the member's
  unique library relationship already existed and was not duplicated.
- Skipped: the member skipped the row or it duplicated an earlier CSV row.
- Invalid: mapped personal values failed validation.
- Unmatched: no TMDB selection was confirmed.
- Failed: a row-level provider or database operation failed safely.

### Known limitations

- WatchFlow accepts a downloaded CSV, not a live Google Sheets URL or Google
  account connection.
- Files are limited to 2 MB and 500 non-empty data rows per import.
- The temporary wizard state is not persisted; refreshing the page restarts the
  import.
- Watched dates support ISO calendar dates and only unambiguous slash dates.
  Ambiguous values must be corrected to `YYYY-MM-DD`.
- Director is shown in preview but is not yet used to make extra TMDB credits
  requests during candidate scoring. Title, original title, and year determine
  confidence.
- Temporary TMDB failures and rate limits remain row-level retry operations.

Direct spreadsheet synchronization, payments, subscriptions, social features,
AI recommendations, and production deployment remain out of scope.

## Part 10B: settings and account data controls

Part 10B replaces the settings placeholder with protected Profile,
Preferences, Notifications, and Data and Privacy sections. Profile settings
support full name, optional country, and a validated IANA timezone. Account
email and creation date are read-only. The profile timezone becomes the default
for new schedules; changing it never rewrites an existing scheduled instant or
its saved timezone.

Application preferences cover the default movie status and priority, grid/list
library view, page size, date and time formats, adult and unreleased TMDB search
behavior, and supported provider language. Explicit library URL parameters
continue to override saved view and page-size defaults. Manual movie additions
use the authenticated member's default status and priority. Search passes adult,
release, and language choices to the server-only TMDB provider.

Notification choices store email, schedule-reminder, reminder-offset, and
weekly-summary preferences for a future delivery system. WatchFlow does not send
email, reminders, or summaries in this milestone and the interface states that
clearly.

Members can download an on-demand UTF-8 CSV of their movie library or a
versioned JSON export of their profile, preferences, personal library, queue,
and schedule data. Exports omit internal relationship UUIDs, Auth records,
tokens, keys, and other members' data. CSV fields are quoted correctly and
formula-like values are neutralized.

The Data and Privacy danger zone separates deleting all private `user_movies`
relationships from deleting the complete account. Library deletion requires
`DELETE MOVIES` and leaves shared `movies` metadata and the Auth account intact.
Account deletion requires `DELETE`, a separate checkbox, a server-verified
login within 30 minutes, and final Auth deletion through the server-only admin
boundary. User-owned rows cascade from `auth.users`; shared movies remain.

### Part 10B known limitations

- Avatar upload is deferred because no reviewed Supabase Storage bucket or
  ownership policies are versioned; profile initials are shown instead.
- Notification preferences are stored but delivery is not implemented.
- Date/time preferences are applied to settings and schedule-oriented displays;
  native HTML date inputs retain their required ISO input representation.
- The recent-login check uses the trusted Auth `last_sign_in_at` value. A
  dedicated in-place reauthentication screen is a production-hardening task.
- Account deletion depends on the deployed foreign-key cascades already
  documented for user-owned tables and must be exercised with two test accounts
  before production rollout.
