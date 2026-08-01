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

### Authentication accessibility and browser QA

- Public authentication pages expose one semantic page heading and labelled
  fields.
- Authentication errors are announced as alerts; password-recovery success is
  announced as status.
- Playwright covers the canonical sign-up route, invalid login, callback
  failures, keyboard order, logged-out redirects, and five responsive sizes.

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
versioned JSON export of their profile, preferences, personal library, private
custom lists/memberships, queue, and schedule data. JSON format version 2 omits
internal relationship/list UUIDs, Auth records, tokens, keys, and other
members' data. CSV fields are quoted correctly and formula-like values are
neutralized.

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

## Part 12: search and library improvements

Part 12 makes private libraries of several hundred to roughly 1,000 movies
manageable without downloading every relationship into the browser. `/library`
supports literal search across title, original title, director, cast names, and
genres; filters for status, watched state, favourite, genre, director, exact or
ranged release year, and ranged personal rating; and twelve stable sort modes.

Search, filters, sort, grid/list view, page, and page size use validated URL
parameters. Saved `default_library_view` and `movies_per_page` apply only when
valid URL overrides are absent. Exact release year takes precedence over the
range. Invalid enum, page, year, rating, and sort values fall back safely;
inverted year/rating ranges are ignored with a visible message. Empty library
and no-match states remain distinct.

Pagination uses an exact filtered count and a server-side range. Page sizes
remain 12, 24, 48, or 96; out-of-range pages canonicalize to the final valid
page. Null ratings, release years, and watched dates appear after known values.
Every sort has a deterministic personal-relationship ID tie-breaker.

Favourite is a private boolean on `user_movies`, defaults to false, appears on
cards and stored-movie detail, can be filtered/sorted, and is included in CSV
and JSON exports. It is never stored on shared `movies` or inferred from a
rating.

Selection covers only the current visible page and uses accessible checkboxes
named for each movie. It clears when search/filter/sort/view/page scope changes.
Members may confirm a bulk status change or removal for at most 100 unique
relationship IDs. Bulk `scheduled` is excluded because each schedule needs an
explicit date, time, and timezone.

Entering Watch Next appends newly queued selections in displayed order without
overwriting existing positions. Leaving Watch Next or deleting queued
relationships compacts the remaining queue transactionally. Bulk watched
changes do not invent `watched_at`; status changes preserve existing latent
schedule data. Deletion removes ratings, reviews, queue positions, and schedules
with the relationship but never deletes shared movie metadata.

Part 12 does not add custom lists, recommendations, social features,
notifications, calendar integration, statistics, or payments.

### Part 12 known limitations

- The migration must be applied manually and verified with two accounts before
  deployment; local contract tests do not prove remote RLS or privileges.
- Literal substring search is intentionally simple and has no full-text or
  trigram index. Revisit with measured query plans beyond the target scale.
- Selection does not span pages.
- Playwright is configured, but authenticated Part 12 flows, two-user isolation,
  and confirmation-dialog focus remain unverified until two confirmed QA users
  and an applied development migration are available.

## Part 13: private custom movie lists

Part 13 lets an authenticated member organize personal-library movies into
private named collections. The protected `/lists` page shows every list owned
by the current member, while `/lists/[listId]` opens one list by its UUID.
Missing, invalid, and other-member list IDs use the same safe not-found
response.

### Private-list journeys

1. A member creates a list with a trimmed name and optional description.
   Names are limited to 80 characters, descriptions to 500 characters, and
   case-insensitive duplicate names are rejected for that member.
2. The member can rename the list, edit its description, or delete it after
   typing its name. Deleting a list removes only that list and its membership
   rows; personal-library movies and their private metadata remain.
3. From list detail, the member searches only their personal WatchFlow library,
   optionally filters by status or favourite state, selects one or more
   available movies, and appends them in displayed order.
4. The member moves list items up or down with labelled keyboard-accessible
   controls. First-up and last-down are safe no-ops, and saved positions remain
   sequential after refresh.
5. The member can remove one membership after confirmation without changing
   the movie's status, rating, review, favourite state, Watch Next position,
   schedule, or shared metadata.
6. The stored movie-detail experience shows every private list available to
   the member and which lists contain that `user_movies` relationship.
   Selecting or clearing multiple memberships saves them atomically: existing
   positions remain, new memberships append, and removals compact only affected
   lists.

