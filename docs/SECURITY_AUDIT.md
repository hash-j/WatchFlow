# WatchFlow Part 15 Security Audit

## Part 15.5G hosted profiles privilege-drift addendum

The hosted development audit is real evidence that authenticated has
`DELETE`, `INSERT`, `REFERENCES`, `SELECT`, `TRIGGER`, and `TRUNCATE` on
`public.profiles`. Table-level UPDATE is false because
`202607220003_user_settings.sql` revoked that one privilege and restored only
profile column UPDATE. PostgreSQL table `ALL` consists of those six privileges
plus UPDATE, so the result is an exact ALL-minus-UPDATE fingerprint.

Git history contains neither the original profile-creation DDL nor a broad
authenticated profile grant/default-privilege statement. The reconstructed
baseline was added later and explicitly revokes all browser-role table access
before granting SELECT/narrow UPDATE. Therefore the broad grant predates the
repository baseline; the unavailable legacy DDL prevents distinguishing an
explicit historical `GRANT ALL` from a historical ALL default ACL without
guessing. The versioned settings migration is the exact operation that removed
only UPDATE while leaving the six reported privileges intact.

New unapplied migration `202608290001_profiles_privilege_hardening.sql` revokes
all seven profile privileges from `PUBLIC`/`anon`, revokes authenticated INSERT,
table UPDATE, DELETE, TRUNCATE, REFERENCES, and TRIGGER, then restores
authenticated SELECT and the six intended UPDATE columns. Existing own-row RLS,
the Auth profile-creation trigger, Auth-delete cascade, service-role access, and
all application authentication behavior remain unchanged.

Readiness and production audit SQL now cover the seven table privileges for
both API roles, table-level UPDATE, and the exact column UPDATE matrix. A local
PostgreSQL 18 FROM-ZERO run applied all 11 migrations with no readiness or
security failure marker. A separate exact hosted-drift simulation produced the
reported six privileges before the new migration and only SELECT plus the six
required UPDATE columns afterward. No hosted database was changed.

## Part 15.5F blocker-remediation addendum

The exact development target pin now passes through a deterministic loader;
the guard was not removed or weakened. Live QA A/B RLS tests pass 5/5,
onboarding ownership tests pass 4/4 with restored state, and limiter security
tests pass 10/10. Guard-pinned OpenAPI confirms every final private/shared table
contract and every current application RPC. Exact hosted policy/grant/index
catalog attestation remains blocked by absent read-only database access.

The reconstructed FROM-ZERO baseline plus all later migrations executed in a
disposable PostgreSQL 18 database. Readiness verification found no missing
object and the production security SQL returned zero findings across RLS,
ownership policies, grants, RPC execution, limiter isolation, cascades,
constraints, indexes, and trigger behavior.

The previous production Nanoid finding is remediated with compatible patch
versions; current Brace Expansion/js-yaml development-tool advisories were
also patched. Production and full npm audits now report zero vulnerabilities.
No production, hosted Auth, RLS, or remote schema setting was changed. See
`docs/RELEASE_BLOCKER_REMEDIATION.md`.

## Part 15.5E release-gate addendum

Source review and the built-client secret scan continue to pass. Live database
attestation is BLOCKED because the configured Supabase URL does not exactly
match the independently pinned development URL; no remote operation was run.
The production dependency audit is FAIL: npm reports three high-severity
transitive Next/PostCSS/Nanoid findings with no available fix. See
`docs/FINAL_BETA_QA.md` for the complete release decision and evidence.

## Executive result

Part 15 implemented a repository-level audit and focused security fixes. The
application now has durable per-authenticated-user TMDB rate
limiting, safer shared-metadata caching, stricter auth and logging behavior,
private export hardening, bounded CSV processing, security headers, browser
bundle scanning, and read-only database verification scripts.

This is not a live-database attestation. The target Supabase project was not
modified or inspected with two authenticated QA users during this work. The
new migration is unapplied, the repository lacks its original base-schema
migration, and live RLS/privilege/account-cascade results remain Preview gates.

## Scope and method

The source audit covered:

