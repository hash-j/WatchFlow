# WatchFlow Architecture

## Runtime structure

WatchFlow uses the Next.js App Router. The root route is public, `/auth/*`
contains authentication entry points, and the `(app)` route group contains the
authenticated product experience without adding a URL segment.

```text
Browser
  -> Next.js proxy (refresh Supabase auth cookies)
  -> public route, auth callback, or protected App Router layout
  -> server-side Supabase client
  -> Supabase Auth / PostgreSQL with RLS
```

## Rendering boundaries

- Pages and layouts are Server Components unless interactivity requires a
  Client Component.
- The authenticated layout validates the JWT and loads profile data before it
  renders the application shell.
- Auth forms are Client Components because they maintain inputs, submit from the
  browser, and update the client-side router.
- Sign-out and the route error boundary are Client Components for the same
  reason.

## Supabase SSR clients

The project follows the cookie-based `@supabase/ssr` pattern:

- `lib/supabase/client.ts` creates a browser client with
  `createBrowserClient` and public environment variables only.
- `lib/supabase/server.ts` creates a new server client per use, reads all
  request cookies, and writes refreshed cookies when the current Next.js
  context permits it.
- `lib/supabase/proxy.ts` creates a request-scoped server client, copies all
  Supabase cookie mutations to both the request and response, calls
  `getClaims()`, and redirects anonymous requests for protected routes.
- `proxy.ts` applies session refresh to application requests while excluding
  static assets.

`getClaims()` is the authorization check because it verifies the access-token
signature. `getSession()` must not be used to protect server-rendered data.

## Authentication flows

### Sign-up and verification

The browser calls `signUp()` with an email redirect to `/auth/callback`. The
callback supports PKCE authorization codes and token-hash links. It verifies or
exchanges the credential on the server, writes the session cookies, and routes
the member to an internal destination.

### Sign-in and sign-out

The browser uses `signInWithPassword()` and then refreshes navigation so Server
Components receive the new cookie session. Sign-out calls `signOut()` and
returns to `/auth/login` only after Supabase succeeds.

### Password recovery

The recovery request points to `/auth/callback?next=/auth/update-password`.
The callback establishes the cookie session before the protected reset page
calls `updateUser()`.

## Authorization and data access

The proxy provides an early redirect for protected URLs. The `(app)` layout
repeats the identity check at the data boundary; this defense-in-depth prevents
a route matcher mistake from exposing protected Server Components.

Profile reads use the signed-in user's server client and target the authenticated
user ID. Supabase RLS remains the final authorization layer. The server-only
secret-key client added in Phase 2 is restricted to shared `movies` metadata.

## Error and loading behavior

- Auth forms show pending and recoverable error states inline.
- Auth cards expose semantic page headings, errors use `role="alert"`, and
  forgot-password success uses `role="status"`.
- Invalid or expired callback links route to `/auth/error`.
- The authenticated route group has a streaming loading skeleton.
- Its error boundary provides a retry action without displaying backend error
  details.

## Future integration boundaries

Phase 2 adds its server-only TMDB adapter and movie ingestion workflow behind
separate provider and library modules. Billing is not designed or implemented.
Neither concern is coupled to the Phase 1 auth client modules.

## Phase 2 provider and library boundaries

`lib/movies/provider.ts` defines the provider-independent search/details
contract. `lib/movies/tmdb-provider.ts` is marked server-only, authenticates to
TMDB with the read-access Bearer token, applies an eight-second timeout, and
maps unknown API payloads before returning internal types.

Library server actions accept only TMDB or library-record identifiers. The
orchestration service authenticates first. Shared `movies` metadata is then
upserted with a separate server-only secret-key client; the client is created
only after a verified user is available. All `user_movies` reads, inserts, and
deletes use the cookie-bound authenticated client and explicit verified-user
filters in addition to the existing RLS policies.

## Phase 3 movie-management boundary

Interactive forms submit a library-item ID and user-entered movie fields to
server actions. The actions verify the user with `auth.getUser()`, validate the
status, rating, priority, text lengths, dates, time, and IANA timezone, then use
the authenticated SSR client. Browser input never includes a user ID.

Personal-detail saves use a direct authenticated `user_movies` update filtered
by both the relationship ID and the verified user ID. Status changes normalize
that member's queue with the same cookie-bound client. Dedicated queue moves,
scheduling, and deletion use security-invoker PostgreSQL functions that derive
ownership from `auth.uid()` and retain RLS enforcement. The admin client is not
involved in either path.

Local schedule input is converted on the server to an ISO instant and stored in
`user_movies.scheduled_for` (`timestamptz`). The selected IANA timezone is saved
on the relationship in `schedule_timezone`; a best-effort authenticated profile
update makes it the next form default. Today, Upcoming, and Past use the saved
relationship timezone with the profile timezone as fallback. The optional
private note is stored on `user_movies`.

