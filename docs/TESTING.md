# WatchFlow Testing Guide

## Part 15.5C discoverability coverage

`lib/ux/discoverability.test.ts` protects the grouped desktop/mobile
information architecture, group semantics, canonical route names, current
route semantics, page titles/purpose statements, Watch Next/List distinction,
Picker Library scope, Library status guide, progressive disclosures, key
empty-state destinations, destructive hierarchy, contextual back links,
accessible reorder/favourite controls, Settings categories, and the absence of
known implementation phrases in product copy. Existing list, discovery,
Statistics, auth, and Library source contracts were updated only where the
canonical user-facing terminology changed.

`e2e/discoverability.spec.ts` is a guarded, read-only authenticated suite. It
checks the same navigation group order on desktop and mobile, active-route
semantics, major page purposes, the configured lighter account's available
empty states, canonical terminology, and developer-term exclusion. It uses the
existing in-memory QA fixtures, strict redacted browser diagnostics, and no
data mutation or stored auth state.

`e2e/responsive-authenticated.spec.ts` retains the protected route matrix at
320×568, 360×640, 375×667, 390×844, 412×915, 600×960, 768×1024, 820×1180,
1024×768, 1366×768, 1440×900, and 1920×1080. Its drawer assertions now use the
canonical Library label. The milestone's required subset is documented in
`docs/DISCOVERABILITY_UX_AUDIT.md`.

Pre-edit authenticated HTTP rendering against the running app and pinned
development backend returned 200 for every protected static route with both QA
accounts, plus accessible owned movie/list detail where data existed. Final
local evidence: the focused suite passed 4 files/53 tests and the complete
runner-loader suite passed 69 files/707 tests. The required `npm test` entry
point hit Windows `spawn EPERM` before config load on two attempts.

The guarded discoverability suite loaded four cases and the responsive suite
loaded 17, but both hit `spawn EPERM` before a worker on two attempts; direct
Chrome startup also returned access denied. These are environment blocks, not
passing browser evidence. Lint, direct TypeScript, the final 260-artifact
secret scan, and `/auth/sign-up` HTTP 200 verification passed. Next's production code
compilation succeeded twice, then its TypeScript child hit `spawn EPERM`.

**Current milestone:** Part 15.5C - App Discoverability & User Friendliness.
**Next milestone:** Part 15.5D - Final Visual/UI Polish.

## Part 15.5B onboarding coverage

Focused tests in `lib/onboarding/` cover incomplete, completed, skipped, and
legacy compatibility states; authenticated/verified route decisions; profile
completion ownership; validation of steps, statuses, timezone, default Library
view, and language; preference persistence; zero/one/multiple-movie completion;
Want to Watch and Watched additions; duplicate-safe handling; preservation on
Skip; safe error mapping; no browser `user_id`; the existing TMDB search
service/rate limiter boundary; and the migration's column, backfill, RLS, and
narrow-grant contracts. Auth tests cover conditional post-OTP routing, while
proxy tests cover anonymous `/onboarding` protection.

`integration/onboarding.integration.test.ts` is separately enabled with
`RUN_ONBOARDING_INTEGRATION_TESTS=true`. Against a pinned development project
and disposable QA Users A/B, it verifies the installed column, established-user
backfill assumption, owned timestamp mutation, other-user isolation, and anon
denial, then restores both QA completion values. It does not use a service-role
client or production target.

`e2e/onboarding.spec.ts` uses the established authenticated fixture and a
normal public Supabase client signed in as each QA user to control only that
user's completion timestamp. It covers Welcome, preference save, refresh at
step 3, zero-movie finish, controlled TMDB searches, Want to Watch and Watched
adds, Library presence, logout/login persistence, completed-route redirect,
Skip preservation, two-user independence, diagnostics, and all requested
mobile/tablet/desktop viewports. Search cases need the controlled
`E2E_ONBOARDING_MOVIE_QUERY_A` and `E2E_ONBOARDING_MOVIE_QUERY_B` values.