### Membership and ordering contract

`lists` belongs directly to one authenticated user and remains
`visibility = 'private'`. `list_movies.user_movie_id` references
`public.user_movies.id`, never `public.movies.id`, a TMDB ID, a card position,
or a browser-provided user ID. This ensures that only movies already in the
member's personal library can enter their lists.

One personal-library relationship may belong to multiple lists, but may appear
only once in any one list. Positions are one-based and unique within a list.
Batch additions accept at most 100 unique `user_movies` UUIDs, skip existing
memberships, and preserve submitted order. The Add Movies picker returns at
most 50 matching results per server query; it searches title, original title,
director, cast, and genre through the existing private library query and marks
already-added movies as unavailable.

List creation, editing, deletion, additions, removals, reordering, and
movie-detail membership saves use the authenticated cookie-bound Supabase
client after `auth.getUser()`. RLS derives ownership through `lists` and
`user_movies`; no list mutation accepts a user ID. Atomic database functions
serialize per-list ordering, lock relevant rows, normalize damaged order, and
return explicit success/no-op/count results. Deleting a `user_movies`
relationship cascades its list memberships and compacts surviving affected
lists without changing the Watch Next queue architecture.

The list index uses one owner-scoped aggregate query for movie counts and up to
four poster previews per list. List detail uses fixed owner-scoped queries
rather than one request per movie. Private list names are not placed in public
metadata or public browser storage.

### Part 13 privacy and scope exclusions

All custom lists are private during Part 13. The product does not expose public
visibility, public list URLs, sharing, collaboration, followers, comments,
likes, voting, social feeds, public profiles, AI-generated lists, or payments.
Drag-and-drop is not required; accessible Up and Down controls are the ordering
baseline.

### Part 13 known limitations

- `supabase/migrations/202607290001_part_13_private_custom_lists.sql` must be
  applied manually and the PostgREST schema reloaded before database-backed
  list routes can work against a target project.
- Repository code and contract tests do not prove the target tables, grants,
  RLS policies, RPC execution privileges, cascade behavior, concurrency, or
  cross-user isolation. Those checks still require two confirmed QA accounts.
- Authenticated create/edit/delete, picker, ordering, movie-detail membership,
  mobile viewport, screenshot, console, and failed-network browser flows remain
  pending until the migration and QA sessions are available.
- The picker displays the first 50 matching movies per query and has no
  additional picker pagination in this milestone. One add request is limited
  to 100 movies.
- The movie-detail membership selector reads at most 500 private lists. This is
  sufficient for the current target of hundreds of lists but is a documented
  future pagination/search boundary.
- Poster collages show at most four available posters. Missing posters retain
  an accessible empty preview.

## Part 14: random movie picker and rule-based recommendations

Part 14 adds two protected discovery experiences:

- `/picker` chooses one movie from the authenticated member's own WatchFlow
  library after applying explicit filters.
- `/recommendations` ranks a bounded set of that member's unwatched movies
  using documented metadata and personal-library rules.

Both routes are private. They use the normal cookie-bound Supabase client after
a fresh `auth.getUser()` check, remain subject to RLS, and never accept a user
ID from the browser. Neither route calls TMDB, an LLM, or another external
recommendation provider. WatchFlow describes the output as **rule-based
recommendations**, not AI, prediction, or psychological analysis.

### Random movie picker

The picker supports one genre, maximum runtime, minimum public rating, mood,
release period, watched state, Watch Next only, and favourite only. Its default
watched state is Unwatched.

- Genre choices are normalized, deduplicated labels represented in the
  member's library. A requested genre must match one of those labels.
- Maximum runtime choices are 90, 120, 150, or 180 minutes. A movie with no
  runtime remains eligible only when no maximum is active.
- Minimum public rating is a validated decimal from 0 through 10 and reads
  `movies.public_rating`. It never means `user_movies.personal_rating`. A movie
  with no public rating remains eligible only when no minimum is active.
- Release periods are Before 1980, the 1980s, 1990s, 2000s, 2010s, or 2020s.
  Missing release years are eligible only when Any period is selected.
- Watched means `status = 'watched'`; Unwatched means every other status.
- Watch Next only requires `status = 'watch_next'` and overrides a conflicting
  watched-state choice without changing queue order.
- Favourite only reads the private `user_movies.favourite` boolean and never
  infers favourite state from a rating.
