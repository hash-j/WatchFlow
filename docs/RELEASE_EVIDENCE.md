# WatchFlow Release Evidence

Date: 2026-08-30
Release gate: final Part 15.5E rerun before Part 16 Preview Deployment
Code commit reviewed: `2bb576a83d092e1236a3f9253f825c0d686334f3`
Branch: `master`

## Decision

**READY FOR PART 16 PREVIEW DEPLOYMENT.**

This is approval to begin an isolated Preview deployment and its online QA,
not approval for a public production launch. Preview must use a newly created
production Supabase project and its own Vercel environment values. It must not
connect to the current `watchflow-dev` database.

Status meanings used here:

- **AUTOMATED PASS**: an automated repository, CI, SQL, integration, or
  authenticated route assertion completed successfully.
- **MANUAL PASS**: a real user/browser/email workflow was completed and
  reported successfully, but is not represented as automated Playwright.
- **BLOCKED - LOCAL WINDOWS ENVIRONMENT ONLY**: the local worker/browser could
  not start because Windows denied process creation. This is not an observed
  application failure.
- **DEFERRED TO PREVIEW**: intentionally belongs to the isolated deployed
  Preview environment or its online QA.
- **FAIL**: a confirmed unresolved defect. There are no FAIL items in this
  release gate.

## Release provenance

- `HEAD` and `origin/master` both point to `2bb576a` (`fix: harden
  authenticated profile privileges`).
