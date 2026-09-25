# WatchFlow Architecture

## Part 18E browser push subscription boundary

Part 18E adds subscription infrastructure, not notification delivery. The
settings Server Component reads the owner preference under the existing SSR/RLS
boundary and passes only the public VAPID application-server key to an explicit
Client Component. The browser asks for permission only after a button press,
uses the already-registered service worker, and returns its native subscription
to a Server Action.

```text
user gesture -> Notification permission -> PushManager.subscribe(public VAPID key)
             -> fresh server auth.getUser() -> security-invoker save RPC
             -> auth.uid()-owned subscription + enabled preference

disable -> fresh server auth.getUser() -> owner-only disable RPC
        -> delete that owner's stored subscriptions -> browser unsubscribe
```

The browser never sends a user ID. `push_subscriptions` is RLS-protected for all
operations, and the RPCs derive ownership from `auth.uid()`. The application
uses the authenticated SSR client and contains no service-role/admin path for
subscriptions. Endpoints and Push API keys are private owner data.

The service worker's push handler is a display boundary only. It accepts a
bounded title/body, uses fixed local icons, and permits only an internal
single-slash action path. Notification clicks focus or open a same-origin
window. Push payloads, private pages, Supabase responses, and sessions are never
cached. A public VAPID key is supported for browser subscription; private-key
signing and delivery intentionally do not exist in this milestone. There is no
scheduler, delivery worker, background sync, email, or weekly-summary behavior.

## Part 18D installable PWA and offline-shell boundary

Part 18D adds a progressive, installable web-app shell without changing the
authentication or private-data architecture. `app/manifest.ts` supplies the
typed web manifest, root metadata supplies install/icon hints, and a small
Client Component registers the root-scoped public service worker after load.
The manifest's protected `/dashboard` start URL still passes through the normal
Supabase authentication boundary while the manifest, icons, worker, and generic
offline document remain public static resources.

The service worker has a deliberately narrow cache contract:

```text
precache: /offline.html + public WatchFlow icons
runtime cache: /_next/static/* + /icons/* + /favicon.ico
navigation: network only -> generic offline.html on network failure
everything else: network only, never written to Cache Storage
```

Consequently, rendered pages and route responses containing private library,
movie, notification, preference, or session data are never cached. Cross-origin
requests, including Supabase Auth and data traffic, are ignored by the worker.
The offline shell contains no personalized content and offers only a retry link.
There are no push events, background sync, offline writes, mutation queues, or
notification workers in this foundation.

`proxy.ts` excludes only the public PWA asset paths from cookie refresh; all
authenticated application routes retain the existing proxy, server-verified
identity, SSR client, and RLS model. The worker script is explicitly revalidated
by HTTP caches so updates are discovered without making private responses
cacheable.

## Part 18C-1 in-app notification foundation

Part 18C-1 introduces only private in-app system notifications. It does not
introduce email, scheduled delivery, a worker, weekly summaries, or push
notifications. `/notifications` is rendered inside the authenticated App Router
shell and reads through the cookie-bound Supabase client under RLS.

The authenticated layout reuses its request-scoped verified claims and client
to count unread rows once. That count is passed through `AppShell` to the shared
desktop/mobile navigation and is capped visually at `99+`. A count failure is
logged with the existing redacted database logger and degrades to zero so an
optional badge cannot make the entire authenticated application unavailable.
The feed itself is a bounded newest-first read and surfaces a controlled load
failure.

```text
authenticated shell -> owner-scoped unread count -> shared navigation badge

/notifications -> getAuthContext() -> owner-scoped notifications SELECT + RLS
mark-read form -> validated UUID -> fresh auth.getUser()
               -> security-invoker RPC deriving auth.uid() -> RLS UPDATE
               -> synchronous feed + layout revalidation
```

The database accepts only the `system` notification type in this milestone.
Authenticated clients have no notification INSERT or DELETE privilege. System
row creation is limited to fixed-payload server-only producers after a freshly
verified authenticated event. Users receive table SELECT and `read_at`-only
UPDATE privileges, while ownership policies and the two RPCs keep ordinary
mutations scoped to `auth.uid()`. Browser actions never accept an owner ID or
notification content.