The repository cannot prove the fresh-account OTP-to-onboarding flow without a
disposable mailbox and hosted Auth settings. If those are absent, that exact
case remains blocked even when the already-verified QA flow passes.

Local evidence from 2026-08-17: focused onboarding/auth tests passed 8 files/75
tests; direct TypeScript and lint passed; and the full runner-loader Vitest
fallback passed 68 files/688 tests. The required `npm test` command encountered
`spawn EPERM` before config load twice. The four onboarding integration tests
and four onboarding Playwright cases loaded but were guarded/skipped without
authorized disposable development configuration. Responsive Playwright hit
`spawn EPERM` twice before a browser worker. The final post-attempt
client-secret scan passed 260 artifacts; Next compiled successfully twice but
its TypeScript child could not spawn, so the build remains
environment-blocked.

**Current milestone:** Part 15.5B - First-Time User Onboarding.
**Next milestone:** Part 15.5C - App Discoverability & User Friendliness.

## Part 15.5A authentication coverage

Focused `lib/auth/` tests cover signup validation, email normalization,
confirmation mismatch, pending cookie/expiry, six-digit and numeric OTP rules,
paste normalization, signup pending success, missing pending state, verify
success/incorrect/expired/rate-limit outcomes, resend success/rate limiting,
change-email cleanup, ignored browser `user_id`, no sensitive logging,
password-login/recovery preservation, and `/auth/sign-up` availability.

`e2e/authentication.spec.ts` covers refreshed auth pages, server validation,
keyboard order, missing verification recovery, six OTP positions, sequential
entry, whole-code paste, and resend countdown. `e2e/responsive.spec.ts` includes
`/auth/verify-email` across the required mobile/tablet/desktop sizes plus the
existing expanded width set.

Real signup, delivered OTP verification, session persistence, confirmed login,
logout, newest recovery email, and password update require a pinned disposable
development project and inbox. When absent they are blocked, not passed.

Current 2026-08-15 local evidence: focused auth passed 5 files/42 tests; lint
and direct TypeScript passed; the full supported fallback
`npx vitest run --configLoader runner` passed 62 files/637 tests. The required
`npm test` command hit environment-level Windows `spawn EPERM` before config
load on two sequential attempts. The auth Playwright file loads/lists all 10
tests, but two sequential execution attempts hit `spawn EPERM` before starting
the managed server/browser. These are runner blocks, not passing test runs.

## Purpose

This document describes the Part 15 test architecture, the committed Part 15.1
Statistics extension, and the evidence required before Preview sign-off. It
deliberately separates repository tests from tests
that exercise a real development Supabase project. A passing mocked test does
not establish that a migration, RLS policy, grant, Auth redirect, or email
template is installed in a target project.

Never point mutating QA at production or a developer's primary account. Never
commit credentials, cookies, browser storage state, downloaded private
exports, traces containing passwords, or Supabase access/refresh tokens.

## Test layers

