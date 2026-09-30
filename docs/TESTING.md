# WatchFlow Testing Guide

Last reviewed: 2026-09-30

## Current release evidence

## Part 18J-C Google Calendar transport coverage

Part 18J-C uses mocked `fetch` and injected executor dependencies for normal
tests; unit and full suites never contact Google. Coverage verifies UTC,
Asia/Karachi, America/Los_Angeles, and a DST-sensitive instant; token refresh
and optional rotation; deterministic create/update conflict convergence;
delete and delete-404 behavior; 429/5xx/network/auth/terminal classification;
malformed responses; exact claim/finalize arguments; stale finalization;
encrypted owner binding; and absence of token/error leakage.

Migration/source and rollback-only PostgreSQL coverage proves the replacement
RPC is owner/connection/provider-bound, browser roles cannot execute it, a
paused connection remains paused with unchanged metadata after rotation, and
paused/disconnect-pending connections cannot be claimed. Guarded integration
also verifies that a schedule change made while paused retains its current
`upsert` source version for reconciliation after resume. The database check
also validates the corrected Google-compatible deterministic event alphabet.

Focused command:

```text
npx vitest run lib/calendar app/api/internal/calendar/sync/route.test.ts lib/supabase/background.test.ts --configLoader native --pool threads --maxWorkers=1 --no-file-parallelism
```

Real Google acceptance is a separate human-checkpoint operation against
watchflow-dev. It must pin the development project and controlled account,
then create, repeat, reschedule, and unschedule one fixture while checking one
event, stable identity, mapping/job convergence, second-user isolation,
unrelated-event preservation, and exact cleanup. Do not run that flow against
Production or without explicit approval for real provider mutations.

## Part 18J-B Google OAuth coverage

Part 18J-B unit/contract tests cover OAuth URL scope/offline/PKCE parameters,
missing refresh access, verified identity, high-entropy independent state,
malformed cookies, AES-256-GCM round trips, owner-bound AAD, tampering, invalid
keys, one-time hashed-state SQL, the narrow RPC privilege model, absence of
access-token persistence, and absence of calendar event transport. Provider
network tests use injected `fetch` responses and never contact Google.

Live acceptance remains required after applying migration `202609290003` to
watchflow-dev and configuring a development Google OAuth client plus encryption
key. Acceptance must verify connect/reconnect, denial, state replay/expiry,
pause/enable, disconnect/revocation behavior, two-user isolation, RLS, secret
non-exposure, and exact fixture cleanup. It must not use Production.

Part 18J-A adds source-only contract coverage in `lib/calendar`. It verifies
deterministic source/version/event identifiers, the four-table migration,
credential isolation, owner-read-only RLS/grants, desired-state coalescing,
bounded `SKIP LOCKED` claims, exact lease/version finalization, retries, and
mapping cleanup. These tests do not claim an installed watchflow-dev migration,
working OAuth, Google API delivery, or browser acceptance.

The clean PostgreSQL 18 release job also runs
`supabase/testing/part18j_calendar_foundation.sql` after rebuilding every
migration. That rollback-only check exercises enqueue/claim exclusivity,
identical-work lease preservation, stale-finalization rejection, mapping
upsert/delete convergence, owner isolation, and the service-role grant boundary
without Google or retained fixtures.

Focused local command:

```text
npx vitest run lib/calendar --configLoader native --pool threads --maxWorkers=1 --no-file-parallelism
```

The final Part 15.5E evidence is in `docs/RELEASE_EVIDENCE.md`.

- Current code HEAD `2bb576a` has a fully green Ubuntu Release Quality run.
- PostgreSQL 18 rebuilds the complete schema from all 11 migrations and both
  SQL verification scripts pass.
- Hosted development readiness/security and profile hardening pass.
- Guarded QA A/B RLS passes 5/5; broader two-way ownership verification passes.
- Fresh signup/six-digit OTP/onboarding/recovery and disposable account
  deletion have manual release-smoke evidence.
- The authenticated core application has manual browser evidence.
- Windows automated authenticated Playwright remains blocked before worker
  startup by `spawn EPERM`; this is not recorded as a browser pass.
- Current local full fallback: 73 files/727 tests PASS.

## Test layers