The first producer is CSV Import V2 completion. The Client Component supplies
only a per-upload UUID and final-batch marker to the existing import Server
Action. After a verified final batch returns no failed rows, the action passes
its fresh `getUser()` ID to the server-only notification service. The service
constructs fixed system copy and a `/library` action, then inserts through the
narrow trusted server client. A SHA-256-derived UUID over the verified user and
completion UUID is the primary key; conflict-ignore insertion makes a retry of
the same completion idempotent and includes the owner in the identity. No
generic creation Server Action or authenticated RPC exists. A producer failure
does not misreport already-persisted movie rows as failed; it adds a controlled
batch warning instead.

Movie status mutations are the next trusted producers. The authenticated
management adapters capture an owner-scoped pre-mutation snapshot through the
signed-in user's Supabase client, run the existing atomic status mutation, and
only then invoke the server-only producer for Scheduled to Currently Watching,
Currently Watching to Watched, or entry into Watch Next. Direct movie-details
and bulk status flows share this boundary. The browser supplies neither an
owner nor notification content.

Each transition ID hashes the verified owner, `user_movies` ID, transition
event, and pre-transition `updated_at` value. This collapses retries and
concurrent delivery of the same transition without suppressing a later genuine
cycle. Producer failures do not turn an already-committed library mutation into
a false failure. Successful actions synchronously revalidate notification views
so the shell badge and feed reflect the event on the next render.

Custom-list membership additions are also trusted producers. Both the
list-detail batch picker and movie-detail membership form freshly authenticate
inside the list adapter. Before the existing atomic RPC, the adapter reads the
owned lists, owned library movies, and current memberships through the signed-in
Supabase client. After a successful RPC, it resolves only the newly created
`list_movies` rows and passes their server-created IDs plus server-read names to
the notification service. Removal and reorder functions never invoke this path.

The custom-list notification ID hashes the verified owner and `list_movies.id`.
This suppresses duplicate delivery for one membership while allowing a later
real remove-and-readd cycle to notify because the database creates a new
membership ID. The service fixes the notification type, title, action path, and
metadata source; browser fields cannot choose notification content or owner.
Watch Next remains event-specific in the movie-status producer, so queue
priority, reorder, and removal mutations remain silent.

## Part 15.5C discoverability architecture

`components/app-navigation.tsx` is the single authenticated navigation source
for desktop and mobile. It exports ordered Home, Your movies, Discover,
Insights, and Account groups plus the flattened route list used to derive the
mobile current-page title. `AppNavigation` renders visible semantic groups and
`aria-current="page"`; `MobileAppNavigation` reuses that component inside its
existing keyboard-safe drawer, so route names and order cannot drift.

The milestone remains presentation-only. Shared `PageHeader`, `EmptyState`,
`ResponsiveActions`, `MobileToolbar`, and native responsive dialog/disclosure
primitives continue to own page structure. Major routes refine titles,
descriptions, empty-state actions, and user-language helper copy without adding
data fetching or mutation paths.

Library keeps URL-backed server querying and places advanced filters/status
definitions behind native `details`; selection state and bulk mutations are
unchanged. Movie Picker keeps the same validated URL state and Server Action,
but its optional filters move into a native disclosure while the primary Pick
a Movie submit stays visible. Recommendations keep the same deterministic
rule engine and place scoring details behind the existing disclosure.

Movie and List deletion reuse their existing validated actions/dialogs. Only
their placement changes: Remove from Library appears after ordinary personal
movie controls, and Delete List appears in a separated List-detail section
instead of every summary card. Settings exports remain ordinary actions above
the unchanged destructive Data & Account controls.

No database migration, schema change, RPC, dependency, environment variable,
new Client Component boundary, analytics event, or persistent help state is
introduced.