- all Server Actions under `app/(app)/actions`, settings actions, and the
  server-side logout action;
- auth callback/confirmation and CSV/JSON export Route Handlers;
- Supabase browser, server, proxy, Auth-context, and admin clients;
- TMDB search, detail ingestion, import matching, provider requests, and shared
  movie upserts;
- user-owned reads and mutations for `profiles`, `user_preferences`,
  `user_movies`, `lists`, and `list_movies`;
- shared `movies` behavior and the internal Part 15 limiter table;
- every version-controlled migration, policy/grant definition, callable RPC,
  constraint, and index;
- CSV upload limits, row reconstruction, confirmation batching, and exported
  spreadsheet values;
- error boundaries, error messages, development logging, browser-visible
  environment variables, CSP/security headers, and built browser artifacts.

Source and SQL contract tests were used to prevent regression. Read-only catalog
scripts were created for target verification, but were not executed against an
unambiguously disposable development database.

## Server Action and Route Handler result

| Boundary | Authentication/input/ownership result |
|---|---|
| `app/(app)/actions/library.ts` | Validates TMDB/relationship input; the service authenticates before cache/provider/admin construction; shared upsert is admin-only and private insert remains authenticated/RLS scoped |
| `app/(app)/actions/management.ts` | Validates UUIDs and all optional numeric/date/text/timezone values; uses fresh identity and owner-filtered authenticated updates/RPCs |
| `app/(app)/actions/import.ts` | Authenticates before parse/match work; reconstructs bounded untrusted rows; matching/details are rate limited; private writes remain authenticated |
| `app/(app)/actions/lists.ts` | Zod-validates list/membership IDs and fields; derives owner through `getUser()`/`auth.uid()`; uses authenticated direct metadata operations and security-invoker ordering RPCs |
| `app/(app)/actions/discovery.ts` | Validates bounded filters/exclusions; the data adapter performs fresh Auth, explicit owner filtering, and RLS-protected reads; no admin/provider write |
| `app/(app)/settings/actions.ts` | Zod-validates profile/preferences/confirmation data; uses fresh Auth and explicit owner filters; admin is confined to final same-user Auth deletion |
| `app/auth/actions.ts` | Cookie-aware local sign-out through the server SSR client with controlled failure output |
| Auth callback/confirmation handlers | Establish a session from a validated one-time code/token; allowlist OTP type, restrict redirect destination, and emit stable reason codes |
| CSV/JSON export handlers | Authenticate inside the handler error boundary; owner-filter explicit columns; return private no-store/no-cache/nosniff attachments and safe errors |

No action or handler logs FormData, uploaded CSV content, passwords, Auth
credentials, export bodies, provider tokens, or secret keys.

## Passed source checks

### Authentication and ownership

- Protected layout/proxy checks use verified claims; user-sensitive mutations,
  imports, exports, discovery reads, and deletion boundaries use fresh
  `supabase.auth.getUser()`.
- No Server Action accepts a browser-supplied `user_id`. IDs from route or form
  input are validated and ownership remains enforced by explicit owner filters,
  `auth.uid()`-derived RPCs, and RLS.
- Auth callback destinations accept only safe internal paths. OTP types are
  allowlisted and browser-visible callback errors use stable reason codes
  instead of raw provider messages.
- `/auth/callback` and `/auth/confirm` are the deliberate exception to requiring
  a pre-existing `getUser()`: their purpose is to establish a session by
  exchanging a one-time code/token hash. They validate that credential on the
  server and never read or mutate application-owned rows before successful
  exchange.
- Logout is a cookie-aware Server Action. It no longer places the browser
  Supabase SDK in the protected application shell solely for sign-out.
- Missing/expired sessions produce controlled authentication or recovery-state
  responses instead of leaking database/provider internals.

### User-owned data

- Ordinary profile, preference, library, queue, schedule, list, export, and
  deletion operations use the cookie-bound authenticated client.
- Direct relationship updates filter by both the validated relationship UUID
  and verified user UUID. Security-invoker functions derive ownership from
  `auth.uid()` and accept no user-ID parameter.