- An explicit genre and mood are cumulative: the movie must satisfy both.

Validated filters use the URL keys `genre`, `maxRuntime`, `minRating`, `mood`,
`period`, `watched`, `watchNext`, and `favourite`, so they survive refresh.
Invalid values fall back safely with a visible warning. A bounded Client
Component retains at most 50 recently returned `user_movies.id` values during
the current picker interaction. The server validates those UUIDs, applies every
filter first, and chooses securely from unseen eligible rows. It resets the
exclusion cycle only after every eligible movie has been seen.

Picking is read-only. It does not alter status, queue order, favourite state,
ratings, schedules, or list memberships. The result explains every active rule
it matched and may reuse existing authenticated actions for Watch Next,
favourites, custom-list management, and stored movie details.

### Mood rules

Moods are explicit genre/runtime rules centralized in
`lib/discovery/moods.ts`:

| Mood | Rule |
|---|---|
| Exciting | Action or Adventure |
| Relaxing | Animation, Comedy, or Romance, with runtime at most 130 minutes |
| Funny | Comedy |
| Emotional | Drama or Romance |
| Dark | Crime, Horror, or Thriller |
| Intense | Action, Crime, Thriller, or War |
| Mind-Bending | Mystery, Science Fiction, or Thriller |
| Family-oriented | Adventure, Animation, or Family |

Family-oriented is deliberately cautious wording. WatchFlow does not store
complete certification data and does not promise that a matching movie is
suitable for every child.

### Rule-based recommendations

Recommendation candidates must be owned by the authenticated member and have
one of these statuses:

- `want_to_watch`
- `watch_next`
- `scheduled`
- `on_hold`

The general recommendation pool excludes `currently_watching`, `watched`, and
`dropped`. A seed movie is also excluded from its own candidate set.

The strongest seed source is a personal rating of 8 or higher. WatchFlow keeps
at most five seeds, renders the strongest three seed sections, and shows at
most three recommendations for each rendered seed. When that does not supply
enough seeds or suggestions, WatchFlow progressively uses favourite watched
movies, watched movies rated 7 or higher, genres supported by the member's
rated/watched/favourite history, directors supported by at least two ratings
averaging 7 or higher, and finally publicly highly rated eligible movies. The
interface states which fallback supplied the results and never fabricates
preference data.

Per-seed scoring is transparent:

| Signal | Points |
|---|---:|
| Each shared genre | +4, capped at +12 |
| Same normalized director | +3 |
| Release years within 10 years | +1 |
| Runtimes within 30 minutes | +1 |
| Candidate is a favourite | +1 |
| Candidate is in Watch Next | +1 |
| Candidate public rating at least 7 / at least 8 | +1 / +2 |
| Seed personal rating at least 9 / exactly 10 | +1 / +2 |

Missing metadata contributes no points but is not treated as evidence that a
movie is poor. Stable score, shared-genre, director, public-rating, title, and
relationship-ID tie-breaks keep the default order deterministic. Candidate IDs
are deduplicated across seed and aggregate sections. Soft genre/director
diversity and refresh ordering operate only inside a window no more than two
points below the current best item, so one prolific signal does not occupy
every slot without discarding score quality. At most 16 recommendations are
rendered.

Sections appear only when supported by the member's data. They may include
“Because you rated …”, “Genres you rate highly”, “From directors you rate
highly”, “From your Watch Next queue”, and “Highly rated in your unwatched
library.” Every item includes at least one concrete reason such as shared
genres, the same director, a similar runtime/release period, or Watch Next and
public-rating state.

### Cold starts and scope

Useful empty states distinguish an empty library, no eligible unwatched
candidates, no ratings, and no suitable scored recommendations. They direct the
member to Search Movies, My Library, Watch Next, or Import Movies as
appropriate.

The discovery dataset processes at most the newest 1,000 personal-library
relationships in one request and reports when a larger library was truncated.
This is the documented MVP boundary. Part 14 creates no recommendation table,
feedback table, migration, index, or database function and does not persist
generated results or refresh history.

Public recommendations, shareable result pages, AI recommendations, social
feedback, “not interested” training, and recommendation-model learning remain
out of scope.

## Part 15: testing and production hardening

Part 15 prepares the implemented private SaaS for an isolated Preview. It adds
no payment, social, collaboration, public-profile/list, AI-recommendation,
notification-delivery, calendar-sync, or deployment feature.