`move_watch_queue_item` is a security-invoker RPC available only to the
authenticated role. It derives ownership from `auth.uid()`, locks the member's
queue, serializes concurrent moves, clears positions to avoid unique-index swap
conflicts, and writes contiguous one-based positions in the same transaction.

## Part 10A CSV import architecture

The `/import` page is inside the authenticated `(app)` route group and is also
listed in the proxy's protected-route set. The browser owns only temporary
wizard state. The CSV is sent directly to a Server Action, parsed in memory,
returned as bounded structured rows, and never written to disk, logs, Supabase
Storage, or another persistence layer.

```text
CSV File
  -> authenticated parse action
  -> bounded ParsedCsv (temporary browser state)
  -> column mapping + server re-validation
  -> concurrency-limited, cached TMDB search
  -> explicit member match decisions
  -> authenticated confirmation action
       -> full TMDB details
       -> secret-key client: movies upsert only
       -> cookie-bound client: user_movies lookup/insert
       -> authenticated queue normalization RPC when needed
  -> row-level result report
```

The code boundary is intentionally split across `lib/import/csv.ts` (syntax and
file limits), `mapping.ts` (column and personal-value normalization),
`matching.ts` (provider-independent confidence scoring and concurrency),
`service.ts` (confirmation orchestration), and `supabase-import.ts` (server-only
database adapter). Browser-submitted structured data is treated as untrusted
and reconstructed through these validators at matching and confirmation time.

Every import Server Action verifies the current Supabase user. Matching and
confirmation services authenticate again at their data boundaries. No action
accepts a user ID. `TMDB_READ_ACCESS_TOKEN` remains confined to the existing
server-only provider. `SUPABASE_SECRET_KEY` remains confined to the server-only
admin factory, which is constructed only after `auth.getUser()` succeeds and
is used only to upsert shared `movies` metadata.

The member's cookie-bound client performs duplicate lookups and `user_movies`
inserts with the verified user ID, so RLS continues to enforce tenant
isolation. The unique `(user_id, movie_id)` constraint is the final idempotency
guard. Watch Next rows are processed sequentially in CSV order after the
existing maximum position and the existing security-invoker normalization RPC
restores contiguous positions.

TMDB search results are mapped internal movie types before scoring. A single
operation caches identical normalized title/year lookups and starts at most
four requests concurrently. Exact title plus year matches may be selected
automatically. A unique high-confidence title match may be classified as
probable; lower-confidence and competing results require an explicit choice.
No importer silently chooses the first provider result.

## Part 10B settings architecture

All settings pages live under the existing authenticated `(app)` route group.
The proxy protects the `/settings` prefix, the parent application layout checks
verified claims, and the settings layout performs a fresh `auth.getUser()`
check. Server Components load profile and preference records; small Client
Components are used only for pending form state and confirmation controls.

```text
Settings form
  -> Zod-validated Server Action
  -> auth.getUser()
  -> cookie-bound Supabase client
  -> explicit verified-user filter + RLS

Private export route
  -> auth.getUser()
  -> explicit, owner-filtered profile/preferences/user_movies selects
  -> in-memory CSV or JSON serialization
  -> private no-store attachment response
```

`profiles` contains member identity-adjacent presentation data: full name,
avatar reference, country, and scheduling timezone. `user_preferences` contains
application defaults, display/search behavior, and future notification choices.
The application maps absent preference rows to documented defaults, while the
migration backfills existing Auth users and creates rows for new users through a
preferences-only trigger that does not replace the deployed profile trigger.

Profile and preference mutations never accept a user ID from FormData. Profile
updates contain only `full_name`, `country`, and `timezone`; the migration also
limits the authenticated role's column privileges to the four approved profile
fields including the future `avatar_url` boundary. Preference upserts use the
verified Auth ID and ownership-only SELECT/INSERT/UPDATE RLS. Normal users have
no DELETE policy or grant on `user_preferences`.

The manual-add database function is `security invoker`, derives ownership from
`auth.uid()`, reads that user's status and priority defaults, serializes queue
placement, and remains subject to RLS. TMDB requests stay server-only and accept
only validated stored adult, release, and supported-language preferences.

CSV and JSON exports are generated entirely in memory. Both whitelist columns,
scope every private query to the verified member, set attachment and no-store
headers, and are never persisted. CSV serialization doubles quotes, quotes
commas/newlines, and prefixes formula-like spreadsheet values. JSON format
version 1 separates profile, preferences, personal library, and schedule data
without including raw Auth records or internal secrets.