- Individual and bulk library removal delete `user_movies` relationships only.
  Shared `movies` metadata is never deleted by those workflows.
- List membership references `user_movies.id`; RLS must establish ownership of
  both the parent list and relationship.
- Export queries explicitly owner-filter private tables and whitelist returned
  columns.

### Admin-client boundary

- `lib/supabase/admin.ts` imports `server-only`.
- It reads only the canonical server-only Supabase secret name and refuses to
  construct without a previously verified user ID.
- Session persistence, token auto-refresh, and URL session detection are
  disabled.
- Static import review found no Client Component or client-safe barrel that
  exports the admin factory.
- Approved call sites are limited to shared `movies` metadata lookup/upsert and
  final Auth deletion of the same freshly verified user.

### TMDB and secrets

- The TMDB adapter is server-only, reads the token only at request time, uses an
  eight-second abort timeout, sends a Bearer header only to the fixed TMDB API
  origin, and maps responses into internal types.
- Browser requests never submit provider tokens or call TMDB directly.
- Only browser-safe public Supabase variables are consumed by Client
  Components. Browser configuration failures map to controlled UI messages.
- The build-artifact scanner checks browser chunks and rendered payloads for
  server-only variable names, configured secret values, service-role/secret
  markers, and secret-shaped keys without printing a matching secret.
- Development database logging records only a validated error code and broad
  category. It drops raw message, detail, hint, row data, and credentials, and
  produces no production log.

Final scan result: 462 artifacts checked with no forbidden-pattern or
configured-value leak. `.next/static/chunks/14n1mmud9ycm_.js` contains the
Supabase SDK's `sb_secret_` sentinel category; review confirmed that no
configured secret value is present.

### Uploads and exports

- CSV parsing occurs in memory after authentication. Files are restricted to
  approved CSV MIME/extension behavior, 2 MiB, 500 non-empty rows, 100
  reconstructed columns, and 10,000 characters per cell.
- Import confirmation accepts at most 500 row decisions, validates the
  submitted structure again, bounds provider concurrency, and never persists
  the upload.
- CSV exports and import failure reports use the shared formula-neutralization
  boundary. Values beginning with spreadsheet formula characters, including
  after whitespace, receive a protective apostrophe.
- CSV and JSON Route Handlers authenticate inside their controlled error
  boundary and set private, no-store, no-cache, nosniff attachment responses,
  including on error.
- JSON export format version 2 adds owned custom lists and memberships without
  exposing internal relationship/list UUIDs, raw `auth.users` rows, tokens, or
  keys.

### Browser and response hardening

- The application sends a scoped Content Security Policy, a TMDB-only remote
  image rule, strict-origin referrer policy, a restrictive permissions policy,
  nosniff, and frame denial.
- Error boundaries display controlled copy, a safe retry action, and stable
  navigation. Invalid movie/list routes use nonrevealing not-found handling.
- `next/image` validates TMDB poster paths, reserves aspect ratio, supplies
  `sizes`, and falls back after missing or failed remote images.

## Database and RLS audit

### Expected data scopes

| Table | Scope | Required target behavior |
|---|---|---|
| `profiles` | User-owned | RLS; own SELECT/UPDATE; no anonymous access |
| `user_movies` | User-owned | RLS; own SELECT/INSERT/UPDATE/DELETE; unique `(user_id, movie_id)` |
| `user_preferences` | User-owned | RLS; own SELECT/INSERT/UPDATE; no normal DELETE |
| `lists` | User-owned | RLS; own private SELECT/INSERT/UPDATE/DELETE |
| `list_movies` | User-owned through both parents | RLS; all operations prove owned list and owned `user_movies` row |
| `movies` | Shared metadata | Authenticated read as intended; no normal browser write; admin-only application upsert |
| `watchflow_tmdb_rate_limits` | Internal | RLS enabled, no policies, no direct `anon`/`authenticated` table privileges; authenticated RPC only |

Version-controlled SQL shows ownership checks for preferences, lists,
memberships, Part 12/13 RPCs, and the new limiter architecture. It does not
contain the original creation SQL for `profiles`, `movies`, or `user_movies`,
so their deployed policies, base grants, and Auth delete cascades cannot be
certified from this repository.

