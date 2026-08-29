# Part 15.5F Release Blocker Remediation

Date: 2026-08-28  
Target: rerun Part 15.5E before Part 16 Preview deployment

## Executive result

The development target guard, missing repository baseline, and production
dependency advisory blockers are remediated. A disposable local PostgreSQL 18
database successfully applied the reconstructed baseline followed by every
existing migration, and both repository SQL verification files reported a
complete, hardened final schema with zero security findings.

The milestone does not yet authorize Preview deployment. Exact catalog
verification against the hosted development database, browser-driven live QA,
delivered signup OTP/password-recovery email, and a complete production build
still require an environment that can run those gates. Windows continues to
reject Vitest/Playwright/Next child processes with `spawn EPERM`. A non-live
Ubuntu workflow now reproduces the from-zero database, static checks, tests,
build, secret scan, and public responsive browser checks without embedding
real credentials. It has not been run because changes remain uncommitted and
were not pushed.

Recommendation: **NOT READY TO RERUN FINAL BETA QA** until the remaining
environment-dependent evidence below is obtained.

## Blocker status

| Original blocker | Result | Evidence |
|---|---|---|
| Development Supabase target guard | PASS | Shared loader preserves `.env.local` application configuration, consumes the last declaration in each file, and does not override shell/CI values; guarded QA test discovery and live audits are enabled only when the normalized URLs match and `E2E_TARGET_ENV=development` |
| Missing base-schema migration | PASS | `202607200001_base_schema.sql` precedes every dependent migration and is limited to evidenced pre-Phase-3 objects |
| From-zero execution | PASS | Disposable local PostgreSQL 18 database applied bootstrap plus all ten migrations; readiness SQL contained no `MISSING`; production security audit returned zero findings |
| Hosted development catalog SQL audit | BLOCKED | No database connection string/password, linked Supabase CLI, or Management API credential is configured; PostgREST OpenAPI and behavioral RLS tests pass, but they cannot attest exact hosted policy/grant/index catalogs |
| Production dependency audit | PASS | Safe patch-level overrides install Nanoid 3.3.18, Brace Expansion 1.1.18, and js-yaml 4.3.1; PostCSS is 8.5.26 at the root; production and full audits report zero vulnerabilities |
| Guarded live QA | PARTIAL | QA A/B RLS, onboarding ownership/restoration, limiter behavior, OpenAPI contracts, and authenticated route reads pass; email and browser-driven mutation flows remain blocked |
| Windows child-process startup | BLOCKED locally | Direct TypeScript/lint work; standard Vitest, Playwright workers, and Next child startup remain unreliable or blocked by `spawn EPERM` |
| Clean Linux fallback | DEFERRED | `.github/workflows/release-quality.yml` is ready but cannot run until these uncommitted changes are deliberately committed/pushed |

## Development target guard

The application URL is supplied by `NEXT_PUBLIC_SUPABASE_URL`. The independent
pin is `E2E_EXPECTED_SUPABASE_URL`, and `E2E_TARGET_ENV` must be exactly
`development`. The local files intentionally refer to the same development
project after URL normalization.

The Part 15.5E mismatch came from ad-hoc file loading: an earlier placeholder
declaration in `.env.test.local` could overwrite the real application URL from
`.env.local`. `lib/testing/local-environment.mjs` now:

- loads `.env.local` before `.env.test.local`;
- uses the final declaration within each individual file;
- lets `.env.local` remain authoritative for application configuration;
- lets `.env.test.local` contribute only missing QA-specific variables; and
- preserves explicit non-empty shell/CI values.

No ignored environment file was modified. No local value currently requires a
replacement. If the files are cleaned up manually later, the exact names are:

- `NEXT_PUBLIC_SUPABASE_URL`: the application's development project URL;
- `E2E_EXPECTED_SUPABASE_URL`: must normalize to exactly the same URL; and
- `E2E_TARGET_ENV`: must be `development` for live QA.

An extra `NEXT_PUBLIC_SUPABASE_URL` declaration in `.env.test.local` should be
removed or made identical to `.env.local` if retained. Do not invent either
URL. Guard proof includes five credentialed Playwright cases being discoverable
without the old target-mismatch skip, guarded OpenAPI access, two-user live
integration, and 15/15 protected route reads for each QA user.

## Baseline migration reconstruction

### Provenance root cause

