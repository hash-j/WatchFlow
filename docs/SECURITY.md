# WatchFlow Security

## Part 15.5A signup verification security

- Signup fields are validated on the server; browser validation is only UX.
- Passwords and confirmation never enter URLs, cookies, logs, action state,
  analytics, or application storage. OTPs are neither stored nor logged.
- Supabase owns OTP generation, validation, expiry, replay prevention, email
  confirmation, and session issuance.
- Pending email is a short-lived HttpOnly, `SameSite=Lax`, production-secure,
  `/auth` cookie with no password, OTP, user ID, or token. Protected access
  still requires verified Supabase claims.
- Verification accepts no user ID and uses no admin client. It requires fresh
  `getUser()` data whose confirmed email matches pending context.
- Existing-account signup behavior is neutral. Forgot password remains neutral;
  resend reports delivery only after Supabase succeeds.
- Supabase Auth is the authoritative rate limiter. WatchFlow adds a 60-second
  resend cooldown and safely maps provider 429 responses.

## Security model

WatchFlow is a private multi-user application. Supabase Auth establishes
identity, the Next.js server derives that identity, PostgreSQL RLS and
privileges enforce tenant isolation, and normal user-owned work uses the
cookie-bound authenticated Supabase client. The server-only admin client is not
an escape hatch for RLS failures.

Detailed Part 15 findings and target-verification limits are recorded in
`docs/SECURITY_AUDIT.md`. Deployment gates are recorded in
`docs/PRODUCTION_READINESS.md`.

## Identity and authorization rules

- Use verified `auth.getClaims()` for the established proxy/layout JWT
  boundary.
- Use fresh `auth.getUser()` when mutations, uploads, exports, provider
  ingestion, account data, or current Auth-server state are involved.
- Never authorize with `getSession()`.
- Never accept `user_id` from FormData, route parameters, query strings, or
  Client Component state. Derive it from the verified Auth response.
- Validate route IDs and submitted values on the server.
- Apply explicit owner filters where the operation identifies a relationship,
  and keep RLS as the final enforcement boundary.
- Treat another user's missing/foreign object like a normal not-found or stale
  selection; do not reveal whether it exists.

## Supabase clients

| Client | Location | Permitted data |
|---|---|---|
| Browser | `lib/supabase/client.ts` | Public Supabase URL and publishable/anon key only |
| Server SSR | `lib/supabase/server.ts` | Cookie-bound user-owned operations under the member JWT and RLS |
| Proxy SSR | `lib/supabase/proxy.ts` | Claims verification and complete Supabase cookie refresh/copy |
| Admin | `lib/supabase/admin.ts` | Shared `movies` metadata after verified Auth, and final deletion of that same verified Auth user |

The admin module imports `server-only`, requires a verified user ID, reads the
server-only secret name, and disables session persistence, token refresh, and
URL session detection. It must never be imported into a Client Component or a
browser-safe barrel.

## Database boundaries

User-owned tables are `profiles`, `user_movies`, `user_preferences`, `lists`,
and `list_movies`. Each requires RLS and ownership based on `auth.uid()`.
Membership policies must prove ownership of both the parent list and referenced
`user_movies` row.

`movies` is shared metadata. Authenticated members may read the intended shared
catalog, while browser clients must not write it. Trusted authenticated server
logic performs the shared upsert by unique `tmdb_id`.

`watchflow_tmdb_rate_limits` is internal. RLS is enabled, it has no policies,
and browser roles have no direct privileges. Only the authenticated,
owner-deriving limiter function is callable.

Do not disable RLS, add an unrestricted `using (true)` policy to user-owned
data, grant anonymous access, or use the admin client to hide a failed
ownership policy.

## Secrets and configuration

- `SUPABASE_SECRET_KEY` and `TMDB_READ_ACCESS_TOKEN` are server-only.
- Only the public Supabase URL/publishable key and the public app URL may enter
  browser code.
- Do not commit `.env.local`, QA passwords, storage state, cookies, downloaded
  exports, screenshots containing credentials, or access/refresh tokens.
- Never log a secret, password, authorization header, cookie, private export,
  uploaded CSV, or private row.
- Missing configuration must return a controlled configuration/unavailable
  error without printing the value.
- Run `npm run build` followed by `npm run scan:client-secrets` before every
  deployable release.

The scanner reports only a file path and pattern category. It must never echo a
matching configured value.

## TMDB

All provider calls are server-side, use the fixed HTTPS TMDB API origin, an
eight-second timeout, and provider-neutral response mapping. A database-backed
fixed-window limiter applies per authenticated user:

- search: 30 per 60 seconds;
- details: 20 per 60 seconds;
- import search: 120 per 600 seconds; and
- import details: 120 per 600 seconds.

No unauthenticated TMDB-backed endpoint currently exists. Adding one requires a
separate durable fallback limit.

Shared details use one canonical English cache row per `tmdb_id` and may be
reused from `movies` for 30 days only when their timestamp is current, the
stored locale is `en`, adult classification is known, and the member's adult
preference allows the row. Preferred-language localization remains
request-scoped to search. Private library/preferences/list data must never use
a global cache.

## Uploads and exports

CSV uploads are parsed in memory after authentication, bounded by file, row,
column, cell, and confirmation-decision limits, and never persisted or logged.
Structured browser data is untrusted and is reconstructed through server
validation before provider or database work.

Private exports:

- authenticate with the cookie-bound client;
- explicitly owner-filter and whitelist fields;
- use private no-store/no-cache/nosniff attachment headers;
- never contain raw Auth records, tokens, keys, passwords, or another user's
  data; and
- neutralize spreadsheet formula prefixes in every generated CSV, including
  failure reports.

## Destructive actions

Library deletion removes only the verified user's `user_movies` relationships
and leaves shared metadata intact. Account deletion requires the exact phrase,
an explicit checkbox, a fresh server-verified identity, and a recent trusted
sign-in before the admin client deletes that same Auth user.

Never test deletion with a developer account, QA User A, QA User B, or
production data. Use the separately gated, one-use disposable account and
verify cascades before production enablement.

## Errors and logging

User-facing errors must be stable, actionable, and free of raw Postgres,
PostgREST, provider, stack, key, or token details. Development Supabase logging
may include only a validated code and broad category. Production currently
emits none from that helper.

Browser QA diagnostics store only error categories, methods, resource types,
status codes, and redacted paths. They do not store query strings, headers,
payloads, cookies, credentials, or message contents.

## Browser defenses

Responses use a restrictive Content Security Policy, strict-origin referrer
policy, nosniff, frame denial, and disabled camera/geolocation/microphone/
payment/USB permissions. Remote images are restricted to TMDB's HTTPS image
path.

These headers are defense in depth and do not replace correct authentication,
RLS, validation, safe rendering, or dependency maintenance.

## Verification and incident handling

Before Preview or production:

1. run the repository quality and secret-scan commands;
2. apply only reviewed patch migrations in the confirmed target;
3. run both files under `supabase/verification/`;
4. exercise two-user and anonymous isolation with disposable identities;
5. verify Auth callback/reset delivery, account-deletion cascades, and shared
   movie preservation; and
6. record unexpected console/network/database behavior without sensitive
   request data.

If a leak or cross-user access is suspected, stop the affected environment,
preserve only redacted evidence, rotate the relevant server credential, revoke
sessions where appropriate, and investigate policies/grants/call sites before
restoring access. Do not conceal the symptom with the admin client or a generic
error handler.