Library deletion uses the authenticated client to delete only `user_movies`
rows where `user_id` matches the verified user. Account deletion is a separate
flow: exact phrase and checkbox validation, fresh `getUser()`, a trusted
30-minute `last_sign_in_at` check, then server-only admin deletion of that same
user ID. The admin client is never imported by a Client Component. No user-owned
rows are pre-deleted, so an admin failure leaves the account intact and is
reported honestly. After success the local cookie session is signed out and the
visitor is redirected to a neutral public confirmation.

Avatar upload remains deferred until a private `avatars` bucket, MIME/size
validation, and folder-scoped Storage policies can be reviewed together.
Notification delivery also remains out of scope; only preferences are stored.

## Part 12 private-library query and mutation architecture

`/library` no longer calls the legacy full-library list service. That service
is preserved for dashboard, Watch Next, and schedule callers. The Part 12 page
uses a separate boundary:

```text
validated URL state
  -> one fresh auth.getUser() + preferences read
  -> security-invoker watchflow_library_rows (auth.uid owner scope)
  -> whitelisted stable database order + exact count + range
  -> lean defensive summary mapping

owner-scoped watchflow_library_filter_options
  -> normalized genres/directors/years + four summary counts
```

`lib/library/query.ts` owns parameter validation, sort configuration,
pagination math, canonical URLs, and exact-year precedence. The database
function performs literal substring search across shared title/original title,
director, genre labels, and cast names only after joining from the verified
member's `user_movies`. Search/filter values remain typed function arguments;
no raw PostgREST expression or dynamic SQL is built from browser input.

The RPC returns flat sortable columns because ordering an embedded `movies`
relation does not reliably order parent `user_movies`. PostgREST applies exact
count and `.range()` to this already owner-filtered relation. Results and
facets are request-scoped private data and are not statically or globally
cached.

Grid/list cards remain Server Components. Small Client Components own favourite
submission, current-page selection, native modal confirmation, and pending
feedback. Selection keys are `user_movies.id`, serialize in displayed order,
never span pages, and reset whenever canonical URL scope changes.

Favourite uses a direct authenticated update filtered by both relationship ID
and the user ID returned by `auth.getUser()`. Bulk status and deletion use
authenticated, security-invoker RPCs with no user-ID argument. They validate a
100-row maximum, lock the caller's queue, verify the complete selection before
mutation, and normalize queue positions transactionally. New Watch Next rows
append in displayed order; bulk `scheduled` is deliberately unavailable.
Changing status does not invent a watched date and preserves latent scheduling
metadata. Deletion removes only personal relationships and never shared movie
metadata.

## Part 13 private custom-list architecture

Part 13 adds `/lists` and `/lists/[listId]` inside the existing authenticated
`(app)` route group. `/lists` is also covered by the proxy's protected-prefix
set and the shared application layout. Each server-side lists boundary performs
a fresh `auth.getUser()` through `authenticateLists()` before reading or
mutating private data. Invalid UUIDs and lists that are missing or owned by
another user converge on the same not-found behavior.

```text
authenticated list page or movie detail
  -> Zod-validated route/action input
  -> auth.getUser()
  -> cookie-bound Supabase SSR client
  -> explicit owner filter + RLS
  -> direct owned-list metadata mutation
     or authenticated security-invoker ordering RPC
  -> targeted Next.js path revalidation
```

The focused server-only adapter is `lib/lists/supabase-lists.ts`; list types,
defensive result mapping, validation, and safe error classification remain in
the other `lib/lists/*` modules. Server Components perform private reads.
Client Components are limited to dialogs, pending form state, checkbox
selection, confirmation, and accessible up/down controls. No custom-list path
uses the Supabase admin client.

### Ownership and membership boundary

`lists.user_id` is supplied only from the user returned by `auth.getUser()`.
Browser forms never supply or choose a user ID. A membership stores
`list_movies.user_movie_id`, which is the UUID primary key
`public.user_movies.id`. It never stores shared `movies.id`, TMDB ID, an array
index, or a card position. RLS permits a membership only when both the parent
list and referenced personal-library row belong to `auth.uid()`.

Deleting a list directly through the authenticated client removes that list and
its memberships through `lists -> list_movies on delete cascade`. The foreign
key direction cannot delete `user_movies`, ratings, reviews, queue/schedule
state, favourites, or shared movie metadata. Conversely, removing a personal
library relationship cascades only its list memberships and leaves the
remaining lists intact.

The migration narrows authenticated privileges rather than granting arbitrary
table writes. `lists` exposes table SELECT/DELETE, INSERT only for owner/name/
description, and UPDATE only for name/description/triggered timestamp.
`list_movies` exposes table SELECT/DELETE, INSERT only for its two references
and position, and UPDATE only for position. Eight RLS policies independently
cover SELECT, INSERT, UPDATE, and DELETE on both tables. `anon` receives no
table or function access, and `visibility` is constrained to `private`.