The reachable Git history begins with application code and later incremental
migrations. It never contained the SQL that originally created `profiles`,
`movies`, and `user_movies`. The earliest version-controlled Phase 3 migration
therefore referenced pre-existing objects, making a fresh project impossible.

### Evidence used

The baseline uses converging evidence from:

1. every reachable Git revision and deleted-path search;
2. the Phase 1/2 application mapping changes, including the final Phase 2
   movie metadata names present before Phase 3;
3. `docs/DATABASE.md` and architecture/security handoffs;
4. typed application queries and mutations;
5. assumptions and comments in the existing migrations;
6. existing readiness/security verification SQL; and
7. guard-pinned read-only OpenAPI inspection of development.

The exact historical name of the deployed profile trigger was not recoverable.
The baseline gives the evidenced behavior a stable WatchFlow-owned function and
trigger name; hosted verification checks behavior rather than inventing a
legacy name.

### Reconstructed objects

`202607200001_base_schema.sql` creates:

- `profiles` with Auth ownership/cascade, pre-Phase-3 profile fields, timestamps,
  own-row RLS, initial grants, and Auth-user profile creation;
- `movies` with the Phase 2 metadata contract, unique TMDB identity, required
  JSON metadata, timestamps/checks, authenticated read access, and service-role
  write/sequence access; and
- `user_movies` with Auth/movie cascades, one row per user/movie, status and
  personal metadata, queue/schedule fields already required by the earliest
  Phase 3 code, owner-only CRUD RLS, checks, defaults, and timestamps.

It excludes `schedule_note`, `schedule_timezone`, `favourite`, `tmdb_adult`,
`metadata_language`, `onboarding_completed_at`, preferences, lists, and limiter
state because later migrations add them. Baseline policy names use a
`watchflow_base_` prefix so the historical queue-fix migration can add its
deliberate parallel policies without a duplicate-name failure.

### From-zero proof

A new isolated PostgreSQL 18 cluster was initialized under ignored
`qa-artifacts`, bound only to loopback on a nonstandard port, and given only
the minimal local Supabase role/Auth stub in
`supabase/testing/from_zero_bootstrap.sql`. The first rebuild exposed the
policy-name collision described above. After correcting only the new baseline,
a second brand-new database applied all ten migrations in chronological order.

`development_readiness.sql` then reported:

- seven required tables and 79 required columns installed;
- RLS enabled on all seven audited tables;
- all 18 required policy categories installed;
- all 16 current application RPC signatures installed, authenticated-executable,
  and not anonymous-executable; and
- required constraints, cascades, indexes, triggers, narrow profile grants,
  limiter isolation, and backfill states installed.

`production_security_audit.sql` reported every table/policy/grant boundary as
installed and returned zero findings. The temporary server was stopped after
verification. This proof changed no hosted schema or migration history.

### Existing development project reconciliation

Do not apply the baseline migration to the existing development project: its
base objects already exist. Before linking migration history, run both catalog
verification files with read-only database access, compare the legacy profile
trigger behavior, and use the supported Supabase migration-adoption/repair
workflow only after review. Never manually insert migration-history rows. A
new Preview project should apply the repository sequence from zero.

## Live development audit

The guard-pinned PostgREST OpenAPI audit passes all expected final table/column
contracts for `profiles`, `movies`, `user_movies`, `user_preferences`, `lists`,
`list_movies`, and the limiter table. All 15 RPCs currently called by the
application are present. Obsolete legacy single-delete and queue functions are
not runtime requirements; the application uses the current bulk-removal and
queue paths.

Behavioral development evidence:

- RLS integration: 5/5 passed for profile, preference, library, list,
  membership, anonymous-denial, shared-metadata, and QA A/B isolation behavior.
- Onboarding integration: 4/4 passed; each QA user could affect only their own
  completion state and original values were restored.
- TMDB limiter integration: 10/10 passed, including input rejection, operation
  and user isolation, concurrency, limits, expiry, expired sessions, and final
  state checks.
- Authenticated route audit: QA A and QA B each passed 15/15 protected routes;
  available owned movie/list details rendered, with no IDs emitted.

Exact hosted catalog policies, grants, function attributes, triggers,
constraints, and indexes remain BLOCKED until read-only PostgreSQL access is
provided. OpenAPI and behavioral tests are strong evidence but do not replace
catalog SQL.

## Dependency advisory remediation