`supabase/verification/production_security_audit.sql` reports table/RLS state,
every policy, required operations, effective and raw privileges for
`authenticated`/`anon`, limiter function/table exposure, and concise findings
for missing ownership or unrestricted-true predicates.

`supabase/verification/development_readiness.sql` reports required tables,
columns, RLS/policies, functions and execute grants, constraints, foreign-key
cascades, indexes, triggers, profile/preference backfill gaps, schedule/favourite
objects, queue normalization, and Part 13 list objects as `INSTALLED` or
`MISSING`. It treats database objects, not migration-history entries, as the
source of truth.

Neither script mutates schema or data.

## TMDB rate limiting

Migration `202607300001_part_15_tmdb_rate_limits.sql` adds a PostgreSQL-backed,
fixed-window limiter keyed by the authenticated Auth user and hardcoded
operation. The `security definer` function has an empty search path, derives the
caller from `auth.uid()`, validates cost, serializes first-use and increment
with advisory/row locks, and exposes no counter table access to browser roles.

| Operation | Allowance | Window |
|---|---:|---:|
| Interactive movie search | 30 requests | 60 seconds |
| Interactive details/ingestion | 20 requests | 60 seconds |
| CSV matching search | 120 requests | 600 seconds |
| CSV details/confirmation | 120 requests | 600 seconds |

All current TMDB-backed routes require authentication, so no unauthenticated
public provider endpoint needs a fallback bucket. If one is introduced, it
must receive a separately designed durable limit before release.

The limiter is shared across server instances once the migration is applied.
Missing/malformed limiter responses fail closed with a controlled
configuration/unavailable message. Provider 429 responses preserve a safe
retry duration without exposing provider internals.

## Shared metadata cache

`public.movies` is the persistent cache for shared TMDB details. Part 15 uses
one canonical English row per `tmdb_id` and adds nullable `tmdb_adult` and
`metadata_language` markers so old or adult-incompatible rows are never
incorrectly treated as fresh. An authenticated
server request may reuse a row only when:

- `metadata_updated_at` is valid, not in the future, and no more than 30 days
  old;
- the stored metadata language is the canonical value `en`;
- the TMDB adult classification is known; and
- adult metadata is not returned when the member disallows adult results.

Stale or unsafe rows consume the user's detail allowance, refresh through the
server-only provider, and upsert by unique `tmdb_id`. Per-process in-flight
maps deduplicate identical simultaneous search and metadata requests. Database
rate counters and uniqueness constraints remain the cross-instance safety
boundaries; in-flight maps are an optimization, not authorization or global
locking. Private `user_movies`, preferences, lists, and exports are never
placed in a shared persistent cache.

The migration also clears table- and column-level browser write grants on
`movies`, grants authenticated SELECT only, and replaces movie-management and
scheduling RPCs so their owner-scoped mutation and queue normalization share
one transaction.

## Weaknesses discovered and fixes

