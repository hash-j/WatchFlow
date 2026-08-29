# Part 15.5E Final Beta QA and Release Readiness

Date: 2026-08-30
Target: Part 16 Preview Deployment
Code baseline: `master` at `2bb576a`

## Final rerun result

**PASS - READY TO BEGIN PART 16 PREVIEW DEPLOYMENT.**

This supersedes the historical 2026-08-27 NO-GO result. The missing baseline,
development target-pin mismatch, dependency advisories, hosted catalog gaps,
profile privilege drift, auth prerender failure, live Auth/deletion gaps, and
clean Linux build/browser gaps have all been remediated or verified.

This is not public-production approval. Preview must use a new production
Supabase project, not `watchflow-dev`, and must complete the online deployment
checks listed in `docs/RELEASE_EVIDENCE.md`.

## Gate matrix

| Area | Result | Evidence |
|---|---|---|
| Repository/code provenance | AUTOMATED PASS | `HEAD`/`origin/master` are `2bb576a`; the latest green Release Quality run used that exact SHA; later changes are documentation only |
| Migration order/from zero | AUTOMATED PASS | All 11 chronological migrations apply to disposable PostgreSQL 18; readiness and security SQL pass |
| Hosted development readiness | AUTOMATED PASS | Required objects/backfills installed; zero missing profile/preference rows |
| Hosted security | AUTOMATED PASS | Profile hardening installed and hosted Section 7 reports zero findings |
| RLS/two-user isolation | AUTOMATED PASS | QA A/B live RLS 5/5; broader two-way authenticated reads/mutations/routes/exports pass |
| Signup/six-digit OTP | MANUAL PASS | Fresh delivered signup and six-digit verification completed |
| Onboarding | MANUAL PASS | Fresh onboarding completed; integration ownership/restoration also passes |
| Login/logout/session | MANUAL PASS | Established account/session behavior completed successfully |
| Password recovery | MANUAL PASS | Delivered link-based recovery completed successfully |
| Account deletion | MANUAL PASS | Dedicated disposable account completed the controlled application flow |
| Authenticated product workflows | MANUAL PASS | Dashboard, Search/TMDB, Library/detail/personal fields, Watch Next, Schedule, Lists, Picker, Recommendations, Statistics, and Settings exercised successfully |
| CSV/JSON data isolation | AUTOMATED PASS | Authenticated attachment routes contained current-user controlled data and excluded the other QA user's markers/email |
| Public responsive browser | AUTOMATED PASS | Current-HEAD Ubuntu Chrome Playwright passed in Release Quality |
| Authenticated responsive rerun | DEFERRED TO PREVIEW | Current Windows automated browser worker is environment-blocked; fresh deployed mobile/tablet run remains explicit Preview QA |
| Lint/TypeScript/tests/build/scan | AUTOMATED PASS | Current-HEAD Linux workflow passed all; current local lint/TypeScript and focused tests also pass |
| Windows Playwright/npm worker startup | BLOCKED - LOCAL WINDOWS ENVIRONMENT ONLY | `spawn EPERM` occurs before worker/browser/config startup; it is not an assertion or application failure |

## Items checked for missing evidence

- **Actual CSV/JSON data:** PASS through authenticated attachment responses and
  two-user content assertions. A browser-managed save/open replay is deferred
  to Preview because it is not explicitly present in the latest manual record.
- **Logout/login persistence:** MANUAL PASS through the completed account and
  session release smoke.
- **Authenticated mobile/tablet:** DEFERRED TO PREVIEW. Historical responsive
  coverage and current source contracts exist, but no fresh post-hardening
  Windows Playwright execution is claimed.
- **Fresh OTP/recovery/deletion:** MANUAL PASS using the proper fresh/disposable
  accounts and email flows.
- **TMDB live behavior:** MANUAL PASS for real authenticated search; live
  durable limiter coverage passes 10/10.
- **Hosted security and QA A/B isolation:** AUTOMATED PASS.

There is no unresolved FAIL item and no material pre-Preview workflow without
either passing evidence or an explicit Preview owner.

## Local consolidation checks

- `git diff --check`: PASS.
- `npm run lint`: PASS.
- `npx tsc --noEmit`: PASS.
- Guarded hosted RLS: 1 file/5 tests PASS.
- Focused ownership contracts: 7 files/77 tests PASS.
- Full Windows native-loader fallback: 73 files/727 tests PASS.
- Exact local `npm test`: BLOCKED before config load by Windows `spawn EPERM`;
  the exact command passes on current-HEAD Ubuntu CI.
- Local authenticated Playwright: BLOCKED before worker launch by Windows
  `spawn EPERM`; no local browser PASS is claimed.

## Final recommendation

Proceed to **Part 16 - Preview Deployment** using a new production Supabase
project and isolated Vercel Preview configuration. Do not connect the public
Preview deployment to `watchflow-dev`, and do not treat this decision as public
production launch approval.