**Current milestone:** Part 15.5C - App Discoverability & User Friendliness.
**Next milestone:** Part 15.5D - Final Visual/UI Polish.

## Part 15.5B onboarding architecture

`/onboarding` is an authenticated App Router page outside the `(app)` shell so
the three-step experience stays focused and does not render the desktop
sidebar on small screens. The proxy protects the route, and the page repeats a
fresh `auth.getUser()` check, requires a verified email, and reads completion
through the centralized server-only helpers in `lib/onboarding/`. Browser input
never supplies a member ID.

```text
signup OTP accepted
  -> fresh verified Auth user
  -> profiles.onboarding_completed_at is null -> /onboarding
  -> timestamp, missing legacy profile, or unavailable optional field -> /dashboard

/onboarding
  -> Welcome
  -> Personalize (profile timezone + existing user_preferences fields)
  -> First movies (existing TMDB search/limiter + library services)
  -> Finish or Skip stamps completion -> /dashboard
```

The route uses `?step=1|2|3` only for transient presentation. Persistent data
is server-backed: Personalize writes before entering step 3 and every movie is
added immediately. Reloading therefore returns to a valid requested step with
saved preferences and owned movie state re-read from Supabase. Finish and Skip
share the same owned profile timestamp mutation; Skip deliberately preserves
all partial data.

The migration backfills every profile present at deployment and leaves future
profile rows incomplete. `readOnboardingProfileState()` treats a missing
legacy profile as completed so an older account cannot be trapped. No broad
middleware gate was introduced, and password login/recovery behavior is
unchanged. During a staggered application/database rollout, failure to read
the optional onboarding field falls back to Dashboard rather than breaking
successful email verification.

Personalization reuses the Settings schemas and service for timezone, default
Library view, and preferred search language. Favourite genres are not stored
because current Recommendations and Picker logic cannot consume such a field.
Movie search calls `searchTmdbMoviesForCurrentUser()` and therefore retains
the durable per-user TMDB search bucket and in-flight deduplication. Adding a
result calls the existing library ingestion service, then the existing
owner-scoped bulk status service to select only `want_to_watch` or `watched`.
The authenticated SSR client performs all profile, preference, and
`user_movies` work under RLS; the existing server-only metadata boundary is
unchanged.

**Current milestone:** Part 15.5B - First-Time User Onboarding.
**Next milestone:** Part 15.5C - App Discoverability & User Friendliness.

## Part 15.5A authentication architecture

Signup now crosses a Server Action boundary in `lib/auth/actions.ts`. Pure
validation/normalization is in `lib/auth/validation.ts`; safe provider error
classification is in `lib/auth/action-errors.ts`. The action calls the normal
cookie-bound SSR client `auth.signUp()` with email, password, and
`data.full_name`. A returned session is rejected as a configuration problem
because email confirmation must remain required.

`lib/auth/pending-verification.ts` owns a 15-minute HttpOnly,
`SameSite=Lax`, production-secure, `/auth` cookie containing only normalized
email, expiry, and resend timing. It has no password, OTP, user ID, access
token, or refresh token and grants no access.

`/auth/verify-email` submits only `code`. The server resolves email from the
cookie and calls `auth.verifyOtp({ email, token, type: "email" })`, then
`auth.getUser()`. A matching confirmed email and valid session are required
before clearing pending state and redirecting incomplete new members to
`/onboarding` and completed/established members to `/dashboard`. Resend calls
`auth.resend({ type: "signup", email })`; change-email clears only local
pending state. No schema, custom OTP service, or admin verification client was
added.

Normal login remains `signInWithPassword()`. Recovery remains
`resetPasswordForEmail()` -> `/auth/callback` -> `/auth/update-password` ->
`updateUser()`. Token-hash callback/confirm handlers are retained.

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