The original production path was Next 16.2.12 -> PostCSS 8.5.25 -> Nanoid
3.3.16, reported under GHSA-2v37-7h3g-55p8. WatchFlow does not import Nanoid or
its affected generator API; the path is build tooling rather than a
user-controlled request path. The finding nevertheless remained a production
audit failure until patched.

Compatible updates were applied without `--force` or a major upgrade:

- root PostCSS: 8.5.26;
- Nanoid override: 3.3.18, including Next's nested PostCSS path;
- Brace Expansion under Minimatch 3.1.5: 1.1.18; and
- js-yaml under ESLint config: 4.3.1.

The latter two remove current development-tool denial-of-service advisories.
Production-only and full npm audits now report zero vulnerabilities. No
remaining dependency risk is accepted for this gate.

## Live QA and safety status

- Normal password authentication for both established QA users: PASS through
  guarded server/client login and authenticated rendering.
- QA A/B data isolation: PASS for the covered RLS and route-read matrix.
- Onboarding ownership/persistence contract: PASS through reversible live
  integration; full browser onboarding remains BLOCKED by worker startup.
- Signup OTP and password recovery: BLOCKED because no disposable inbox is
  available; no OTP, link, token, or credential was printed.
- Core feature browser mutations, Settings persistence, exports, and provider
  search: BLOCKED by Playwright worker `spawn EPERM`.
- Account deletion: BLOCKED because `E2E_RUN_ACCOUNT_DELETION=true` is not
  enabled. Set that one-use flag only alongside the dedicated
  `E2E_DELETE_ACCOUNT_EMAIL` and `E2E_DELETE_ACCOUNT_PASSWORD`, and ensure that
  account differs from QA A, QA B, and developer accounts.
- TMDB limiter: PASS through its dedicated 10-case live integration. Actual
  provider search remains BLOCKED by browser execution.

No QA A/B or developer account was deleted. No shared table was cleared, no
RLS/rate limit was disabled, and no production target was contacted.

## Windows EPERM and clean-environment fallback

Windows permits direct ESLint/TypeScript and Vitest's native config loader, but
intermittently denies child creation before standard Vitest config load,
Playwright workers, `pg_ctl`, and Next's TypeScript child. These are environment
blocks unless an assertion actually fails.

The Ubuntu workflow performs:

1. `npm ci`;
2. a PostgreSQL 18 from-zero migration rebuild plus both SQL audits;
3. lint and direct TypeScript;
4. the required `npm test` entry point;
5. production build followed by the artifact-dependent secret scan; and
6. public responsive Playwright against the built app.

It uses non-secret placeholder public configuration and an ephemeral
workflow-local PostgreSQL password. Live Supabase and destructive tests remain
separately guarded.

## Remaining release blockers

1. Execute both read-only SQL verification files against the confirmed hosted
   development database.
2. Run the Ubuntu workflow from a deliberate commit and record its result.
3. Run authenticated/browser regression where Playwright workers can spawn.
4. Complete signup OTP and password recovery with a disposable inbox.
5. Run the separately guarded disposable account-deletion case if required.

## Final local verification

- `git diff --check`: PASS.
- `npm run lint`: PASS.
- `npx tsc --noEmit`: PASS after correcting the isolated test fixture type.
- Focused environment/migration contracts: PASS, 2 files / 7 tests; the
  profile-grant follow-up selection passed 2 files / 21 tests.
- Required `npm test`: BLOCKED before config load by Windows `spawn EPERM`.
- Full native-loader fallback: PASS, 71 files / 716 tests.
- Final RLS/onboarding integration: PASS, 2 files / 9 tests; the dedicated
  limiter integration passed 1 file / 10 tests earlier in this remediation.
- Selected Playwright gate: 31 tests loaded, then BLOCKED before the first
  worker by Windows `spawn EPERM`.
- Final FROM-ZERO rebuild: PASS, all 10 migrations; no readiness/security
  failure.
- Development OpenAPI: PASS for 7 table/column contracts and 15 current RPCs.
- `npm audit --omit=dev`: PASS, 0 vulnerabilities. Full audit also reports 0.
- Client secret scan: PASS, 260 browser artifacts and no configured-secret
  leak.
- `npm run build`: optimized bundle compilation PASS; final command BLOCKED
  when Next attempted to spawn its TypeScript child. Direct TypeScript passes.
- Ubuntu workflow: DEFERRED until deliberate commit/push.

No production deployment occurred. All repository changes are uncommitted.
