# Part 15.5F/15.5G Release Blocker Remediation

Last reviewed: 2026-08-30
Target: final Part 15.5E rerun before Part 16 Preview Deployment

## Resolution status

All genuine blockers identified by the original Part 15.5E NO-GO have been
resolved or replaced by authoritative equivalent evidence. WatchFlow may begin
an isolated Part 16 Preview deployment. The remaining Windows browser/process
restriction is an environment-only limitation, and Preview-specific setup is
deliberately deferred to Part 16.

| Original or follow-up blocker | Final result | Resolution evidence |
|---|---|---|
| Development Supabase target-pin mismatch | PASS | Deterministic guarded environment loading preserves application values and exact independent project pinning |
| Missing base-schema migration | PASS | Reviewed `202607200001_base_schema.sql` reconstructs the evidenced pre-Phase-3 baseline |
| From-zero database recovery | PASS | PostgreSQL 18 applies bootstrap plus all 11 migrations; both verification SQL files pass |
| Dependency advisories | PASS | Compatible patch-level remediation produced zero production/full npm audit findings |
| Hosted development catalog/readiness | PASS | Hosted readiness audit passes with installed objects and zero profile/preference backfill gaps |
| Legacy broad `profiles` privileges | PASS | `202608290001_profiles_privilege_hardening.sql` is applied; authenticated has SELECT plus six narrow UPDATE columns only |
| Hosted security findings | PASS | Hosted production security audit Section 7 returns zero findings |
| `/auth/login` production prerender regression | PASS | Request-time Auth gate is behind focused Suspense; current-HEAD Linux production build passes |
| Clean Linux quality/build/browser evidence | PASS | GitHub Release Quality run 33268937218 passes every step at exact current HEAD |
| Fresh signup/OTP/onboarding | MANUAL PASS | Fresh delivered six-digit OTP and onboarding release smoke completed |
| Password recovery | MANUAL PASS | Delivered link-based recovery completed |
| Account deletion | MANUAL PASS | Dedicated disposable account completed the real controlled flow |
| Authenticated product QA | MANUAL PASS | Major authenticated development workflows were exercised successfully |
| Two-user isolation | PASS | QA A to B and B to A reads/mutations/routes/exports pass with ordinary authenticated clients |
| Windows automated authenticated browser runner | BLOCKED - LOCAL WINDOWS ENVIRONMENT ONLY | Playwright cannot spawn its worker/browser; no test assertion fails and no browser PASS is claimed |

## Database remediation summary

The repository now has a complete, ordered migration chain:

- the reconstructed baseline creates the evidenced original profile, shared
  movie, and personal-library contract;
- later migrations add management, schedule, preferences, Part 12 library
  behavior, private lists, durable TMDB limiting, scheduling profile columns,
  onboarding, and final profile privilege hardening; and
- the current sequence rebuilds successfully from zero in clean Linux CI.

The baseline is for new databases. It must not be applied over the existing
development project's already-created base objects. The existing development
project instead received the forward privilege-hardening migration and now
matches the verified final ACL/RLS contract.

The hosted profile drift was the residue of an older unversioned table-wide
grant after the settings migration removed table UPDATE. The forward migration
revoked authenticated INSERT, table UPDATE, DELETE, TRUNCATE, REFERENCES, and
TRIGGER, preserved SELECT, and restored UPDATE only on `avatar_url`, `country`,
`full_name`, `onboarding_completed_at`, `timezone`, and `updated_at`. It did not
change Auth-triggered profile creation, Auth-cascade deletion, RLS ownership,
or the service-role boundary.

## Live evidence summary

- Hosted development readiness and security SQL: PASS.
- Hosted profile/settings/schedule smoke after hardening: PASS.
- QA A/B baseline RLS integration: 5/5 PASS.
- Onboarding ownership/restoration integration: PASS.
- TMDB limiter integration: 10/10 PASS.
- Fresh signup/six-digit OTP/onboarding/recovery: MANUAL PASS.
- Controlled disposable account deletion: MANUAL PASS.
- Authenticated core workflows: MANUAL PASS.
- Two-way isolation across profiles, preferences, all personal library fields,
  queue/schedule, lists, discovery/statistics/settings, and CSV/JSON exports:
  PASS.

No service-role/admin client was used for user-operation assertions. Temporary
QA audit rows were removed and original queue/settings state was restored.

## Clean Linux evidence

The successful workflow at current code SHA runs `npm ci`, PostgreSQL 18
from-zero verification, both SQL audits, lint, TypeScript, exact `npm test`,
the production build, post-build secret scan, Chrome installation, and public
responsive Playwright. Every step passed.

Windows `spawn EPERM` remains relevant only to local process execution. The
local full supported fallback passes 73 files/727 tests, while current-HEAD
Ubuntu CI provides the authoritative exact command/build/browser result.

## Remaining work classification

There are no remaining FAIL blockers to beginning Preview.

**BLOCKED - LOCAL WINDOWS ENVIRONMENT ONLY:** automated authenticated
Playwright worker/browser startup.

**DEFERRED TO PREVIEW:** create the separate production Supabase project,
apply migrations from zero, configure Vercel/environment/Auth URLs and email,
repeat online authenticated mobile/tablet and browser-download checks, and
record Preview operations/rollback evidence.

See `docs/RELEASE_EVIDENCE.md` for the final matrix. Do not connect Preview to
`watchflow-dev`, deploy from this documentation-only working tree without a
deliberate commit, or treat Preview readiness as public-production approval.