The signup form posts to the server-side `signUpAction`, which validates full
name, normalized email, password, and confirmation before calling `signUp()`.
The pending email is kept in the scoped HttpOnly cookie and the user enters the
Confirm signup `{{ .Token }}` code at `/auth/verify-email`. The server calls
`verifyOtp({ email, token, type: "email" })` and validates a fresh confirmed
user/session before selecting onboarding or Dashboard from the centralized
completion state. The
callback supports PKCE authorization codes and token-hash links. It verifies or
exchanges the credential on the server, writes the session cookies, and routes
the member to an internal destination.

### Sign-in and sign-out

The browser uses `signInWithPassword()` and then refreshes navigation so Server
Components receive the new cookie session. Sign-out submits a cookie-aware
Server Action, which creates the SSR client, performs a local-scope
`signOut()`, and returns to `/auth/login` only after Supabase succeeds. This
keeps the browser SDK out of the protected shell solely for logout and lets the
server own cookie mutation.

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
orchestration service authenticates first. Part 15 then consumes the appropriate
durable allowance and reuses compatible, fresh shared metadata when available;
stale/missing metadata is fetched and upserted with a separate server-only
secret-key client created only after a verified user is available. All
`user_movies` reads, inserts, and deletes use the cookie-bound authenticated
client and explicit verified-user filters in addition to the existing RLS
policies.

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
version 2 separates profile, preferences, personal library, private custom
lists/memberships, and schedule data without including raw Auth records,
internal relationship/list IDs, or secrets.

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

## Part 14 private discovery architecture

Part 14 adds `/picker` and `/recommendations` inside the authenticated `(app)`
route group and the proxy's protected-prefix set. Both pages use the shared
authenticated layout, perform private reads in Server Components, and place
only one picker result or the bounded rendered recommendation results across a
Client Component boundary.

```text
protected picker or recommendations route
  -> request-scoped Supabase SSR client
  -> auth.getUser()
  -> explicit user_movies.user_id filter + RLS
  -> one bounded user_movies -> movies query
  -> defensive mapping and normalized genres
  -> pure picker filtering/random selection
     or pure seed/scoring/diversity/reason generation
  -> limited private result UI
```

The focused module is `lib/discovery/`:

- `types.ts` defines the picker, mood, seed, score, reason, section, and
  cold-start contracts.
- `moods.ts` owns genre normalization and the eight explicit mood definitions.
- `picker.ts` parses URL state, matches filters, validates exclusions, performs
  secure random selection, and explains the match.
- `recommendations.ts` selects seeds and candidates, derives genre/director
  insights, calculates documented scores, deduplicates, applies soft diversity,
  generates reasons, and chooses a cold-start state.
- `mapping.ts` converts untrusted PostgREST rows into the bounded internal
  `DiscoveryMovie` shape.
- `supabase-discovery.ts` is the only database adapter and is marked
  `server-only`.
- `errors.ts` maps authentication, schema, relationship, permission, and
  general persistence failures to safe application errors.

The pure mood, picker, and recommendation modules do not import Supabase,
Next.js, TMDB, or browser storage. This makes rule behavior independently
testable and keeps the database boundary small.

The shared request dataset includes `personal_rating` for server-side seed
analysis. `pickRandomMovie()` projects that recommendation-only field out
before the single picker result crosses to the Client Component.

### Private data query

`getDiscoveryDataset()` creates the normal request-scoped cookie-bound client,
calls `auth.getUser()`, and passes only that verified Auth UUID to the query
adapter. The browser cannot supply or choose an owner. The query starts from
`public.user_movies`, includes an exact count, applies
`user_movies.user_id = authenticatedUser.id`, orders by `created_at desc` then
relationship UUID, and ranges from 0 through 999.

Only these fields are selected:

- `user_movies`: `id`, `status`, `favourite`, and `personal_rating`
- inner `movies`: `id`, `title`, `original_title`, `poster_path`,
  `release_year`, `runtime_minutes`, `genres`, `director`, and `public_rating`

`created_at` remains an ordering column but does not need to cross the result
boundary.