| Layer | Command or path | Data source | Mutation | What it proves |
|---|---|---|---|---|
| Unit and source-contract | `npm test` / `lib/**/*.test.ts` | Pure fixtures and mocked adapters | None outside process memory | Parsing, validation, mapping, rule behavior, action orchestration, safe errors, source boundaries, and migration SQL contracts |
| Integration | `npm run test:integration` / `integration/**/*.integration.test.ts` | Development Supabase when explicitly enabled | Baseline RLS suite is read-only apart from Auth; the separately opted-in limiter suite mutates only disposable QA counter rows | Two-user/anonymous RLS plus live limiter contracts, operation/user isolation, expiry, and concurrency when their distinct guards are satisfied |
| Database catalog verification | `supabase/verification/*.sql` | Manually selected development or Preview database | None | Installed objects, columns, RLS, policies, grants, functions, constraints, indexes, triggers, and backfill gaps |
| Public/regression E2E | `npm run test:e2e` | Local application; public routes | Local form state only, except the invalid-provider-login case when the development guard is enabled | Auth route existence, callback failure handling, logged-out protection, keyboard order, responsive sign-up layout, and the `/auth/sign-up` non-404 regression |
| Authenticated E2E | Guarded Playwright suites | Loopback app connected to a confirmed development Supabase project | Controlled QA movie/list/preferences data, followed by targeted cleanup | Authenticated route smoke, controlled search/add/remove, in-memory CSV upload, and two-user list isolation |
| Account-deletion E2E | Separately guarded Playwright suite | Dedicated disposable development Auth account | Destructive and intentionally one-shot | Account deletion UI, logout, rejected re-login, and preservation of QA User A |
| Browser diagnostics | `e2e/helpers/diagnostics.ts` | Playwright page events | None | Redacted console warnings/errors, page errors, failed requests, and HTTP responses at or above 400 |
| Client secret scan | `npm run scan:client-secrets` after `npm run build` | `.next/static` and rendered App Router payloads | None | Forbidden server-variable names, configured secret values, and secret-shaped values are absent from browser artifacts |
| Production build | `npm run build` | Local production build | Build artifacts only | App Router compilation, server/client boundaries, route generation, image configuration, and production bundling |

## Responsive browser coverage

The responsive milestone adds `e2e/helpers/responsive.ts`, which checks page
`scrollWidth` against `clientWidth`, reports visible elements outside viewport
bounds, verifies form/card/dialog containment, and permits horizontal scrolling
only below an ancestor marked `data-horizontal-scroll="approved"`.

- `e2e/responsive.spec.ts` exercises `/`, login, signup, forgot/update/reset
  password, and the auth error state at 320x568, 360x640, 375x667, 390x844,
  412x915, 600x960, 768x1024, 820x1180, 1024x768, 1280x720, 1366x768,
  1440x900, and 1920x1080.
- `e2e/responsive-authenticated.spec.ts` uses the existing guarded QA fixture
  for all protected static routes at the required mobile/tablet widths and
  1366/1440/1920 desktop widths. It additionally checks drawer Escape/focus
  return and route close, Library filters and bulk actions at 320px, shared
  dialogs at 320x568, and owned movie/list/Add Movies layouts.
- The QA fixture begins route-level browser diagnostics after login so an
  intentional cancelled Next.js prefetch during the auth redirect is not
  misclassified as an application failure. All subsequent console, page,
  network, and HTTP diagnostics remain strict.

See `docs/RESPONSIVE_UX_AUDIT.md` for the route inventory, visual evidence,
root causes, and remaining manual-device limitations.

## Environment-variable names

Keep values in an ignored local environment file or the invoking process. The
committed `.env.example` contains names only for QA secrets.

### Application and local build

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `TMDB_READ_ACCESS_TOKEN`
- `NEXT_PUBLIC_APP_URL`

Only the two `NEXT_PUBLIC_*` Supabase values and the public application URL may
be exposed to browser code. The Supabase secret and TMDB token are server-only.

### Playwright

- `E2E_BASE_URL`
- `E2E_WEB_SERVER_COMMAND`
- `PLAYWRIGHT_BASE_URL` (legacy-compatible fallback)
- `E2E_TARGET_ENV`
- `E2E_EXPECTED_SUPABASE_URL`
- `E2E_USER_A_EMAIL`
- `E2E_USER_A_PASSWORD`
- `E2E_USER_B_EMAIL`
- `E2E_USER_B_PASSWORD`
- `E2E_DELETE_ACCOUNT_EMAIL`
- `E2E_DELETE_ACCOUNT_PASSWORD`
- `E2E_RUN_ACCOUNT_DELETION`
- `E2E_TEST_MOVIE_QUERY`
- `E2E_ONBOARDING_MOVIE_QUERY_A`
- `E2E_ONBOARDING_MOVIE_QUERY_B`
- `RUN_TMDB_RATE_LIMIT_E2E`
- `E2E_RATE_LIMIT_UI_BUCKETS_ARE_FRESH`