| Finding | Risk | Part 15 response |
|---|---|---|
| No durable TMDB request budget | Provider exhaustion and uneven multi-instance behavior | Added authenticated PostgreSQL fixed-window limiter and friendly 429 handling |
| Complete TMDB details could be fetched repeatedly | Provider load and latency | Added a 30-day canonical-English shared cache with adult-safety markers and in-flight deduplication |
| Shared cache locale followed each user's search preference | Cross-user cache churn and preference-derived shared state | Fixed detail ingestion to canonical English; preferred language remains search-only |
| Queue normalization could fail after a direct status/schedule update committed | Misleading failure and gapped ordering | Replaced management/schedule RPCs transactionally and routed application mutations through them |
| QA loopback URL did not prove the Supabase backend was disposable | Destructive tests could target the wrong project | Added an exact expected-project URL pin and disallowed unknown server reuse for credentialed runs |
| ASCII-only CSV title normalization collapsed Urdu titles | Wrong request deduplication and match selection | Preserved Unicode letters/numbers and added distinct-Urdu-title regression coverage |
| `scheduled` was permitted as a default without an instant/timezone | Invalid schedule-less records | Migration repairs existing defaults and narrows preference choices to six unscheduled statuses |
| CSV mapped `scheduled` without schedule fields | Invalid schedule-less imported records | Treat `scheduled` as an unknown import status requiring explicit safe fallback |
| Import work could begin before Auth and submitted structures were too permissive | Avoidable CPU/provider load and oversized confirmation input | Authenticate before parsing/matching, cap rows/columns/cells/IDs, and revalidate at boundaries |
| A valid CSV could expand beyond the Server Action transport ceiling after JSON escaping | Framework 413 before friendly validation | Validate the 4 MiB temporary payload during upload and use a 6 MiB transport ceiling |
| Import failure CSV lacked the export formula boundary | Spreadsheet formula execution when opened | Reused centralized formula neutralization |
| Raw Supabase message/detail/hint were logged in development | Private schema/data disclosure in logs | Log only validated code/category |
| Auth client construction/network errors could surface as `Failed to fetch` | Confusing configuration leak and weak UX | Added safe browser configuration validation and controlled auth messages |
| Callback error text was provider-derived | Provider detail leakage and unstable URLs | Added allowlisted OTP types and stable reason codes |
| Browser-side logout loaded the Supabase SDK in the protected shell | Larger bundle and cookie/logout fragility | Replaced with a cookie-aware Server Action |
| Detail schedule edits omitted timezone/note and could use the profile zone | Incorrect scheduled data | Persist saved timezone/note and prefer the item's saved zone |
| Queue normalization performed repeated updates | Reliability/performance issue | Use one authenticated normalization RPC after relevant changes |
| Watch Next loaded an unbounded private library | Oversized payload | Query only queue rows, sort in PostgreSQL, and bound output to 500 with an honest truncation message |
| JSON account export omitted custom lists | Incomplete portability | Added private list/membership data and bumped format version to 2 |
| Security headers were absent | Weaker browser defense in depth | Added CSP, referrer, permissions, nosniff, and frame headers |
| Several route failures relied only on a parent boundary | Less specific recovery | Added controlled route boundaries plus shared retry/navigation UI |

## Deferred risks and production blockers

- Apply and verify all required migrations against a confirmed development
  Supabase project. The Part 15 migration was created but not remotely applied.
- Run both catalog scripts and investigate every non-installed or review result.
- Use two disposable users to prove cross-user SELECT/INSERT/UPDATE/DELETE and
  RPC behavior. Source SQL alone is insufficient.
- Verify `profiles` and `user_movies` Auth foreign-key cascades before enabling
  account deletion outside QA. Run the one-use deletion suite and inspect
  database preservation/cascade results.
- Verify signup confirmation, password-reset email delivery, delivered/expired
  link behavior, SMTP/templates, and redirect allowlists with a QA mailbox.
- The app has no configured centralized monitoring, alerting, audit pipeline,
  or production log review process. Current safe logging is intentionally
  minimal.
- Legal/privacy/terms pages, TMDB attribution, and licensing review are absent.
- Production Supabase/Vercel environment separation, backups/PITR, domain,
  redirect, and incident-response procedures are unverified.
- The base schema is not fully version controlled. Create a reviewed baseline
  schema strategy before treating migrations as a complete recovery source.
- In-flight request deduplication is process-local. Cross-instance simultaneous
  stale metadata refreshes may both reach TMDB, although the durable per-user
  counter and unique upsert preserve safety. A distributed refresh lease is a
  possible future optimization if metrics justify it.
- The recorded production-only and full npm audits both report zero
  vulnerabilities after aligning Next/ESLint and selecting patched transitive
  versions. Continue routine review and never use a forced automated fix
  without inspecting its framework/tooling changes.

## Production blocker decision

No source finding in this audit justifies disabling RLS, bypassing a
user-owned operation with the admin client, weakening validation, or applying
an unsafe package downgrade. Part 15 can proceed to Preview verification after
the new migration and scripts are reviewed, but WatchFlow is not ready for a
public production launch until the live Auth/RLS/deletion, operational,
licensing, legal, and environment blockers above are resolved.