### Reliability and security requirements

- All TMDB-backed operations authenticate before provider work and consume a
  database-backed allowance belonging to that authenticated user.
- Interactive search permits 30 requests per 60 seconds and details 20 per 60
  seconds. CSV search/details each permit 120 requests per 600 seconds.
- A friendly retry message replaces provider/internal details when an
  allowance is exhausted. A missing limiter migration fails closed.
- Shared `movies` details use one canonical English row per `tmdb_id` and may
  be reused for 30 days only when their refresh timestamp and
  adult-classification markers are compatible. Preferred language remains a
  request-scoped search choice.
  Personal library, settings, lists, exports, picks, and recommendations are
  never globally cached.
- Identical requests in one server process are deduplicated while in flight.
  Database uniqueness protects stored relationships/metadata and the durable
  limiter enforces cross-instance request budgets; neither deduplicates
  identical provider refreshes across instances.
- CSV input stays in memory and is bounded by file, row, column, cell, and
  confirmation limits. Every generated CSV, including failure reports,
  neutralizes spreadsheet formula prefixes.
- Auth callback, provider, and database failures use safe application messages.
  Production UI never displays raw Postgres details or stack traces.
- Private exports are authenticated, owner-filtered, no-store attachments.
  JSON export format version 2 includes private custom lists without internal
  identifiers.
- The server-only admin client remains limited to shared movie metadata and
  final deletion of the same freshly verified Auth user.

### Usability requirements

- Product routes stream a stable loading layout and long-running forms expose a
  pending state that prevents accidental repeat submission.
- Important route failures offer controlled retry/stable navigation without
  leaking implementation details.
- Empty states explain whether a collection is empty or filters produced no
  match and provide one relevant action.
- Posters reserve their aspect ratio, use optimized bounded TMDB source sizes,
  include appropriate alternative text, and fall back when a path/image fails.
- Current navigation, statuses, and favourite state have text or icon semantics
  and are not conveyed only by color.
- Public sign-up remains usable at 375x667, 390x844, 768x1024, 1366x768, and
  1440x900.

### Test architecture and acceptance

Unit/source tests use pure fixtures and mocked Supabase/provider adapters.
Read-only database catalog scripts report actual schema/RLS/grant readiness.
Playwright provides public auth/route regressions, isolated in-memory contexts
for two QA users, controlled movie/list/CSV helpers, redacted console/network
diagnostics, and a separately guarded disposable account-deletion suite.

Authenticated mutation tests run only when the app uses a loopback URL, the
target is explicitly identified as development, the configured Supabase URL
exactly matches an independently supplied expected-project URL, and disposable
credentials are provided. Account deletion also requires a distinct one-use
account and an explicit enable flag. Skipped guarded tests are recorded as
blocked coverage, never as passing workflows.

The recorded local hardening gate includes lint, direct TypeScript, the
complete unit suite, the gated integration command, public/regression
Playwright, a production build, and a post-build client secret scan. It does
not complete Part 15 acceptance: the required authenticated workflow matrix
and live verification remain incomplete. Finishing that work in Part 16
requires applying/inspecting the target migrations, running both SQL
verification scripts, two-user RLS/privilege isolation, authenticated critical
workflows, password-reset email delivery, and the disposable deletion account.

### Part 15 known limitations

- `supabase/migrations/202607300001_part_15_tmdb_rate_limits.sql` is created but
  not remotely applied by this milestone.
- The repository lacks the original base migration for `profiles`, `movies`,
  and `user_movies`; target base RLS, grants, and Auth cascades require direct
  inspection.
- No confirmed disposable QA credentials or mailbox were available for the
  recorded local run, so authenticated, destructive, delivered-email,
  protected-responsive, and complete screenshot workflows remain unverified.
- In-flight deduplication is process-local. Multiple instances can refresh the
  same stale metadata concurrently, though the durable rate counter and unique
  upsert preserve limits/data integrity.
- List summaries, dashboard, and schedule retain documented bounded/unpaginated
  MVP reads that need Preview measurements.
- Monitoring, backups/restore, SMTP, legal pages, TMDB attribution/licensing,
  isolated production infrastructure, and domain redirects are not configured.
- The requested `/statistics` feature is not present in the repository. Its
  prefix is protected, but there is no page, chart, query module, or route to
  preserve/test.

## Next milestone

Part 16 - Preview Deployment.