| Layer | Command or path | Data source | What it proves |
|---|---|---|---|
| Unit/source contracts | `npm test`, `lib/**/*.test.ts` | Pure fixtures and typed mocks | Validation, mapping, behavior, action orchestration, safe errors, source boundaries, migration contracts |
| Guarded integration | `npm run test:integration`, `integration/**/*.integration.test.ts` | Exactly pinned development Supabase | Authenticated/anonymous RLS and separately opted-in live limiter/onboarding behavior |
| Database verification | `supabase/verification/*.sql` | Selected PostgreSQL/Supabase database | Installed schema, RLS, policies, grants, functions, cascades, constraints, indexes, triggers, and backfills |
| Public E2E | `npm run test:e2e` and public Playwright specs | Local production app | Public auth routes, protected redirects, keyboard behavior, diagnostics, responsive UI |
| Authenticated E2E | Guarded Playwright specs | Loopback app pinned to development Supabase | Real user workflows with isolated in-memory sessions and targeted cleanup |
| Account deletion E2E | Separately guarded Playwright spec | Dedicated disposable account | Controlled one-shot deletion and rejected re-login |
| Client secret scan | `npm run scan:client-secrets` after build | `.next` browser/render output | No server variable name, configured secret value, or secret-shaped key leaks into browser artifacts |
| Production build | `npm run build` | Production Next.js compiler | Server/client boundaries, Cache Components behavior, route generation, bundling |

Mocked/source tests do not establish installed target policies or delivered
email behavior. Likewise, an integration result does not substitute for the
real browser workflow when interaction behavior is the subject of the check.

## Standard non-live quality sequence

```text
git diff --check
npm run lint
npx tsc --noEmit
npm test
npm run build
npm run scan:client-secrets
npx playwright test e2e/responsive.spec.ts
```

`.github/workflows/release-quality.yml` runs the authoritative clean-Ubuntu
version with locked installation and PostgreSQL 18 migration verification.
Use its successful result when the local Windows host fails before test/build/
browser execution with `spawn EPERM`. Never describe a blocked local command
as passed; report the Linux and local outcomes separately.

The supported local fallback for the full source suite is:

```text
npx vitest run --configLoader native --pool threads --maxWorkers=1 --no-file-parallelism
```

This fallback is useful evidence but does not replace ensuring the exact
`npm test` entry point passes in CI.

## Environment-variable names

Keep values in ignored local configuration or the invoking process. Never put
actual values in documentation, logs, screenshots, traces, or committed test
state.

