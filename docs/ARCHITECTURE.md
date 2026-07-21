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
user ID. Supabase RLS remains the final authorization layer. No admin or
service-role client exists in Phase 1.

## Error and loading behavior

- Auth forms show pending and recoverable error states inline.
- Invalid or expired callback links route to `/auth/error`.
- The authenticated route group has a streaming loading skeleton.
- Its error boundary provides a retry action without displaying backend error
  details.

## Future integration boundaries

Phase 2 may add a server-only TMDB adapter and movie ingestion workflow. Billing
is not designed or implemented. Neither concern belongs in the Phase 1 auth or
Supabase client modules.
