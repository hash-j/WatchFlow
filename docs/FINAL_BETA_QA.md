# Part 15.5E Final Beta QA and Release Readiness

Date: 2026-08-27  
Target: Part 16 Preview Deployment

## Executive result

**Overall: FAIL — NO-GO for Preview deployment at this time.**

The committed application passes static analysis, direct TypeScript, the full
unit/source fallback, repository hygiene, public HTTP route smoke, and browser
artifact secret scanning. It is not yet proven release-ready because the exact
development Supabase URL guard does not match, the repository cannot build the
database from zero without its missing base migration, live tenant isolation
and critical workflows could not run, Playwright workers are blocked by
Windows `spawn EPERM`, and the production dependency audit reports unresolved
high-severity transitive findings.

No production project, remote schema, Auth configuration, or user data was
modified. No live mutation was attempted after the target guard failed.

## Gate matrix

| Area | Result | Evidence / blocker |
|---|---|---|
| Repository health | PASS | Clean Part 15.5D commit, no conflicts, `git diff --check`, ignored local env and QA output paths, no tracked secrets/artifacts |
| Incremental migration order | PASS | Nine unique chronological versions; dependent privilege/onboarding patches follow their prerequisites |
| From-zero schema rebuild | FAIL | Original `profiles`, `movies`, and `user_movies` creation migrations are absent |
| Migration source security | PASS | Reviewed RLS, ownership, scoped grants, and RPC execution contracts for version-controlled objects |
| Live database/RLS/ACL audit | BLOCKED | Configured and expected Supabase URLs do not exactly match; catalog verification was not run |
| Admin-client boundary | PASS | `server-only`; restricted to shared movie metadata and final same-user Auth deletion; browser scan passes |
| Authentication and signup OTP | BLOCKED | No authorized live target/inbox; Playwright worker startup fails |
| Password recovery | BLOCKED | Delivered recovery email/link and used/expired-link behavior require authorized live target/inbox |
| Onboarding | BLOCKED | Guard prevents live profile/preferences/library mutations |
| Dashboard | BLOCKED | Source/unit coverage passes; authenticated data accuracy and isolation were not executed |
| Search and TMDB | BLOCKED | Source/unit coverage passes; live provider/add/duplicate/rate-limit behavior was not authorized |
| Library and movie details | BLOCKED | Source/unit coverage passes; authenticated filter/bulk/persistence/privacy matrix was not executed |
| Watch Next and Schedule | BLOCKED | Source/unit/migration contracts pass; live ordering, timezone, and two-user behavior were not executed |
| Custom Lists | BLOCKED | Source/unit/migration contracts pass; live CRUD/order/isolation was not executed |
| Picker and Recommendations | BLOCKED | Pure rule tests pass; authenticated dataset/filter/isolation behavior was not executed |
| Statistics | BLOCKED | Pure calculation/query contracts pass; live per-user accuracy/revalidation was not executed |
| CSV Import | BLOCKED | Parser/mapping/matching/service tests pass; live matching/import/rate-limit workflow was not authorized |
| Settings and exports | BLOCKED | Validation/export/security contracts pass; live persistence/download/privacy workflow was not executed |
| Account/library deletion | BLOCKED | Exact target guard fails and one-shot deletion authorization is disabled |
| Public route HTTP smoke | PASS | Landing/auth routes return 200; Dashboard/Library/Settings return 307 to login |
| Responsive/browser/accessibility | BLOCKED | Existing source contracts pass; Playwright fails before its worker with `spawn EPERM` |
| Unit/source suite | PASS | Runner-loader fallback: 70 files, 712 tests after the Part 15.5E migration-order contract |
| Required `npm test` entry point | BLOCKED | Two isolated attempts fail before config load with Windows `spawn EPERM` |
| Client secret scan | PASS | 260 browser artifacts; no forbidden category or configured secret-value leak |
| Production build | BLOCKED | Bundle compilation succeeds; Next TypeScript child fails twice with `spawn EPERM`; direct TypeScript passes |
| Production dependency audit | FAIL | Three high-severity transitive Next/PostCSS/Nanoid findings; npm reports no fix available |

## Recorded command results

- `npm run lint`: PASS.
- `npx tsc --noEmit`: PASS.
- Migration-order contract: PASS, 1 file / 3 tests.
- Full unit/source fallback: PASS, 70 files / 712 tests.
- Required `npm test`: BLOCKED on repeated `spawn EPERM` before config load.
- Guarded integration selection: 3 files / 19 tests loaded and skipped because
  the exact target pin failed; no live call was made.
- Guarded authenticated/discoverability/Statistics selection: 18 tests loaded
  and skipped. Onboarding: 4 loaded/skipped. Account deletion and TMDB limiter:
  2 loaded/skipped.
- Public authentication/protected Playwright: BLOCKED before the first worker
  on two attempts with `spawn EPERM`.
- Responsive Playwright: 17 guarded cases skipped, then the public worker was
  BLOCKED by `spawn EPERM`.
- `npm run scan:client-secrets`: PASS, 260 artifacts.
- `npm run build`: BLOCKED after successful optimized bundle compilation when
  Next attempted to spawn its TypeScript child; repeated attempts behaved the
  same. Direct TypeScript passes.
- `npm audit --omit=dev`: FAIL, 3 high-severity transitive findings with no
  available fix. Full audit: FAIL, 31 findings (21 high, 10 moderate).

## Migration and database findings

The migration timestamps are unique and ordered. Later function replacements
retain compatible signatures for personal movie updates and scheduling.
Version-controlled migrations enable RLS and owner checks for preferences,
lists, memberships, and the internal rate limiter; functions derive identity
from `auth.uid()` and revoke unintended public/anonymous execution.

The repository is nevertheless not a complete schema source. It begins with
Phase 3 functions that already depend on deployed `profiles`, `movies`, and
`user_movies` objects. Part 16 must either add a reviewed baseline migration or
explicitly adopt and verify an existing development database before Preview.
The two read-only catalog scripts must then report no missing required object,
policy, privilege, function, constraint, or index.

## Security findings

No normal user-owned operation uses the admin client to bypass RLS. The admin
factory imports `server-only`, requires a previously verified user, and reads
only the server secret variable. Approved call sites are shared `movies`
metadata and deletion of that same freshly verified Auth user. The application
source does not use Nanoid custom generators; the reported Nanoid advisory is
transitive through build tooling, but remains a failing release audit until an
upstream resolution or documented risk acceptance exists.

## Required actions before Preview

1. Correct the independently pinned development Supabase URL so it exactly
   matches the application target without exposing either value.
2. Resolve the missing base-schema migration/provenance decision and run both
   read-only catalog verification scripts against the confirmed development
   project.
3. Resolve or formally assess the production dependency audit findings.
4. Run the complete guarded integration and authenticated Playwright matrices,
   including disposable signup/recovery inboxes and the separately authorized
   deletion account.
5. Re-run Playwright and the complete Next build in an environment that permits
   child-process startup.

No section marked BLOCKED is represented as passing.