Application/build names:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `WATCHFLOW_SCHEDULER_SECRET`
- `TMDB_READ_ACCESS_TOKEN`
- `NEXT_PUBLIC_APP_URL`
- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI`
- `CALENDAR_TOKEN_ENCRYPTION_KEY`
- `CALENDAR_TOKEN_ENCRYPTION_KEY_VERSION`

Only public Supabase configuration and the public app origin may enter browser
code. Supabase/TMDB secrets and every Google Calendar OAuth/encryption setting
are server-only.

Guarded browser/integration names:

- `E2E_BASE_URL`
- `PLAYWRIGHT_BASE_URL`
- `E2E_WEB_SERVER_COMMAND`
- `E2E_REUSE_VERIFIED_DEVELOPMENT_SERVER`
- `E2E_TARGET_ENV`
- `E2E_EXPECTED_SUPABASE_URL`
- `E2E_USER_A_EMAIL`, `E2E_USER_A_PASSWORD`
- `E2E_USER_B_EMAIL`, `E2E_USER_B_PASSWORD`
- `E2E_DELETE_ACCOUNT_EMAIL`, `E2E_DELETE_ACCOUNT_PASSWORD`
- `E2E_RUN_ACCOUNT_DELETION`
- `E2E_TEST_MOVIE_QUERY`
- `E2E_ONBOARDING_MOVIE_QUERY_A`, `E2E_ONBOARDING_MOVIE_QUERY_B`
- `RUN_SUPABASE_INTEGRATION_TESTS`
- `RUN_ONBOARDING_INTEGRATION_TESTS`
- `RUN_TMDB_RATE_LIMIT_INTEGRATION_TESTS`
- `E2E_RATE_LIMIT_BUCKETS_ARE_FRESH`
- `RUN_TMDB_RATE_LIMIT_E2E`
- `E2E_RATE_LIMIT_UI_BUCKETS_ARE_FRESH`

## Live-test safety gates

Authenticated Playwright and integration work must fail closed unless:

1. `E2E_TARGET_ENV` is exactly `development`;
2. the application base URL is loopback for local mutating QA;
3. the configured Supabase URL exactly matches the independent expected URL;
4. the required designated QA identities are configured; and
5. any test-specific mutation/traffic guard is explicitly enabled.

Credentialed Playwright must not reuse an unknown loopback server. Reuse is
allowed only after a read-only runtime check confirms that the server CSP pins
the expected development Supabase HTTPS and WebSocket origins.

Account deletion additionally requires the one-shot opt-in and a dedicated
email distinct from QA A and QA B. Never use a developer, production, QA A, or
QA B account for deletion.

Limiter tests have separate opt-ins because they consume real allowances.
Ordinary authenticated QA clients invoke the limiter. Any secret-client
diagnostic is read-only and must not simulate a user operation.

## Browser and diagnostic safety

- Authenticated contexts are in memory; storage state is never serialized.
- Traces and video are disabled where real passwords are used.
- URLs are redacted before diagnostics are retained. Do not retain headers,
  bodies, cookies, tokens, credentials, uploaded private CSVs, or export
  content.
- Expected validation responses are not defects. Unexpected console/page
  errors, failed requests, hydration errors, route 404s, promise failures, and
  HTTP 400/401/403/404/500 responses must be classified.
- Cleanup deletes only uniquely identified data created by the test. Never
  broaden cleanup after a failure.

Relevant helpers live under `e2e/fixtures/qa.ts` and `e2e/helpers/` for auth,
movies, lists, CSV, assertions, environment guards, diagnostics, and responsive
measurements.

## Database and RLS verification

Run these read-only scripts against each intended non-production or Preview
database after migrations:

1. `supabase/verification/development_readiness.sql`
2. `supabase/verification/production_security_audit.sql`

Every `MISSING`, `UNSAFE`, `ENABLED_UNEXPECTEDLY`, or finding must be resolved
before promotion. Database objects, not a migration ledger alone, are the
source of truth.

The current migration list rebuilds from zero. Do not apply the reconstructed
base migration over the existing development project's already-created base
objects. A new Preview project should apply the complete sequence from zero.

Current hosted evidence:

- readiness PASS and zero missing profile/preference backfills;
- production security findings 0;
- exact hardened profile privilege matrix PASS;
- QA A/B RLS suite 5/5 PASS; and
- broader two-way reads/mutations/routes/exports PASS without an admin bypass.

## Responsive coverage

`e2e/responsive.spec.ts` covers public and auth pages across representative
mobile, tablet, and desktop widths. The current-HEAD Linux workflow passes this
suite in Chrome.

`e2e/responsive-authenticated.spec.ts` covers protected routes, navigation,
overflow, Library controls, shared dialogs, and owned detail/list layouts with
guarded QA sessions. The final Windows rerun cannot start its Playwright
worker. Authenticated desktop workflows have current manual evidence; a fresh
post-hardening mobile/tablet online sweep remains a Part 16 Preview check.

Do not infer authenticated responsive PASS from the public Linux suite.

## Authentication evidence

Source and route tests protect:

- public login/sign-up/verify-email/recovery/error route availability;
- six-digit numeric signup OTP behavior and pending-email handling;
- internal-only callback destinations;
- link-based password recovery/update;
- protected-route redirects and no redirect loops;
- safe Auth/provider/configuration errors; and
- the `/auth/sign-up` non-404 regression.

Current manual release smoke additionally proves fresh signup, delivered
six-digit OTP, onboarding, established login/session behavior, link-based
password recovery, and the controlled disposable account-deletion flow.

## Product and isolation evidence

Manual authenticated development QA covers Dashboard, Search/TMDB, Library,
movie detail and personal actions, Watch Next, Schedule, Lists, Picker,
Recommendations, Statistics, and Settings.

Automated/live ownership evidence covers both QA directions for profiles,
preferences, library/private movie fields, favourites, ratings, reviews,
watched dates, queue membership/order, schedule notes/timezones, lists,
memberships/order, discovery/statistics/settings scope, exports, foreign IDs,
and representative reads/updates/deletes/RPCs.

CSV and JSON attachment response/content/isolation pass. If the latest manual
record does not explicitly include browser save/open, repeat that user-facing
step during Preview rather than inventing a manual result.

## Part 16 Preview verification

After deploying to the separate Preview Supabase/Vercel environment:

1. rerun both SQL reports;
2. verify public Auth URLs and production-build routes;
3. complete fresh signup/OTP/onboarding/login/logout/recovery;
4. rerun core authenticated workflows and QA A/B isolation;
5. verify browser-managed CSV/JSON downloads;
6. run authenticated mobile/tablet/dialog/overflow checks;
7. review browser console/network/page failures; and
8. record rollback, monitoring, backup, and environment-separation evidence.

Preview must not use `watchflow-dev`.