### Query and caching boundary

`watchflow_list_summaries()` performs the `/lists` summary read in one private
security-invoker query. It owner-filters first, counts memberships, and obtains
at most four ordered non-null poster paths per list without a request per list
or poster. List detail uses one nested, owner-filtered
`list_movies -> user_movies -> movies` read ordered by saved position. The Add
Movies picker reuses the Part 12 owner-scoped library RPC, caps a result page at
50, and performs one membership lookup for those candidate IDs rather than one
lookup per result.

Movie detail first verifies the supplied `user_movies.id`, then loads up to 500
of that owner's lists and the current reverse memberships. List names and
membership state are never queried for another owner.

Custom-list results are request/user scoped. The pages do not statically
generate private list routes, use a cross-user persistent cache, place list data
in public browser storage, or emit public metadata containing list names.
Cookie-backed authentication makes these reads dynamic; successful mutations
revalidate `/lists`, the affected `/lists/[listId]`, and relevant library/movie
detail views.

### Atomic ordering and membership RPCs

Migration `202607290001_part_13_private_custom_lists.sql` adds six
authenticated application RPCs:

- `watchflow_normalize_list_positions(uuid)` returns JSONB success,
  normalization, and item-count state.
- `watchflow_move_list_item(uuid, text)` returns whether an item moved plus its
  list and final position; a boundary move is a successful no-op.
- `watchflow_add_movies_to_list(uuid, uuid[])` atomically validates and appends
  up to 100 unique personal-library rows in submitted order, reporting matched,
  added, and skipped counts.
- `watchflow_remove_movie_from_list(uuid)` deletes only one membership and
  reports removal plus the surviving count.
- `watchflow_set_movie_list_memberships(uuid, uuid[])` atomically reconciles a
  movie's desired membership across up to 500 lists, preserving existing order
  and reporting added, removed, and unchanged counts. An empty desired array
  removes every current membership.
- `watchflow_list_summaries()` returns the owner-only list-card rowset described
  above.

Every RPC is `security invoker`, has a fixed
`search_path = public, pg_temp`, derives the caller from `auth.uid()`, and is
executable only by `authenticated`. Missing/foreign objects share a
nonrevealing not-found or selection-changed result. Mixed stale/foreign batch
input causes no partial mutation.

When an operation needs both object families, it first takes the Part 12
per-user advisory mutation lock, then locks owned `user_movies` rows in Part
12's queue-position/creation-time/UUID order, affected per-list advisory locks
in list-UUID order, parent `lists` rows, and ordered `list_movies` rows. This
matches the Part 12 bulk-deletion path and prevents a list-add/bulk-delete lock
inversion. Each list advisory key is namespaced from the list UUID. The legacy
direct full-library DELETE does not take the shared advisory lock, so concurrent
full-library deletion remains a live stress-test item rather than a proven
cross-feature guarantee.

Saved positions are positive, contiguous, and one based. The unique
`(list_id, position)` constraint is deferrable but initially immediate.
Normalization locks the list, defers that named constraint, writes a positive
temporary range, then writes final `1..N` values ordered by previous position,
creation time, and UUID. Moves use a temporary `N + 1` slot before swapping
adjacent rows. Append RPCs normalize once, read the locked maximum, and preserve
input ordinality. The separate non-deferrable unique
`(list_id, user_movie_id)` constraint is the duplicate-membership
`ON CONFLICT` arbiter.

An AFTER DELETE statement trigger receives deleted memberships through a
transition table. Its non-public security-invoker helper collects distinct
surviving parent lists, takes their advisory locks in stable order, updates list
activity, and compacts positions in the same transaction. This covers explicit
membership removal and cascades from Part 12 individual, bulk, or full-library
deletion. A list-parent cascade has no surviving parent to normalize.

The migration reuses `watchflow_set_updated_at()` for list and membership audit
triggers. It is version controlled but is a manual Supabase SQL Editor step and
is not known to be applied. Source-level tests do not replace live two-user RLS,
foreign-ID, cascade, or concurrent add/move/delete verification.

## Browser QA architecture

`playwright.config.ts` runs headless Chrome against `PLAYWRIGHT_BASE_URL` or
`http://localhost:3000` and can reuse an existing local server. The focused
specs are:

- `e2e/authentication.spec.ts`
- `e2e/protected-routes.spec.ts`
- `e2e/responsive.spec.ts`

They cover logged-out authentication semantics/errors, callback failure
handling, protected-route redirects, keyboard order, and public responsive
behavior. They do not store an authenticated session and do not prove Part 12
migration application, Supabase privileges/RLS, or two-user data isolation.