The query does not select or map `user_id`, review text, schedule notes, cast,
overview, trailer data, or other unrelated private fields. It returns
`{ movies, totalCount, truncated }`; `truncated` is true when the exact count
exceeds the 1,000-row MVP processing cap. Genre mapping accepts the stored JSON
forms already supported by the application, normalizes whitespace, removes
blank/malformed values, deduplicates case-insensitively, and sorts labels.

The authenticated client and existing RLS remain the authorization layers. No
discovery read or mutation uses the Supabase admin client. The pages do not
statically generate private data, use `unstable_cache` or a cross-user cache,
write recommendation state to browser storage, or call TMDB. Cookie access and
authenticated reads keep the work request scoped under the project's
Cache-Components configuration.

### Picker state and random selection

Picker URL parsing accepts `genre`, `maxRuntime`, `minRating`, `mood`, `period`,
`watched`, `watchNext`, and `favourite`. Unsupported values return safe
defaults plus user-visible warnings. Genre is canonicalized against the
authenticated dataset. Runtime is limited to 90/120/150/180 minutes; minimum
public rating is a decimal from 0 through 10; release periods are fixed decade
options; and Unwatched is the default state.

All filters run before selection. Missing runtime, public rating, or release
year excludes a movie only when that corresponding filter is active. Watch
Next-only requires the exact `watch_next` status and overrides a conflicting
watched-state choice. An explicit genre and a mood both have to match.

The recent-pick exclusion list exists only in the small picker Client
Component. The server accepts at most 50 unique valid `user_movies.id` UUIDs,
uses them only after independently rebuilding the authenticated candidate
pool, and chooses from unseen matches with `crypto.getRandomValues()`. Once all
eligible movies have been seen, the cycle resets rather than producing a false
no-match result. Tests inject a deterministic random source; production does
not use predictable module-global state.

### Recommendation scoring and diversity

General recommendation candidates are limited to `want_to_watch`,
`watch_next`, `scheduled`, and `on_hold`. `currently_watching`, `watched`, and
`dropped` are excluded, and a seed cannot recommend itself.

Seed priority is personal rating 8 or higher, followed by favourite watched
movies and watched movies rated at least 7. When direct seeds cannot support
enough results, aggregate rules use rated, watched, or favourite genre history;
directors require at least two rated movies averaging 7 or higher before being
treated as a pattern; publicly highly rated eligible movies are the final
cold-start fallback. Seed selection is capped at five; only the strongest three
seed sections render, with at most three candidates per seed.

Per-seed scores use one documented calculation:

- +4 per shared genre, capped at +12
- +3 for the same normalized director
- +1 for release years within 10 years
- +1 for runtimes within 30 minutes
- +1 when the candidate is a favourite
- +1 when the candidate is in Watch Next
- +1 for public rating at least 7, or +2 at least 8
- +1 for a seed personal rating at least 9, or +2 for 10

Missing metadata adds no points and is not interpreted as negative quality.
Stable shared-genre, director, public-rating, title, and relationship-ID
tie-breaks make equal scores deterministic. A movie is assigned only once to
the highest-priority supported section. Soft genre/director diversity and the
optional refresh hash operate only within two points of the current top score,
so variety never promotes clearly lower-quality candidates. The complete page
is capped at 16 recommendations.

Every recommendation carries concrete `RecommendationReason` values derived
from the same score or aggregate insight that placed it. The UI never emits a
generic AI claim. Empty-library, no-candidate, no-rating, and
no-suitable-result states remain distinct.

### Existing mutation integration and database impact

Viewing or refreshing discovery pages is read-only. Favourite actions reuse
the existing owner-scoped favourite action. “Add to Watch Next” submits one
validated relationship UUID through the Part 12 bulk-status action and its
atomic queue RPC; it does not create a second status mutation path. Custom-list
management links to the existing stored-movie detail membership workflow
instead of querying lists once per recommendation.

Library add/remove/favourite/bulk actions, management changes, CSV imports, and
full-library deletion revalidate both discovery routes so cached route output
does not retain stale candidate state.

Part 14 adds no migration, table, persisted recommendation row, index, RLS
policy, grant, trigger, or RPC. It reuses the current schema and existing
authenticated mutation architecture.

