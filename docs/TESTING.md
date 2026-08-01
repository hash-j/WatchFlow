# WatchFlow Testing Guide

## Purpose

This document describes the Part 15 test architecture and the evidence required
before Preview sign-off. It deliberately separates repository tests from tests
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
| Integration | `npm run test:integration` / `integration/**/*.integration.test.ts` | Development Supabase when explicitly enabled | Current suite is read-only apart from Auth sign-in/sign-out | Two-user and anonymous read isolation for profiles, preferences, library rows, lists, memberships, and shared movies |
| Database catalog verification | `supabase/verification/*.sql` | Manually selected development or Preview database | None | Installed objects, columns, RLS, policies, grants, functions, constraints, indexes, triggers, and backfill gaps |
| Public/regression E2E | `npm run test:e2e` | Local application; public routes | Local form state only, except the invalid-provider-login case when the development guard is enabled | Auth route existence, callback failure handling, logged-out protection, keyboard order, responsive sign-up layout, and the `/auth/sign-up` non-404 regression |
| Authenticated E2E | Guarded Playwright suites | Loopback app connected to a confirmed development Supabase project | Controlled QA movie/list/preferences data, followed by targeted cleanup | Authenticated route smoke, controlled search/add/remove, in-memory CSV upload, and two-user list isolation |
| Account-deletion E2E | Separately guarded Playwright suite | Dedicated disposable development Auth account | Destructive and intentionally one-shot | Account deletion UI, logout, rejected re-login, and preservation of QA User A |
| Browser diagnostics | `e2e/helpers/diagnostics.ts` | Playwright page events | None | Redacted console warnings/errors, page errors, failed requests, and HTTP responses at or above 400 |
| Client secret scan | `npm run scan:client-secrets` after `npm run build` | `.next/static` and rendered App Router payloads | None | Forbidden server-variable names, configured secret values, and secret-shaped values are absent from browser artifacts |
| Production build | `npm run build` | Local production build | Build artifacts only | App Router compilation, server/client boundaries, route generation, image configuration, and production bundling |

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

### Supabase integration suite

- `RUN_SUPABASE_INTEGRATION_TESTS`
- `E2E_TARGET_ENV`
- `E2E_EXPECTED_SUPABASE_URL`
- the two public Supabase names
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
process already listening on the loopback port; it starts the configured
server command with the pinned environment.

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
limiting, caching, image URLs, and safe error paths. The guarded browser suite
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
- account-delete cascades and direct database confirmation that shared movies
  remain; and
- protected mobile/tablet layouts, dialogs, focus restoration, charts (none
  exist), and the requested authenticated screenshot catalogue.

The `/statistics` prefix is protected from anonymous access, but the repository
contains no `/statistics` page. It cannot be tested as a preserved implemented
feature.

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
