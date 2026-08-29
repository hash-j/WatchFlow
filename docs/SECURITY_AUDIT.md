# WatchFlow Security Audit

Last reviewed: 2026-08-30
Code baseline: `master` at `2bb576a`

## Executive result

**PASS for beginning an isolated Part 16 Preview deployment.**

The repository and hosted development evidence now cover the complete
from-zero schema, effective RLS/privileges, two-user isolation, guarded Auth
flows, server/client secret boundaries, account deletion, durable provider
limiting, and built-client secret scanning. The hosted production security
audit reports zero findings.

This is not a public-production security approval. Preview must use a new
production Supabase project, apply migrations from zero, and repeat the SQL and
online Auth/browser checks before promotion.

## Evidence summary

| Security area | Result | Evidence |
|---|---|---|
| From-zero database security | AUTOMATED PASS | PostgreSQL 18 applies all 11 migrations; readiness and production security SQL pass in current-HEAD Linux CI |
| Hosted development security | AUTOMATED PASS | Readiness passes, backfill gaps are zero, and production security Section 7 reports zero findings |
| Profile privilege hardening | AUTOMATED PASS | Authenticated profile table SELECT only; six intended column UPDATE grants; no anon privileges |
| RLS | AUTOMATED PASS | Required tables/policies pass hosted verification; guarded QA A/B suite passes 5/5 |
| Cross-user isolation | AUTOMATED PASS | Two-way private reads and representative mutations/RPCs/routes/exports pass through ordinary authenticated clients |
| Authentication flows | MANUAL PASS | Fresh signup/six-digit OTP/onboarding/login/recovery completed |
| Account deletion | MANUAL PASS | Dedicated disposable account completed the controlled application flow |
| Server/client secret separation | AUTOMATED PASS | Current-HEAD production build and browser-artifact secret scan pass |
| TMDB limiting | AUTOMATED PASS | Live limiter suite passes 10/10 with user/operation isolation and concurrency |
| Local authenticated browser automation | BLOCKED - LOCAL WINDOWS ENVIRONMENT ONLY | Worker/browser startup denied by `spawn EPERM`; no automated browser pass is claimed |

## Identity and authorization

- Proxy and protected layout boundaries validate refreshed Supabase claims.
- Mutations, exports, provider ingestion, settings, deletion, onboarding,
  discovery, and Statistics use fresh Auth user checks where current Auth-server
  state is required.
- No normal operation authorizes with `getSession()`.
- Browser inputs do not provide `user_id`; identity derives from verified Auth.
- Relationship/list identifiers are server validated, explicitly owner
  filtered where applicable, and still subject to RLS.
- Foreign and missing private identifiers return the same nonrevealing result.
- Callback and confirmation flows validate one-time credentials server-side,
  allowlist OTP types, and restrict redirects to safe internal paths.

Public `/auth/login`, `/auth/sign-up`, `/auth/verify-email`,
`/auth/forgot-password`, `/auth/update-password`, and `/auth/error` remain
accessible. Protected routes remain protected. The public-auth server session
gate is request-dependent and sits behind focused Suspense boundaries, so the
static shell and production build remain valid without removing Auth behavior.

Signup remains a six-digit email OTP flow. Password recovery remains
link-based. The completed release smoke proves delivered flows against hosted
development.

## Supabase client boundaries

| Client | Permitted use |
|---|---|
| Browser public client | Browser-safe Supabase URL/publishable key and normal user session operations |
| Cookie-bound server client | User-owned reads/mutations under the authenticated JWT and RLS |
| Proxy client | Claims verification and complete Supabase cookie refresh/copy |
| Server-only secret client | Shared `movies` metadata after verified Auth; final deletion of the same freshly verified Auth user |

The secret/admin module imports `server-only`, disables session persistence,
refresh, and URL detection, and requires verified identity before construction.
No Client Component or client-safe barrel imports it. It was not used to
simulate any QA A/B user-owned operation.

## Data scopes and RLS

| Object | Final scope |
|---|---|
| `profiles` | Own-row SELECT/UPDATE under RLS; authenticated SELECT plus only six column UPDATE privileges |
| `user_preferences` | Own SELECT/INSERT/UPDATE; no normal DELETE |
| `user_movies` | Own library and all private movie state under RLS |
| `lists` | Own private list CRUD |
| `list_movies` | Operations require ownership of both parent list and referenced `user_movies` row |
| `movies` | Shared metadata readable as intended; browser roles cannot write; trusted server upsert only |
| `watchflow_tmdb_rate_limits` | Internal RLS-enabled table, no browser table access, authenticated limiter RPC only |