### Supabase integration suite

- `RUN_SUPABASE_INTEGRATION_TESTS`
- `RUN_TMDB_RATE_LIMIT_INTEGRATION_TESTS`
- `RUN_ONBOARDING_INTEGRATION_TESTS`
- `E2E_RATE_LIMIT_BUCKETS_ARE_FRESH`
- `E2E_TARGET_ENV`
- `E2E_EXPECTED_SUPABASE_URL`
- the two public Supabase names
- `SUPABASE_SECRET_KEY` for exact read-only QA-row diagnostics
- QA User A and QA User B email/password names

No actual value belongs in documentation, screenshots, reports, committed Auth
state, or test attachments.

## Safety gates

Authenticated Playwright tests run only when:

1. `E2E_TARGET_ENV` is exactly `development`;
2. the application base URL is loopback (`localhost`, `127.0.0.1`, or IPv6
   loopback);
3. `NEXT_PUBLIC_SUPABASE_URL` exactly matches the explicitly configured
   `E2E_EXPECTED_SUPABASE_URL`; and
4. both QA accounts are configured.

When that project pin is satisfied, Playwright does not reuse an unknown
process already listening on the loopback port by default. A test operator may
set `E2E_REUSE_VERIFIED_DEVELOPMENT_SERVER=true` only after a read-only runtime
check confirms that the existing workspace server's CSP contains the exact
pinned development Supabase HTTPS and WebSocket origins.

The account-deletion suite adds two more requirements:

1. `E2E_RUN_ACCOUNT_DELETION` is exactly `true`; and
2. the disposable account email must differ from both QA User A and QA User B.

The read-only Supabase integration suite is independently disabled unless
`RUN_SUPABASE_INTEGRATION_TESTS` is exactly `true`,
`E2E_TARGET_ENV` is exactly `development`, both QA accounts are configured,
the public Supabase variables are present, and
`E2E_EXPECTED_SUPABASE_URL` exactly matches `NEXT_PUBLIC_SUPABASE_URL`. It does
not use the application base URL, so the operator must still verify the pinned
project is disposable development infrastructure, never production.

The live limiter suites have additional, separate opt-ins because they consume
real allowances:

- `integration/rate-limit.integration.test.ts` requires
  `RUN_TMDB_RATE_LIMIT_INTEGRATION_TESTS=true` and
  `E2E_RATE_LIMIT_BUCKETS_ARE_FRESH=true`. Limiter calls always use ordinary
  authenticated QA clients and pass only `p_operation` and `p_cost`. The
  secret-key client is limited to exact, read-only QA-row diagnostics and never
  invokes the RPC or performs cleanup.
- `e2e/tmdb-rate-limit.spec.ts` requires `RUN_TMDB_RATE_LIMIT_E2E=true` and
  `E2E_RATE_LIMIT_UI_BUCKETS_ARE_FRESH=true`. It performs sequential unique
  searches through the local UI, disables traces/video, checks one request per
  submit, verifies QA User B isolation, and waits only for the reported retry
  duration plus a small buffer.

Before either opt-in is set, run both read-only SQL verification reports in the
confirmed development project and inspect the live limiter object, ACL, RLS,
primary key, and constraints. Do not run the RPC and UI suites back-to-back on
the same QA search buckets unless the first suite's reported 60-second window
has naturally expired. The harnesses never delete limiter rows; fixed windows
expire naturally, while the disposable QA counter rows remain for later
read-only review.

## Playwright structure

The Playwright configuration accepts an explicit base URL and web-server
command, writes artifacts under ignored `qa-artifacts/`, and uses semantic
selectors. The main files are:

- `e2e/fixtures/qa.ts`: isolated in-memory browser contexts for QA Users A and
  B and the deletion account. Auth state is never serialized.
