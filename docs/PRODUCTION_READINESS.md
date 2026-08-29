# WatchFlow Production Readiness

Last reviewed: 2026-08-30
Current gate: Part 15.5E complete; Part 16 Preview may begin

## Decision boundary

**Ready for an isolated Preview deployment. Not approved for public production.**

The final evidence is consolidated in `docs/RELEASE_EVIDENCE.md`. Current code
at `2bb576a` has a green clean-Ubuntu Release Quality workflow, a complete
from-zero migration path, hardened hosted development privileges, real Auth
and account-deletion smoke, manual authenticated workflow evidence, and
two-user RLS/isolation evidence.

Preview must use a newly created production Supabase project and separate
Vercel environment configuration. It must never point at `watchflow-dev`.

## Pre-Preview gates

| Gate | Status |
|---|---|
| Complete version-controlled database baseline | AUTOMATED PASS |
| All 11 migrations rebuild from zero | AUTOMATED PASS |
| Migration order and security contracts | AUTOMATED PASS |
| Hosted development readiness audit | AUTOMATED PASS |
| Hosted profile privilege hardening | AUTOMATED PASS |
| Hosted production security audit | AUTOMATED PASS - zero findings |
| RLS and two-user isolation | AUTOMATED PASS |
| Fresh signup, six-digit OTP, onboarding | MANUAL PASS |
| Login/session and link-based recovery | MANUAL PASS |
| Controlled disposable account deletion | MANUAL PASS |
| Core authenticated product workflow | MANUAL PASS |
| Clean Linux install/lint/type/test/build/scan | AUTOMATED PASS |
| Public responsive Chrome suite | AUTOMATED PASS |
| Local Windows authenticated Playwright | BLOCKED - LOCAL WINDOWS ENVIRONMENT ONLY |

There is no known FAIL item blocking creation of the isolated Preview.

## Database readiness

The version-controlled sequence starts with
`202607200001_base_schema.sql` and ends with
`202608290001_profiles_privilege_hardening.sql`. A clean PostgreSQL 18 runner
applies the bootstrap and every migration in filename order, then runs both
read-only verification scripts. The current-HEAD Linux workflow passes this
gate.

Hosted development is at the intended final contract:

- required tables, columns, functions, policies, constraints, indexes,
  triggers, and backfills pass readiness verification;
- profile/preference backfills have zero missing rows;
- `public.profiles` gives authenticated table SELECT only;
- authenticated profile UPDATE is column-scoped to `avatar_url`, `country`,
  `full_name`, `onboarding_completed_at`, `timezone`, and `updated_at`;
- authenticated profile INSERT, table UPDATE, DELETE, TRUNCATE, REFERENCES,
  and TRIGGER are absent;
- anonymous profile access is absent; and
- the hosted production security audit returns zero findings.

No source migration requires manual correction. Do not apply the reconstructed
baseline over the existing development project's base objects. Do apply the
complete sequence from zero to the new Preview Supabase project, then rerun
both SQL verification scripts before connecting the application.

## Authentication and tenant security

- Public login, sign-up, verify-email, forgot-password, update/reset-password,
  and error routes remain present. Request-dependent public-auth checks are
  isolated behind focused Suspense boundaries and pass the production build.
- Signup remains a six-digit Supabase email OTP flow. Recovery remains
  link-based through the allowlisted callback/update-password path.
- Protected routes require refreshed Supabase claims and authenticated
  server-side boundaries. Mutations and exports use fresh Auth user checks.
- User identity is never accepted from browser input. Ordinary user-owned work
  uses the cookie-bound authenticated client with explicit ownership and RLS.
- Profiles, preferences, personal library fields, queue/schedule state, lists,
  discovery inputs, statistics, settings, and exports pass two-way QA A/B
  isolation checks.
- Shared `movies` metadata is intentionally common. Browser roles cannot use
  the server-only secret client to write it.
- The admin client remains limited to shared movie metadata after verified Auth
  and final deletion of that same freshly verified Auth user.
- Account deletion requires exact confirmation, an explicit checkbox, recent
  sign-in, and the dedicated server-side flow. The disposable live test passed.

## Provider, uploads, and exports

- TMDB requests are server-only, have an eight-second timeout, map provider
  errors safely, and use per-authenticated-user PostgreSQL fixed windows.
- Live limiter behavior passes 10/10, including user/operation separation,
  expiry, thresholds, invalid input, and concurrency.
- CSV import remains memory-only and bounded to documented file, row, column,
  cell, payload, decision, and concurrency limits.
- CSV and JSON exports are authenticated, owner-filtered, private no-store
  attachments. CSV values are formula-neutralized.
- Two-user export content checks pass. A final browser-managed save/open replay
  is deferred to online Preview QA rather than represented as a local browser
  pass.

## Build, dependency, and secret readiness

The latest successful GitHub Release Quality workflow is tied to the current
code HEAD and passes:

1. locked `npm ci` installation;
2. PostgreSQL 18 from-zero rebuild plus both SQL audits;
3. lint;
4. direct TypeScript;
5. complete unit/source tests through the exact `npm test` command;
6. production Next.js build;
7. post-build client secret scan;
8. Chrome installation; and
9. public responsive Playwright.

Production-only and full dependency audits previously returned zero
vulnerabilities after compatible patch-level remediation. No forced or major
dependency change was accepted.

Local Windows still denies some Node/Chrome child processes with `spawn
EPERM`. Local lint, direct TypeScript, guarded integration, focused tests, and
the full native-loader fallback pass. Linux CI is authoritative for the exact
test entry point, production build, and public browser run.

## Preview deployment checklist

Part 16 owns the following **DEFERRED TO PREVIEW** work:

1. Create the separate production Supabase project.
2. Apply all migrations from zero and rerun readiness/security SQL.
3. Create/configure an isolated Vercel Preview deployment.
4. Configure production-scoped Supabase public/secret values, the TMDB token,
   and the public application origin without exposing values in Git or docs.
5. Configure Supabase Site URL and allowed callback/recovery redirects for the
   Preview hostname.
6. Configure and verify six-digit signup OTP, recovery links, SMTP, expiry,
   and rate limits for the new project.
7. Run fresh online public and authenticated end-to-end tests, including
   logout/login persistence, browser-managed CSV/JSON downloads, current
   mobile/tablet authenticated layouts, dialogs, console/network diagnostics,
   and two-user identifiers.
8. Record Preview backup/PITR availability, monitoring/log ownership, access
   restrictions, and rollback steps.

Optional custom-domain attachment remains within Part 16. Production domain,
public registration, and public traffic are not authorized by this document.

## Later public-beta/production gates

The following do not block beginning an access-limited Preview but must receive
owners before the applicable public-beta or production milestone:

- real-device and assistive-technology review;
- performance/Core Web Vitals and representative query-plan measurements;
- centralized error monitoring, availability checks, alerting, and incident
  response;
- tested backup/restore and retention procedures;
- privacy, terms, acceptable-use/contact, deletion/retention, and operator
  information;
- TMDB attribution and licensing/commercial-use review; and
- production domain, canonical metadata, redirects, and release rollback.

Notification delivery, calendar integration, analytics, and payments remain
product-roadmap items rather than hidden Preview requirements.

## Recommendation

Begin **Part 16 - Preview Deployment**. Keep it isolated and access-limited,
use a new production Supabase project, and complete the deferred online checks
before any public-production decision.