## Part 15.1 personal Statistics architecture

Part 15.1 adds `/statistics` inside the authenticated `(app)` route group. The
proxy already protects the prefix, the shared layout retains its verified-
claims defense in depth, and the page calls Next.js `connection()` before its
focused data boundary performs a fresh `auth.getUser()` check. Under Cache
Components, the build may prerender the public shell while all private
statistics remain behind that request-time boundary; no private value appears
in static output or public metadata.

```text
protected Statistics route
  -> request-scoped cookie-bound Supabase client
  -> auth.getUser()
  -> bounded user_movies -> movies!inner read
       -> explicit verified user_movies.user_id filter
       -> existing RLS
       -> exact total + stable range 0..999
  -> owner-filtered profile timezone read
  -> defensive row normalization
  -> pure server-side aggregation
  -> small calculated result rendered by Server Components
```

The focused module is `lib/statistics/`:

- `types.ts` defines normalized records, summary, distribution, timeline,
  activity, coverage, period, and final result contracts.
- `mapping.ts` validates relationship/movie identifiers and optional metadata,
  normalizes stored dates and genres, and maps an unsupported status to an
  explicit `unknown` value rather than another valid status.
- `calculations.ts` contains metric, status, genre, timeline, rating,
  top-rated, recent-activity, coverage, and empty-state calculations as pure
  functions.
- `formatting.ts` owns counts, percentages, personal ratings, runtime, and
  watched-date display.
- `errors.ts` exposes only safe authentication, schema, relationship,
  authorization, and persistence categories.
- `supabase-statistics.ts` is the only database adapter and is marked
  `server-only`.

### Query and ownership boundary

The Statistics select is limited to `user_movies.id`, `status`, `favourite`,
`personal_rating`, `watched_at`, and `scheduled_for`, plus inner-joined
`movies.id`, `title`, `poster_path`, `release_year`, `runtime_minutes`, and
`genres`. It does not select `user_id`, reviews, schedule notes, cast,
overview, shared public rating, list data, credentials, or unrelated profile
fields. The browser cannot submit an owner through search parameters, route
parameters, FormData, JSON, or Client Component state.

The authenticated SSR client applies both
`user_movies.user_id = authenticatedUser.id` and current RLS. No Statistics
path imports the Supabase admin client or calls TMDB. The exact relationship
count accompanies one stable `created_at desc`, relationship-ID ordered range.
Calculations process at most 1,000 normalized rows and expose coverage metadata
so the UI distinguishes an exact total from partial distributions for a larger
library. A second small owner-filtered profile query provides a validated IANA
timezone, falling back to UTC through the existing timezone utility.

The existing Part 12 owner/status/favourite/personal-rating/watched indexes and
the schedule index cover this bounded target-scale read. Part 15.1 creates no
migration, RPC, index, RLS policy, grant, table, dependency, or environment
variable.

### Calculation and rendering boundary

All raw private relationship rows remain on the server. The page passes only a
calculated `StatisticsResult` into presentation components; there is no
full-library Client Component payload. Watched means exact `watched`,
unwatched means every other status, Watch Next means exact `watch_next`, and a
counted schedule requires exact `scheduled` plus a valid `scheduled_for`
instant. Valid personal ratings are 0 through 10 and exclude nulls; watched
runtime requires watched status plus a positive integer runtime. Missing
watched dates are never replaced by relationship creation/update dates.

The UI uses semantic definition lists, sections, ordered/unordered lists, and
lightweight CSS bars. Counts, percentages, labels, and screen-reader summaries
remain visible independently of color. The 12-month timeline includes zero
months and uses the configured timezone for the current reporting period.
Movie result lists link to the existing stored-movie detail route and retain
poster fallback behavior.

The route-specific loading boundary mirrors the summary/distribution layout
and announces private Statistics loading without false values. Its Client
Component error boundary reuses `components/route-error.tsx`, offers a retry
and stable dashboard navigation, and never displays a raw database message or
stack trace. Empty-library, no-watched, and no-personal-rating states remain
separate and provide relevant authenticated actions.