- `e2e/helpers/auth.ts`: login, logout, and rejected-login helpers.
- `e2e/helpers/movies.ts`: controlled search/add/remove with cleanup only when
  the test created the relationship.
- `e2e/helpers/lists.ts`: uniquely named list creation and targeted deletion.
- `e2e/helpers/csv.ts`: small CSV fixtures generated in memory.
- `e2e/helpers/assertions.ts`: mutation-aware waits and accessible success/error
  assertions.
- `e2e/helpers/diagnostics.ts`: safe browser console/network collection. URLs
  lose query strings and identifier-like path segments are redacted; request
  headers, bodies, cookies, credentials, and tokens are never recorded.
- `e2e/helpers/environment.ts`: development, credential, and destructive-suite
  guards.
- `e2e/statistics.spec.ts`: Part 15.1 public route existence/protection plus a
  guarded authenticated personal-statistics, revalidation, isolation, empty-
  state, mobile, and safe-diagnostics flow.
- `e2e/tmdb-rate-limit.spec.ts`: separately opted-in real-search exhaustion,
  duplicate-submit, two-user isolation, safe denial, and natural-expiry flow.

The authenticated and account-deletion specs disable traces and video because
real passwords are present during login. Default screenshots are failure-only;
any retained artifact must be inspected before sharing.

## Test-data lifecycle

- Public specs create no accounts or database rows.
- The authenticated smoke suite searches for the controlled movie named by
  `E2E_TEST_MOVIE_QUERY`, records whether the current test created the private
  relationship, and removes only a relationship it created.
- The CSV smoke test uploads a generated, bounded fixture and stops before the
  confirmation/write step.
- The isolation suite creates a randomly suffixed list for QA User A, verifies
  QA User B cannot discover or open it, and deletes only that list.
- The account-deletion suite uses the dedicated account, creates controlled
  preferences, a movie relationship, and a uniquely named list, then invokes
  permanent account deletion. It cleans up temporary QA User A data
  independently. Because deletion is one-shot, the account must be reprovisioned
  for a later run.
- No automated test uses a member's original full CSV. CSV contents are
  processed in memory and are not persisted by the application.
- The limiter integration suite sends no TMDB traffic. Its valid RPC calls
  change only the four fixed operation buckets for disposable QA Users A/B.
- The limiter Playwright suite sends real sequential search traffic only; it
  never performs 120 provider calls for either import bucket.

Cleanup is best effort after a failed browser mutation. A failed cleanup must
be reviewed manually using only the disposable QA identities; do not broaden a
delete to make cleanup easier.

## Current coverage

### Authentication and route regressions

The public suite covers page headings/labels, `/auth/sign-up` returning 200,
the email-confirmation instruction state, mismatched-password validation,
required recovery email validation, controlled callback/confirmation failure,
external `next` rejection, keyboard order, recovery-session guards, and
logged-out redirects for all protected prefixes. A real invalid-password
provider request runs only against the explicitly authorized development
target and asserts that the UI does not fall back to configuration-related
`Failed to fetch` text.

Valid signup, duplicate signup, unconfirmed-account login, valid login/logout,
session refresh, confirmation-email delivery, a delivered password-reset link,
expired delivered links, and redirect-template behavior require the confirmed
development Auth project and QA mailbox. They are not established by the
public suite.

### Product workflows

Repository unit/source tests cover the implemented library, detail, queue,
schedule, import, settings, exports, lists, picker, recommendations, rate
limiting, caching, image URLs, and safe error paths. Part 15.1 adds focused
Statistics calculation, normalization, formatting, authenticated-query,
safe-error, route, navigation, protection, and rendered-UI contracts; their
final execution result is not recorded until the current milestone gate
completes. The guarded browser suite
provides only a compact authenticated smoke and list-isolation check; it is not
the exhaustive mutation matrix requested for Preview.

Still requiring live authenticated Playwright coverage:

- library filters, sorting, pagination/page clamping, favourites, detail-field
  edits, bulk status/removal, and another-user identifiers;
