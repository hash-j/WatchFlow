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