## Browser QA architecture

`playwright.config.ts` runs headless Chrome against `E2E_BASE_URL`,
`PLAYWRIGHT_BASE_URL`, or `http://localhost:3000`. `E2E_WEB_SERVER_COMMAND`
can select the local production server command, and an existing local server
may be reused outside CI. The specs are:

- `e2e/authentication.spec.ts`
- `e2e/protected-routes.spec.ts`
- `e2e/responsive.spec.ts`
- `e2e/statistics.spec.ts`
- `e2e/authenticated-smoke.spec.ts`
- `e2e/authenticated-isolation.spec.ts`
- `e2e/account-deletion.spec.ts`

The public tests cover authentication semantics/errors, callback failure
handling, protected-route redirects, keyboard order, and responsive behavior.
Authenticated contexts are created in memory, never serialized, and are
available only when an explicit development guard, a loopback application URL,
and disposable QA credentials are present. The separate deletion account also
requires an explicit one-shot enable flag and must differ from QA Users A/B.

`e2e/helpers/diagnostics.ts` observes console errors/warnings, page errors,
failed requests, and HTTP error responses. Attachments include only categories,
methods, resource types, statuses, and redacted paths; they omit query strings,
headers, bodies, cookies, passwords, and tokens. Traces/video are disabled for
authenticated suites.

The guarded integration suite under `integration/` performs direct read-only
two-user/anonymous Supabase isolation checks. Neither a skipped guarded suite
nor a mocked adapter test proves a target migration, RLS policy, grant, Auth
redirect, email delivery, or delete cascade.

## Part 15 testing and production-hardening architecture

### Auth and browser configuration

Auth form provider/configuration failures pass through stable application
messages in `lib/auth/errors.ts`. Client construction validates the public
Supabase URL/key shape through `lib/supabase/browser-config.ts` and remains
inside the form's recoverable error boundary. Callback/confirmation handlers
allowlist OTP types, keep redirect targets internal, and place stable reason
codes—not raw provider messages—in the URL.

The protected `/protected` starter route redirects to `/dashboard` instead of
rendering claims JSON. `/statistics` was added to proxy protection for
defense in depth; Part 15.1 now provides the protected page without weakening
that boundary.

### TMDB request flow

All TMDB-backed operations require an authenticated user. Search always
consumes its allowance before a provider call; detail ingestion checks the
shared cache first and consumes a detail allowance only when a provider refresh
is necessary:

```text
authenticated request
  -> auth.getUser()
  -> validated operation and applicable search preferences/defaults
  -> search branch
       -> PostgreSQL search allowance keyed by auth.uid()
       -> optional in-process identical-search deduplication
       -> server-only TMDB search with eight-second timeout
     or detail/import-detail branch
       -> fresh compatible shared movies cache row
            -> reuse without consuming a detail allowance
          or stale/missing row
            -> PostgreSQL detail allowance keyed by auth.uid()
            -> optional in-process identical-refresh deduplication
            -> server-only TMDB details request with eight-second timeout
            -> provider-boundary mapping
            -> admin upsert of shared movies by unique tmdb_id
  -> authenticated user_movies/list operation under RLS where applicable
```

Migration `202607300001_part_15_tmdb_rate_limits.sql` creates an internal
RLS-enabled counter table with no browser policies/grants and an authenticated
`security definer` function whose search path is empty. The function derives
identity from `auth.uid()`, recognizes only four hardcoded buckets, validates
cost, and serializes counter creation/increment across server instances.

The fixed windows are:

- interactive search: 30 requests per 60 seconds;
- interactive details: 20 per 60 seconds;
- import search: 120 per 600 seconds; and
- import details: 120 per 600 seconds.

There is no unauthenticated TMDB-backed route, so no public fallback bucket is
needed. If that changes, an independently durable public limit is required.