- GitHub Actions [Release Quality run 33268937218](https://github.com/hash-j/WatchFlow/actions/runs/33268937218)
  completed successfully for that exact SHA on 2026-08-29.
- The run's `non-live-quality` job passed checkout, Node setup, `npm ci`, the
  PostgreSQL 18 from-zero rebuild, both SQL audits, lint, direct TypeScript,
  the complete unit/source suite, the production Next.js build, browser-client
  secret scanning, Chrome installation, and public responsive Playwright.
- The `/auth/login` Cache Components prerender regression was fixed in the
  preceding commit and the successful run at current HEAD proves the fixed
  public-auth render architecture still builds after profile hardening.
- Changes after that green code SHA are documentation only. No uncommitted
  application, test, workflow, dependency, or migration file exists.

## Final release matrix

| Area | Result | Current evidence |
|---|---|---|
| Locked dependency install | AUTOMATED PASS | `npm ci` passed in the clean Ubuntu workflow |
| From-zero migrations | AUTOMATED PASS | PostgreSQL 18 applied bootstrap plus all 11 chronological migrations, then both SQL audits passed in the current-HEAD workflow |
| Migration ordering | AUTOMATED PASS | Unique ordered filenames, migration-order contracts, and executable from-zero sequence pass; no uncommitted migration exists |
| Hosted development readiness | AUTOMATED PASS | Hosted readiness SQL reports installed objects and zero missing profile/preference backfills |
| Hosted security audit | AUTOMATED PASS | Hosted `production_security_audit.sql` Section 7 reports zero findings |
| Profile privilege hardening | AUTOMATED PASS | Hosted authenticated profile table privileges are SELECT only; table INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER are false; UPDATE is limited to the six intended columns |
| RLS | AUTOMATED PASS | Required hosted RLS/catalog checks pass; guarded QA A/B RLS suite passes 5/5 |
| QA A to QA B isolation | AUTOMATED PASS | No foreign private read or mutation succeeded across every tested user-owned domain |
| QA B to QA A isolation | AUTOMATED PASS | Same result in the reverse direction |
| Signup | MANUAL PASS | Fresh account signup completed in the hosted development release smoke |
| Six-digit signup OTP | MANUAL PASS | Delivered six-digit OTP verification completed successfully |
| Onboarding | MANUAL PASS | Fresh verified account completed onboarding; guarded ownership/restoration integration also passes |
| Established login/session behavior | MANUAL PASS | Login and account/session behavior completed successfully; protected routes remain claim/session guarded |
| Logout/login persistence | MANUAL PASS | Covered by the completed account/session release smoke and authenticated manual journey evidence |
| Password recovery | MANUAL PASS | Delivered link-based recovery completed successfully |
| Account deletion | MANUAL PASS | The real controlled flow passed with the dedicated disposable account; QA A/B were not used |
| Dashboard | MANUAL PASS | Authenticated development workflow exercised successfully |
| Search/TMDB | MANUAL PASS | Real authenticated search worked; durable live limiter verification separately passes 10/10 |
| Library/movie detail | MANUAL PASS | Add, open, and personal movie workflows were exercised successfully |
| Favourites/status/rating/review | MANUAL PASS | Authenticated development workflow exercised successfully; two-user ownership audit passes |
| Watch Next/order | MANUAL PASS | Queue workflow exercised successfully; cross-user membership/order and restoration assertions pass |
| Schedule | MANUAL PASS | Scheduling and persistence worked after the narrow profile privilege patch |
| Lists/order/membership | MANUAL PASS | Authenticated list workflow exercised successfully; two-user list and membership assertions pass |
| Picker | MANUAL PASS | Authenticated development workflow exercised successfully; ownership-source contracts pass |
| Recommendations | MANUAL PASS | Authenticated development workflow exercised successfully; personal-input scoping passes |
| Statistics | MANUAL PASS | Authenticated development workflow exercised successfully; private query and two-user scoping pass |
| Profile/preferences/notifications | MANUAL PASS | Settings smoke after hardening and authenticated manual workflow pass |
| CSV export data and isolation | AUTOMATED PASS | Authenticated attachment route returned current-user controlled data and excluded the other QA user's marker/email |
| JSON export data and isolation | AUTOMATED PASS | Authenticated attachment route returned current-user controlled data and excluded the other QA user's marker/email |
| Public responsive UI | AUTOMATED PASS | Current-HEAD Ubuntu Chrome Playwright passed |
| Authenticated desktop UI | MANUAL PASS | Major authenticated workflows were exercised in the real development application |
| Authenticated mobile/tablet rerun | DEFERRED TO PREVIEW | Current Windows Playwright worker cannot start; earlier responsive coverage and current source contracts exist, but a fresh post-hardening online viewport run is intentionally not invented |
| Lint | AUTOMATED PASS | Current local `npm run lint` passes; exact current HEAD also passed in Ubuntu CI |
| TypeScript | AUTOMATED PASS | Current local `npx tsc --noEmit` passes; exact current HEAD also passed in Ubuntu CI |
| Unit/source tests | AUTOMATED PASS | Current-HEAD Ubuntu `npm test` passes; local Windows fallback passes 73 files/727 tests |
| Production build | AUTOMATED PASS | Current-HEAD Ubuntu `npm run build` completed successfully |
| Client secret scan | AUTOMATED PASS | Current-HEAD post-build scan completed successfully |
| GitHub Linux CI | AUTOMATED PASS | Release Quality run 33268937218 passed every step for exact current HEAD |
| Local authenticated Playwright | BLOCKED - LOCAL WINDOWS ENVIRONMENT ONLY | Playwright fails before its worker/browser launches with `spawn EPERM`; no browser test is claimed as executed |

## Database and migration conclusion

The repository contains these 11 migrations in valid chronological order:

1. `202607200001_base_schema.sql`
2. `202607210001_phase_3_movie_management.sql`
3. `202607220002_schedule_queue_fixes.sql`
4. `202607220003_user_settings.sql`
5. `202607230001_user_preferences_privileges.sql`
6. `202607280001_part_12_library_improvements.sql`
7. `202607290001_part_13_private_custom_lists.sql`
8. `202607300001_part_15_tmdb_rate_limits.sql`
9. `202608030001_schedule_profile_permissions.sql`
10. `202608170001_part_15_5b_first_time_onboarding.sql`
11. `202608290001_profiles_privilege_hardening.sql`

The complete sequence rebuilds from zero and produces no readiness or security
failure. Hosted development has the intended final hardening, including exact
profile privileges and zero production-security-audit findings. No release
migration needs source correction or ad-hoc SQL. A new Preview Supabase project
must apply the complete sequence from zero; the reconstructed baseline must not
be applied over the existing development project's already-present base
objects.

No development-only insecure profile privilege is accepted for Preview or
production. The current intended final contract is authenticated SELECT plus
UPDATE only on `avatar_url`, `country`, `full_name`,
`onboarding_completed_at`, `timezone`, and `updated_at`.

## Security conclusion

- RLS is required and verified for user-owned tables.
- Two-user reads and representative updates/deletes/RPCs pass in both
  directions through ordinary authenticated clients.
- Shared `movies` metadata may be common; profiles, preferences,
  `user_movies`, lists, list membership, personal discovery inputs,
  statistics, settings, and exports remain private.
- No user-owned assertion used a service-role/admin bypass. The server-only
  secret client remains restricted to shared movie metadata and final deletion
  of the same freshly verified Auth user.
- Current-HEAD browser-artifact scanning found no client secret leak.
- Protected routes remain protected and public auth routes remain accessible.
- Signup remains six-digit OTP; recovery remains link-based.
- Account deletion remains guarded by confirmation, recent identity, and a
  dedicated disposable verification account.
- TMDB remains server-only and subject to the durable per-user limiter.

## Evidence gaps that do not block beginning Preview

- The current Windows host cannot start Playwright workers or Chrome for the
  automated authenticated suite. Equivalent core workflows have manual
  browser evidence, RLS/route evidence passes, and current Linux public browser
  CI passes. Fresh online authenticated browser automation should be rerun in
  Preview.
- CSV and JSON attachment response, content, and isolation are proven. The
  final browser-managed save/open experience was not explicitly recorded in
  the latest manual evidence and should be repeated in Preview.
- A fresh authenticated mobile/tablet sweep after the final hardening commit is
  deferred to Preview. Do not relabel it as a local Playwright pass.
- Real-device accessibility, network/performance measurements, production
  monitoring, backup/restore procedure, legal pages, and TMDB attribution/
  licensing are later Preview/public-beta/production gates as applicable. They
  are not evidence of a current application defect.

## Part 16 requirements

Part 16 may begin. It must:

1. create a separate production Supabase project;
2. apply all migrations from zero and rerun both SQL verification scripts;
3. deploy to a separately configured Vercel Preview environment;
4. configure Preview/production-scoped environment variables without copying
   development secrets into source or documentation;
5. configure Supabase Site URL, callback/recovery redirects, six-digit signup
   OTP email behavior, recovery links, and SMTP for the Preview origin;
6. run fresh online public and authenticated end-to-end tests, including
   mobile/tablet layouts and browser-managed exports; and
7. keep the Preview application disconnected from `watchflow-dev`.

No deployment, hosted schema mutation, production project creation, or commit
is performed by this evidence consolidation.