- queue movement/compaction and concurrent append behavior;
- local-to-UTC schedule conversion in multiple timezones and schedule grouping;
- the complete CSV match/review/confirm/result matrix;
- settings persistence, private CSV/JSON download inspection, full list
  membership/reordering, picker combinations, and recommendation integrations;
- controlled Statistics counts/distributions/timeline/movie links,
  mutation-driven revalidation, empty/no-watched states, and QA A/B isolation;
- account-delete cascades and direct database confirmation that shared movies
  remain; and
- protected mobile/tablet layouts, dialogs, focus restoration, Statistics
  visualizations, and the requested authenticated screenshot catalogue.

Part 15.1 now provides `/statistics` under the already protected prefix. Public
route/protection tests must establish that it no longer returns the WatchFlow
404 and still redirects anonymous visitors to `/auth/login`. Authenticated
metrics and cross-user behavior remain guarded and must be reported as blocked,
not passed, when disposable QA credentials or controlled library fixtures are
unavailable.

### Part 15.1 Statistics coverage

The focused source suite is expected to cover empty and no-watched libraries;
all ten summary metrics; null/boundary/invalid ratings and runtimes; current
month/year grouping; known and unknown statuses; string/object/malformed and
duplicate genres; top-eight sorting; zero-filled 12-month timelines; five
rating buckets; top-rated and recent-watched stable ordering; timezone period
selection; the explicit owner-filter query contract; safe error mapping; and
server-only/no-admin/no-user-ID source boundaries.

Route and presentation contracts cover the three route files, authenticated
navigation without duplicates, protection, login redirect, sign-up stability,
empty/rating-empty states, summary/status/genre/timeline rendering, safe error
copy, existing navigation preservation, semantic headings, screen-reader chart
summaries, and no color-only values. `e2e/statistics.spec.ts` is guarded by the
same development-project pin and in-memory QA contexts as other authenticated
suites. It may inspect existing controlled QA data but must not expose private
row values in diagnostics or broaden cleanup/deletion behavior.

## Database and RLS verification

Run these scripts manually in the intended non-production Supabase SQL Editor:

1. `supabase/verification/development_readiness.sql`
2. `supabase/verification/production_security_audit.sql`

Both are read-only and inspect actual database objects instead of trusting
migration-history rows. Review every `MISSING` or `REVIEW_*` status and every
unrestricted-true-policy finding in the concise security-audit result. The
scripts do not change policies, grants, data, or schema.

The Vitest migration tests verify that these files remain read-only and that
the Part 15 migration contains its expected protections. They do not execute
PostgreSQL or prove target state.

## Recommended verification sequence

```text
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
npm run scan:client-secrets
npm run test:e2e
```

Run `npx tsc --noEmit` as the direct required TypeScript check when recording a
milestone result. Run the SQL verification scripts separately against the
confirmed development target after applying the reviewed migration sequence.

For the final Preview gate:

1. start from a clean production build and loopback production server;
2. use a new browser context with no stored cookies;
3. run public auth and route regressions;
4. enable authenticated tests only after confirming two disposable QA users
   and the development target;
5. run the destructive suite only after provisioning its third, one-use
   account;
6. inspect the redacted console/network attachments and failure screenshots;
7. restart the server and repeat the critical clean-context smoke; and
8. record failures and skipped/blocked coverage exactly as observed.

## Latest recorded Part 15 evidence

Final recorded local Part 15 results:

- lint and direct TypeScript checks completed successfully;
- the full Vitest run completed with 55 files and 534 passing tests;
- the integration command exited successfully with all five tests skipped
  because the explicit development/credential guard was not satisfied; this is
  not live RLS evidence;
- the production build completed successfully on Next.js 16.2.12 and completed
  its 34-page generation step; its route tree confirmed `/statistics` is
  absent;
- both the production-only and full npm dependency audits completed with zero
  vulnerabilities after aligning the Next/ESLint toolchain and selecting the
  patched transitive versions;