`lib/movies/server-search.ts` deduplicates identical in-flight searches by
verified user, normalized query, adult/release settings, and language.
`lib/movies/tmdb-provider.ts` deduplicates the final identical provider URL in
one process. These maps reduce rerender/double-submit provider traffic but do
not provide authorization or a distributed request budget.

### Shared metadata caching

`public.movies` is the only persistent TMDB detail cache. Because it has one
row per `tmdb_id`, detail ingestion uses the canonical English locale instead
of a member preference. A row is reusable for 30 days only when
`metadata_updated_at` is current, `metadata_language` is `en`, `tmdb_adult` is
known, and the current member's adult preference permits it. Preferred
language remains request-scoped to search. Old rows have nullable safety
markers and therefore refresh before reuse.

Stale refreshes are authenticated, rate limited, server-only, and upsert by
unique `tmdb_id`. Identical in-flight refreshes are deduplicated per process by
user, operation, TMDB ID, adult choice, and canonical language. Cross-instance duplicate
stale refreshes may still occur; the distributed rate counter and unique upsert
are the correctness boundaries. A distributed refresh lease is deferred until
Preview metrics justify it.

Private `user_movies`, profiles, preferences, lists, exports, picker datasets,
recommendations, and Statistics results remain request/user scoped and are
never globally cached.

### CSV and export boundaries

Authentication occurs before CSV parsing/matching work. Server reconstruction
is bounded to 2 MiB, 500 non-empty rows, 100 columns, 10,000 characters per
cell, 4 MiB of validated temporary JSON, and 500 confirmation row decisions.
The Server Action transport ceiling is 6 MiB so every accepted temporary
payload fits while the narrower domain validator remains authoritative.
Matching remains capped at four
concurrent operations, while per-operation title and detail caches prevent
duplicate requests. The admin client is not constructed in the import adapter;
the authenticated metadata resolver owns the narrow shared upsert.

CSV export and failure reports share one formula-neutralization helper. CSV/JSON
Route Handlers authenticate inside the controlled boundary and return private,
no-store, no-cache, nosniff attachments, including safe error responses.

### Reliability, loading, and error recovery

- Important product routes stream through the authenticated group loading
  skeleton. Import, lists/list detail, picker, and recommendations add focused
  route loading states; Part 15.1 adds a focused Statistics loader. Long-running
  interactive forms expose pending state and prevent repeat submission.
- The app shell plus library, search, import, lists, picker,
  recommendations, Statistics, and settings have controlled error boundaries
  using `components/route-error.tsx`. Retry is offered where safe and a stable
  navigation action is always available.
- Invalid movie/list routes use route not-found boundaries; the root app has a
  controlled not-found page.
- Empty states distinguish an empty collection from filters with no matches
  and provide one relevant action. Watch Next is explicitly bounded to 500
  queue rows with an honest truncation notice.
- Queue-changing detail/schedule updates invoke one authenticated
  `watchflow_normalize_queue()` RPC instead of resequencing rows one by one.

### Image and response hardening

Movie posters and list collages use `next/image` with a single allowlisted TMDB
HTTPS path, validated fixed-size poster URLs, reserved aspect ratios,
responsive `sizes`, lazy loading by default, meaningful or deliberately empty
alt text, and runtime failure fallbacks. Small cards request `w342`; detail
contexts may request larger sources.

`next.config.ts` sends a scoped Content Security Policy, strict-origin
referrer policy, restrictive permissions policy, nosniff, and frame denial.
The CSP permits only the application, configured Supabase HTTP/WebSocket
origin, and the fixed TMDB image host for the resources they require.

### Verification boundaries

`supabase/verification/development_readiness.sql` and
`production_security_audit.sql` are read-only catalog checks. They inspect
actual objects, not migration-history rows. `scripts/scan-client-secrets.mjs`
inspects built browser chunks and rendered payloads while reporting only a path
and pattern category.

The new migration was not applied to a remote project during Part 15.
Authenticated two-user, account-deletion, delivered password-reset, database
catalog, and full protected responsive/browser validation therefore remain
Preview gates rather than passed checks.