Two-user verification passed in both directions for profiles, preferences,
library relationships, status, favourites, ratings, reviews, watched dates,
Watch Next membership/order, schedule data, lists/memberships/order, Picker,
Recommendations, Statistics, Settings, and CSV/JSON exports. Representative
foreign SELECT, UPDATE, DELETE, cross-parent membership, and owner-derived RPC
attempts were inaccessible/rejected. Owner follow-up reads confirmed data
integrity.

Shared movie metadata may legitimately be common. Personal relationship and
derived data may not; no cross-user leak was found.

## Profile privilege drift resolution

Hosted development previously retained INSERT, DELETE, TRUNCATE, REFERENCES,
TRIGGER, and SELECT from an older unversioned broad table grant after the
settings migration removed table UPDATE. The forward-only migration
`202608290001_profiles_privilege_hardening.sql` is now applied and restores the
intended least-privilege contract:

- authenticated table SELECT: allowed;
- authenticated INSERT/table UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER:
  denied;
- authenticated UPDATE only on `avatar_url`, `country`, `full_name`,
  `onboarding_completed_at`, `timezone`, and `updated_at`; and
- no `PUBLIC`/anonymous profile table or column privilege.

Own-row RLS, Auth-triggered profile creation, Auth-cascade deletion, and the
server-role boundary remain unchanged. Profile/settings/schedule smoke after
hardening and subsequent current-HEAD Linux CI both pass.

## TMDB, caching, and rate limits

TMDB calls remain server-only, fixed to the HTTPS provider origin, bounded by
an eight-second timeout, and mapped to provider-neutral internal types. Current
fixed windows are per authenticated user and operation:

| Operation | Allowance | Window |
|---|---:|---:|
| Search | 30 | 60 seconds |
| Details | 20 | 60 seconds |
| Import search | 120 | 600 seconds |
| Import details | 120 | 600 seconds |

The security-definer limiter derives `auth.uid()`, uses a fixed empty search
path and database locking, exposes no counter table access, and fails closed.
Live behavior passes threshold, expiry, invalid-input, unauthenticated,
user/operation-isolation, and concurrency cases.

Shared details use the single `movies` row per TMDB ID as a canonical-English,
adult-compatible bounded-age cache. Private rows, preferences, lists,
discovery state, Statistics, and exports are not globally cached.

## Uploads, exports, errors, and logging

- CSV uploads authenticate first, remain memory-only, and enforce file, row,
  column, cell, payload, decision, and concurrency limits.
- CSV/JSON exports authenticate inside controlled handlers, whitelist fields,
  owner-filter private tables, and return private no-store/no-cache/nosniff
  attachments.
- CSV values that could become spreadsheet formulas are neutralized, including
  after leading whitespace.
- Two-user export assertions confirm current-user content and no foreign
  marker/email.
- User-visible errors exclude raw provider/Postgres/stack/key/token details.
- Development Supabase logging retains only a validated error code/category;
  production emits no private diagnostic from that helper.
- Browser diagnostics omit headers, bodies, credentials, cookies, tokens,
  private exports, and unredacted identifier paths.

## Browser and build defenses

The application sends CSP, `nosniff`, frame denial, strict-origin referrer
policy, and restrictive permissions policy headers. Remote images are limited
to the intended TMDB HTTPS path and use controlled fallbacks.

The exact current code commit passes a clean production build and post-build
client secret scan in Ubuntu CI. No Supabase secret key or TMDB token reaches
browser artifacts.

## Destructive actions

Library deletion removes only the verified member's `user_movies` data and
does not delete shared movies. Account deletion requires exact confirmation,
checkbox consent, fresh verified identity, and recent sign-in before final
same-user Auth deletion. The dedicated disposable real-flow verification
passed; QA A/B were not deleted.

## Preview and later security work

Before connecting a Preview deployment:

1. create the separate production Supabase project;
2. apply all migrations from zero;
3. rerun both SQL verification scripts and resolve every finding;
4. configure only Preview-scoped environment secrets and Auth redirect/email
   settings;
5. run online Auth, two-user, export, and authenticated responsive checks; and
6. record access controls, backup/PITR availability, monitoring ownership, and
   rollback procedures.

Legal/privacy documents, TMDB attribution/licensing, full monitoring, tested
restore procedures, and public-domain hardening are required before their
public-beta/production gates, not before creating an access-limited Preview.

No finding justifies disabling RLS, broadening browser privileges, exposing a
secret, weakening Auth, or using the admin client for ordinary user data.