- the built-artifact secret scan checked 462 files and found no forbidden
  pattern category or configured secret-value leak; it reported one known
  Supabase SDK secret-prefix sentinel in
  `.next/static/chunks/14n1mmud9ycm_.js` for review, not a configured secret;
  and
- the final recorded repository Playwright run completed with 35 passing and
  six guarded/skipped tests, with automatic redacted console/network
  assertions; the clean-restart Playwright MCP public smoke also passed. Those
  skips represent live authenticated and destructive coverage, not passing
  workflows.

## Current Part 15.1 verification status

The `/statistics` route/module/navigation implementation is committed at
`0c05fc8`. Final local evidence from 2026-08-02:

- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npx vitest run lib/statistics`: 4 files and 62 tests passed.
- `npm test`: 59 files and 596 tests passed.
- safe Playwright selection (Statistics, protection, authentication,
  responsive, authenticated smoke, and isolation; account deletion excluded):
  35 passed and 15 guarded/skipped. All 10 authenticated Statistics cases were
  skipped because `E2E_TARGET_ENV=development` and disposable QA credentials
  were unavailable. Logged-out `/statistics` protection and canonical public
  `/auth/sign-up` passed.
- `npm run build`: passed on Next.js 16.2.12, generated 35 static shells, and
  listed `◐ /statistics` with private data behind the request-time boundary.
- `npm run scan:client-secrets`: passed after the build; 478 browser artifact
  files were checked with no forbidden pattern category or configured-secret
  leak.

Credentialed QA A/B metrics, revalidation, data isolation, populated/empty
states, and Statistics viewport behavior remain blocked rather than passed.
The historical Part 15 evidence remains tied to commit `f6b15d4`.

## Current Part 15 limiter verification status

Local evidence from 2026-08-04:

- `npm run lint` and `npx tsc --noEmit` passed.
- Seven focused limiter/search/cache/import files passed 65 tests; `npm test`
  passed 59 files and 611 tests.
- The explicit development guard and exact application/expected Supabase URL
  comparison passed without printing either URL. A live effective-access
  preflight confirmed table/RPC reachability, authenticated RPC execution,
  anonymous RPC denial, and authenticated/anonymous direct-table denial.
- `npm run test:integration` passed all ten live limiter tests in 132.27
  seconds; the five separately guarded baseline integration tests remained
  skipped. Search denied call 31, details denied call 21, and both RPC-only
  import buckets denied call 121. User/operation isolation, reported-window
  expiry, invalid operation/cost, unauthenticated/expired sessions, ten
  concurrent accepts, and the 35-call split of exactly 30 accepted/five denied
  with final cost 30 all passed.
- The final focused Playwright run passed one test in 1.3 minutes with one
  worker, no retry, no trace/video, and local poster-image fulfillment. It
  verified 30 allowed UI searches, friendly denial on request 31 via the
  documented application-level HTTP 200 response, QA-B independence, one
  request per click/double-click/Enter, no request for edit-only changes, clean
  console/network diagnostics apart from the explicitly classified Next
  development cache notice, and recovery after the UI-reported retry.
- Final privileged diagnostics verified four valid rows per QA user with exact
  post-browser counts and timestamp ordering, then an exact-user/four-operation
  cleanup removed eight disposable QA limiter rows and verified none remained.
  QA accounts and normal application data were not deleted.
- `npm run build` passed with 35 generated static shells. The post-build client
  secret scan passed across 478 browser artifacts with no configured-secret
  leak.

Exact PostgreSQL catalog ACL representation, the RLS-enabled flag, primary and
check constraints, function security attributes/body, and full migration parity
remain blocked: this environment has no direct database URL, Supabase CLI link,
management token, or other safe catalog runner. Run the repository's read-only
SQL reports manually in the confirmed development SQL Editor before treating
those properties as verified.


Create .env.test.local and fill in disposable QA User A and QA User B
credentials. Never commit the file or use production accounts.
