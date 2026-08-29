# WatchFlow Production Readiness

## Part 15.5F remediation decision

**NO-GO remains in effect, with three original hard blockers remediated.** The
development target guard passes, the repository rebuilds the complete schema
from zero in disposable PostgreSQL 18, both local SQL audits pass, and both
production-only and full dependency audits report zero vulnerabilities.

Guarded development RLS, onboarding ownership/restoration, limiter behavior,
OpenAPI contracts, and authenticated route reads pass. Preview is still
blocked until exact hosted development catalog SQL, browser-driven live QA,
disposable inbox OTP/recovery, separately authorized account deletion where
required, and a clean-environment build/Playwright run are recorded. The
Ubuntu workflow is prepared but unexecuted because this work is intentionally
uncommitted.

Do not apply `202607200001_base_schema.sql` to the existing development project.
Use it for a new FROM-ZERO project, or reconcile the existing project's
pre-repository objects through the supported reviewed migration-adoption
workflow after catalog verification. See
`docs/RELEASE_BLOCKER_REMEDIATION.md`.

## Part 15.5E release decision

**NO-GO for Preview deployment.** Static analysis, direct TypeScript, source
tests, repository hygiene, public route smoke, and browser secret scanning
pass. The release gate fails or is blocked on the missing base-schema
migration, exact development target mismatch, unresolved high-severity
transitive production audit findings, unavailable live authenticated/email/RLS
evidence, Playwright worker startup, and full Next build completion.

No production or development database mutation was performed during this
audit. Resolve every required action in `docs/FINAL_BETA_QA.md` before Part 16.

## Part 15.5C discoverability readiness

**Application implementation is local and uncommitted.** Authenticated desktop
and mobile navigation now share grouped Home, Your movies, Discover, Insights,
and Account information architecture. Major routes use canonical terminology,
short page-purpose descriptions, clearer empty states, more deliberate primary
actions, user-language error/helper copy, contextual back links, progressive
disclosure, and separated destructive actions. Settings uses Data & Account
with exports above the existing Danger Zone.

The milestone creates no migration, schema/RLS/privilege change, dependency,
environment variable, external integration, analytics, or major feature. The
existing security and tenant-isolation boundaries are unchanged.

The pre-edit real-app rendering audit used both configured guarded QA accounts
and received HTTP 200 from every protected static route plus available owned
detail routes. Interactive browser evidence remains environment-blocked by the
known Windows process restriction: Playwright workers fail with `spawn EPERM`
and direct Chrome startup fails with access denied. Source/unit contracts do
not replace the pending keyboard, console/network, focus, and viewport run.

See `docs/DISCOVERABILITY_UX_AUDIT.md` for the before/after IA, canonical terms,
route decisions, empty-state strategy, accessibility findings, required
viewport matrix, and remaining usability concerns.

### Part 15.5C local verification evidence (2026-08-26)

- `npm run lint` and `npx tsc --noEmit` passed.
- Focused discoverability/source coverage passed 4 files and 53 tests.
- The required `npm test` command hit Windows `spawn EPERM` before config load
  on two attempts. The runner-loader fallback passed the complete suite: 69
  files and 707 tests.
- Guarded discoverability Playwright loaded four cases and responsive
  Playwright loaded 17 cases. Each command hit `spawn EPERM` before worker
  startup on both attempts; direct Chrome launch was also access denied. No
  fresh interactive viewport, keyboard, focus, console, or network pass is
  claimed.
- The final `npm run scan:client-secrets` passed 260 current browser artifacts
  with no forbidden category or configured secret-value leak; an earlier
  pre-build run passed 325 artifacts.
- `npm run build` compiled the optimized production bundle successfully on two
  attempts, then hit `spawn EPERM` when Next launched its TypeScript worker.
  The direct TypeScript command passed; the full build remains
  environment-blocked rather than passed.
- `/auth/sign-up` returned HTTP 200. No migration, remote configuration, or QA
  data mutation was created or performed.

**Current milestone:** Part 15.5C - App Discoverability & User Friendliness.
**Next milestone:** Part 15.5D - Final Visual/UI Polish.

## Part 15.5B onboarding deployment gate

**Application implementation is local and the database change is not
applied.** Before deploying the onboarding code, review and manually apply
`supabase/migrations/202608170001_part_15_5b_first_time_onboarding.sql` to the
intended development/Preview project. Its exact SQL is reproduced in
`docs/DATABASE.md`; it adds the nullable completion timestamp, backfills all
existing profiles, revokes public/anon column update, and grants only that
column to `authenticated`. Do not apply it blindly to production.

After application, run both read-only SQL verification files and the guarded
onboarding integration test. Required evidence is: column installed, profile
RLS still enabled, no anonymous write, exact narrow authenticated grant,
existing-profile backfill complete, and QA A/B able to update only their own
completion state. Then run the guarded onboarding browser flow against the
same isolated environment with controlled movie queries.

The application deliberately treats a missing legacy profile as established
and routes a successful OTP verification to Dashboard if the optional field
cannot be read during a staggered rollout. This prevents existing accounts
from being trapped, but it does not replace applying and verifying the
migration. Real fresh signup, delivered six-digit OTP, and automatic
`/onboarding` routing still require the Part 15.5A hosted Auth configuration
and a disposable inbox; without them that end-to-end case is blocked.

**Current milestone:** Part 15.5B - First-Time User Onboarding.
**Next milestone:** Part 15.5C - App Discoverability & User Friendliness.

### Part 15.5B local verification evidence (2026-08-17)

- `npm run lint` passed without warnings after the implementation cleanup.
- `npx tsc --noEmit` passed.
- The focused onboarding/auth suite passed 8 files and 75 tests.
- The required `npm test` entry point failed before config load with the known
  Windows `spawn EPERM` on two sequential attempts. The supported
  `--configLoader runner` fallback then passed the complete unit/source suite:
  68 files and 688 tests.
- The onboarding integration file loaded with four tests correctly skipped by
  the absent explicit development/credential guard. No live database or
  two-user result is claimed.
- The onboarding Playwright file loaded with four cases correctly skipped
  because `E2E_TARGET_ENV=development` was not authorized. Responsive
  Playwright then hit `spawn EPERM` before a browser worker on two sequential
  attempts; no mobile/tablet/browser pass is claimed from this run.
- The final `npm run scan:client-secrets` passed across 260 current browser artifacts
  with no forbidden category or configured secret-value leak; the existing
  reviewed Supabase SDK prefix sentinel remained non-secret.
- `npm run build` compiled the application successfully on two sequential
  attempts, then failed when Next tried to spawn its TypeScript child with
  `EPERM`. Direct TypeScript passes, but the production build is correctly
  recorded as environment-blocked rather than passed.
- No migration, hosted Auth setting, QA data, or production/remote Supabase
  resource was changed. Delivered OTP-to-onboarding, installed-schema checks,
  live rate limiting, and two-user browser/database isolation remain blocked.

## Part 15.5A manual Supabase Auth gate

The application-side signup OTP flow is implemented locally. The hosted
development project could not be inspected from this workspace: there is no
`supabase/config.toml`, linked CLI metadata, available Management API
credential, or disposable signup inbox. Runtime environment values were not
read or exposed. Complete these
manual steps before treating email verification as operational:

1. In Supabase Authentication > Sign In / Providers > Email, keep Email enabled
   and keep email confirmation required. Do not enable autoconfirm.
2. Confirm the project emits **six digits**. WatchFlow accepts exactly six.
   Current Supabase email-OTP documentation describes six digits, but the
   actual hosted setting is the deployment source of truth.
3. Confirm Email OTP expiration. Supabase documents a one-hour default; record
   the actual project value. WatchFlow pending browser context is intentionally
   shorter at 15 minutes.
4. In Authentication > Rate Limits, review actual signup-email, resend,
   verification, and recovery limits. WatchFlow uses a 60-second resend
   countdown, matching Supabase's documented default per-address signup resend
   interval, and maps 429 responses safely. Supabase remains authoritative.
5. Preserve the existing custom SMTP sender/configuration. Do not switch to the
   restricted built-in mailer.
6. In Authentication > Emails > Confirm signup, set the subject to
   `Your WatchFlow verification code` and replace the body with the exact HTML
   below. It contains `{{ .Token }}` and no `{{ .ConfirmationURL }}`.
7. Preserve the Reset password template; recovery remains link-based.

```html
<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#171717;">
    <div style="max-width:560px;margin:0 auto;padding:40px 20px;">
      <div style="background:#ffffff;border:1px solid #e5e5e5;border-radius:16px;padding:32px;">
        <p style="margin:0 0 24px;font-size:18px;font-weight:700;">WatchFlow</p>
        <h1 style="margin:0 0 12px;font-size:26px;line-height:1.25;">Verify your email</h1>
        <p style="margin:0 0 24px;color:#525252;line-height:1.6;">Use this verification code to finish creating your WatchFlow account:</p>
        <div style="margin:0 0 24px;padding:18px;border-radius:12px;background:#f5f5f5;text-align:center;font-size:32px;font-weight:700;letter-spacing:8px;">{{ .Token }}</div>
        <p style="margin:0 0 12px;color:#525252;line-height:1.6;">This code expires according to the configured Supabase Auth OTP expiration.</p>
        <p style="margin:0;color:#737373;font-size:14px;line-height:1.6;">If you didn’t create a WatchFlow account, you can ignore this email.</p>
      </div>
    </div>
  </body>
</html>
```

Delivered signup OTP verification and delivered password-reset regression
remain blocked until those settings and a disposable inbox are available.
Once the Part 15.5B migration is installed, verified incomplete signup routes
to `/onboarding`; completed and established members route to `/dashboard`.

## Assessment

**Overall status: Needs Preview verification.**

The 2026-08-12 responsive milestone is implemented in the uncommitted working
tree. Shared page/layout/dialog/navigation primitives now provide a deliberate
mobile and tablet presentation, and automated public plus authenticated route
matrices report no page-level horizontal overflow. This improves local UI
readiness but does not replace the remaining Preview, database, email, and
destructive-account verification gates below. Full evidence and screenshot
locations are in `docs/RESPONSIVE_UX_AUDIT.md`.

Recorded responsive gate: lint, direct TypeScript, 611 unit/source-contract
tests, 13 public viewport cases, the final 10-case protected responsive matrix,
the five-viewport Statistics regression, the 35-shell production build, and
the 478-artifact client-secret scan passed. The live controlled TMDB
search/add/remove smoke timed out at search navigation and is not claimed as
passed; direct provider reachability returned HTTP 200. Account deletion was
not executed.

Part 15 hardening and test architecture are committed at `f6b15d4`, while the
required authenticated workflow matrix and live verification remain
incomplete. The repository may advance only to a controlled Part 16 Preview
environment to finish that work; this is not a production-launch approval. No
production deployment or production-domain configuration was performed. The
target Supabase schema, two-user isolation, delivered email links, and
destructive account deletion remain unverified.

Status meanings:

- **Ready**: repository implementation and the relevant recorded local checks
  are complete.
- **Needs Preview verification**: implemented locally, but must be exercised
  against the isolated Preview/development environment.
- **Blocked**: required evidence or infrastructure is absent.
- **Deferred**: intentionally outside Part 15 or the current product scope.

## Authentication

**Application implementation complete locally; Needs Preview verification.**
Signup is server validated and uses in-app six-digit Confirm signup email OTP
verification with short-lived pending-email state. Password login, logout,
forgot-password, callback/confirm, and reset/update routes remain. Focused and
full-fallback unit/source contracts pass. Valid delivered signup OTP,
login/logout/session persistence, and delivered recovery still require the
manual Auth configuration, disposable QA identity, and mailbox.

## Authorization

**Needs Preview verification.** Server mutations derive identity from
`auth.getUser()`, route/layout protection uses verified claims, browser input
does not supply `user_id`, owner filters are present, and RLS remains the final
boundary. Live foreign-ID and two-user mutation coverage is still required.

## RLS

**Needs Preview verification.** Version-controlled policies for preferences,
lists, memberships, and application RPCs are ownership based. The repository
does not include the original base policies for `profiles`, `movies`, and
`user_movies`. Run both read-only verification scripts and the guarded
integration/browser isolation suites against the confirmed development
project.

## Database privileges

**Needs Preview verification.** SQL grants give authenticated preferences
SELECT/INSERT/UPDATE and no DELETE, restrict list/membership operations, and
expose the limiter RPC without exposing its table. Anonymous access should be
absent. Effective target privileges must be checked because a committed
migration does not prove remote installation.

## Environment variables

**Needs Preview verification.** Required names are documented in
`.env.example` and `docs/TESTING.md`. Part 16 must configure separate Preview
values and validate safe missing-variable behavior. Actual values must remain
outside Git and documentation.

## Secrets

**Ready for local code review; Needs Preview verification operationally.**
Admin/TMDB modules are server-only; the admin client cannot persist sessions
and requires verified identity. The recorded built-artifact scan found no
forbidden pattern or configured secret-value leak. Part 16 must repeat the scan
using the final Preview build and inspect HTML/console/network behavior without
recording credentials.

## TMDB integration

**Needs Preview verification.** Provider calls are server-only, bounded by an
eight-second timeout, safely mapped, and covered by durable per-user limits once
the migration is applied. Search preferences and cache-safety metadata are
respected. Live provider failure/429 and preference behavior needs QA.

## Rate limiting

**Needs Preview verification.** The architecture is database-backed and safe
for multiple app instances: search 30/60 seconds, details 20/60 seconds, import
search 120/600 seconds, and import details 120/600 seconds per authenticated
user. No unauthenticated TMDB endpoint exists. The Part 15 migration is not
applied, so TMDB-backed operations must fail closed until it is installed and
tested for expiry and user separation.

## Upload limits

**Ready.** CSV input is memory-only and bounded to 2 MiB, 500 non-empty rows,
100 reconstructed columns, 10,000 characters per cell, and 4 MiB of validated
temporary JSON. Server Actions have a 6 MiB transport ceiling, and confirmation
accepts at most 500 row decisions. Preview must still exercise browser MIME/
size behavior.

## CSV safety

**Ready for repository behavior; Needs Preview verification for full import.**
Parsing handles quotes/newlines/BOM, personal fields are validated, uploaded
content is not persisted/logged, provider concurrency is bounded, and export
plus failure-report cells neutralize spreadsheet formulas. Full live
match/review/partial-failure/queue-order testing remains.

## Error handling

**Ready for local boundaries; Needs Preview verification for service
failures.** The app shell plus library, search, import, lists, picker,
recommendations, Statistics, and settings have controlled error boundaries. Movie/list
not-found states are nonrevealing. Auth/provider/database errors map to safe
messages; raw stack/Postgres details are not rendered. Preview must exercise
session expiry and unavailable services.

## Logging

**Needs Preview verification.** Development Supabase logs contain only a
validated error code and broad category and are disabled in production.
Browser diagnostics redact identifiers and never retain request headers or
bodies. There is no centralized production log, retention, alerting, or
redaction audit.

## Caching

**Needs Preview verification.** Shared `movies` is a 30-day canonical-English
TMDB details cache when timestamp and adult-safety metadata match. Preferred
language applies to request-scoped search, not the one-row-per-`tmdb_id`
persistent cache. Stale rows refresh through authenticated rate-limited server
logic and upsert by `tmdb_id`. Private data is request scoped and never
globally cached. In-process promise deduplication is only an optimization;
cross-instance refresh leasing is deferred until metrics justify it.

## Images

**Ready for source behavior; Needs Preview verification on real networks.**
TMDB is the only remote image hostname/path, posters use `next/image`, reserved
aspect ratios, responsive `sizes`, appropriately small source sizes, lazy
loading by default, meaningful/decorative alt behavior, and runtime missing/
failed-image fallbacks. Slow-network and remote 404 behavior needs browser QA.

## Pagination

**Needs Preview verification.** Library filtering/count/range is server-side
and uses the member's page-size preference with URL persistence and page
clamping. List add is capped at 50 results, recommendations at 16, discovery at
1,000 relationships, Statistics at 1,000 analyzed relationships with an exact
total/partial-coverage notice, and Watch Next at 500 with an explicit
truncation notice. TMDB search currently returns provider page one without application pagination.
List summaries and dashboard/schedule legacy reads also remain unpaginated;
monitor their target sizes during Preview rather than adding speculative
pagination.

## Database indexes

**Ready for current source workload; Needs Preview query plans.** Existing
primary/unique/partial and Part 12/13 indexes cover current owner, status,
favourite, rating, watched, queue, schedule, list-update, membership-order, and
reverse-membership queries. The Part 15 limiter primary key supports its exact
user/operation access. Part 15.1 Statistics reuses those owner/time/status
indexes for one bounded private read and adds no speculative aggregate,
metadata, or genre index. Capture
representative Preview query plans before changing this decision.

## Backups

**Blocked.** No evidence documents Supabase backup/PITR configuration, restore
testing, retention, or ownership. Part 16 must record the Preview policy;
production requires a tested restore procedure.

## Email delivery

**Blocked operationally.** The in-app Confirm signup OTP implementation and
copyable template are ready, while notification delivery remains out of scope.
The hosted project still needs the documented six-digit/template/expiry/rate
review, preserved custom SMTP, a QA inbox, delivered-code verification, and a
delivered password-reset link regression.

## Monitoring

**Blocked.** No production error monitoring, availability checks, database
alerts, rate-limit metrics, import/provider latency telemetry, or on-call
response process is configured.

## Analytics

**Deferred.** No analytics product or consent model is implemented. Add only
after privacy/legal review; it is not required for core Preview QA.

## Personal viewing Statistics

**Implemented as uncommitted Part 15.1 work; local verification passed.** The
protected `/statistics` page calculates only the signed-in member's library
metrics on the server after `auth.getUser()`, an explicit owner filter, and
RLS. It uses neither global/product analytics nor third-party tracking and adds
no public statistics, comparisons, leaderboards, predictions, or AI insights.

The implementation provides ten documented summary metrics, status/genre/
rating distributions, a 12-month watched timeline, top-rated watched and
recently watched lists, bounded-coverage messaging, distinct empty states, and
safe loading/error UI. Missing ratings/runtime/dates remain unavailable rather
than becoming false zero/activity values. The one private dataset query is
bounded to 1,000 relationships; an exact count identifies larger libraries.
No migration, RPC, dependency, environment variable, or shared cache was
added. Lint, TypeScript, 62 focused Statistics tests, the 596-test full suite,
post-build secret scanning, and the production build passed; `/statistics`
appears in the route table. Public/protection Playwright passed, while all 10
credentialed Statistics cases were guarded/skipped. Two-user and controlled-
data checks therefore remain a Preview gate.

## Legal pages

**Blocked.** Privacy, terms, acceptable-use/contact, retention/deletion
statements, cookie disclosure where applicable, and company/operator
information are absent.

## TMDB attribution

**Blocked.** Required attribution UI and a resolved licensing/commercial-use
review are absent. Do not treat provider access as approval for a paid launch.

## Production Supabase separation

**Blocked.** No evidence establishes an isolated production project, complete
versioned baseline schema, production policies/grants, Auth templates, SMTP,
backup plan, or a safe migration promotion procedure.

## Vercel environment separation

**Blocked.** No Preview/Production project configuration, scoped environment
values, deployment protection, build retention policy, or access-control
record exists. Part 16 owns Preview deployment.

## Domain and redirects

**Blocked.** Production domain, HTTPS/domain ownership, Supabase Site URL,
allowed callback/recovery URLs, canonical metadata URL, and external redirect
tests are not configured or verified.

## Accessibility

**Needs Preview verification.** Semantic headings/labels, announced
auth/mutation/errors, visible focus, status/favourite text plus icons, minimum
button target sizes, current-route state, loading announcements, and meaningful
empty states are present. Part 15.1 Statistics adds visible chart counts and
percentages, screen-reader summaries, text status/rating labels, and semantic
sections rather than color-only meaning. The public sign-up route is covered at five
viewports. There is no automated axe integration, and protected pages/dialog
focus/keyboard behavior still require authenticated manual/browser QA.

## Performance

**Needs Preview verification.** Focused improvements remove the browser
Supabase SDK from logout, replace queue resequencing updates with one RPC,
query only Watch Next rows, bound queue/import/discovery/recommendation/list-
picker/Statistics work, deduplicate provider requests, and reuse shared
metadata.

The final raw route-entry audit measured `/library` at 486,629 bytes (largest),
signup at 333,136, login at 332,827, import at 218,819, list detail at 214,464,
and picker at 214,351. The complete static chunk directory contained 47 files
and 1,746,342 raw bytes. These are uncompressed build-artifact figures, not
browser transfer or Core Web Vitals measurements; Preview still needs network,
render, and interaction profiling.

| Problem/evidence | Fix | Remaining limitation |
|---|---|---|
| Browser Supabase logout code was shared by protected routes | Cookie-aware logout Server Action removes that client dependency from the shell | `/library` is still the largest raw route entry at 486,629 bytes; inspect compressed transfer and hydration cost in Preview |
| Watch Next used the legacy full-library read | Database-filter/sort queue rows and return at most the first 500 | Queues beyond 500 use an honest truncation state rather than pagination |
| Status/schedule changes could resequence the queue row by row | One authenticated `watchflow_normalize_queue()` RPC | Concurrent appends still rely on database uniqueness and should receive live contention testing |
| Repeated renders/double submissions could duplicate provider calls | Stable in-flight keys at user search, shared details, and provider URL layers | Promise maps are process-local; cross-instance refresh leasing is deferred |
| TMDB details were fetched without a freshness reuse contract | 30-day compatible shared `movies` cache | Preview needs cache hit/refresh metrics and stale-refresh concurrency evidence |
| CSV rows could repeat searches/details | Normalized lookup/detail caches, four-search concurrency, bounded batches | A maximum-size 500-row import still needs Preview duration/provider testing |
| Discovery/list picker/recommendations could grow | Explicit 1,000/50/16 result caps | List summaries and movie-detail list selector retain documented unpaginated/bounded MVP behavior |
| Personal Statistics could download an unbounded private library or add one query per card | One exact-column owner query analyzes at most 1,000 rows and calculates every card/distribution on the server | Larger libraries receive an exact-total/partial-coverage notice; reconsider database aggregation after measured Preview demand |

## Dependencies

**Ready.** Next and `eslint-config-next` are aligned at 16.2.12. The ESLint
configuration uses Next 16's native flat-config exports, and overrides select
patched Next-internal PostCSS and Sharp versions. The recorded production-only
and full npm audits both found zero vulnerabilities. Continue routine review
and do not use forced automated dependency fixes without inspecting their
framework/tooling changes. Part 15 added no paid service and no new runtime
package; it reuses PostgreSQL/Supabase for durable limiting and the existing
Vitest/Playwright toolchain for tests.

## Final local verification

| Check | Recorded result |
|---|---|
| ESLint | Ready — completed successfully |
| Direct TypeScript | Ready — `npx tsc --noEmit` completed successfully |
| Unit/source/contract tests | Part 15.5A assertions pass — focused 5 files/42 tests; full runner-loader fallback 62 files/637 tests. Required `npm test` is environment-blocked by `spawn EPERM` before config load on two sequential attempts |
| Supabase integration | Needs Preview verification — command completed with all 5 tests skipped by the absent development/credential guard |
| Playwright Part 15.5A | Blocked by runner environment — auth spec loads/lists all 10 tests, but two sequential execution attempts failed with `spawn EPERM` before server/browser startup |
| Playwright MCP | Ready for public smoke only — clean-restart public routes passed; authenticated workflows/screenshots blocked |
| Dependency audits | Ready — production-only and full audits both reported 0 vulnerabilities |
| Production build | Environment-blocked — two sequential runs compiled successfully, then Next failed to spawn its TypeScript child with `spawn EPERM`; direct `npx tsc --noEmit` passes |
| Client secret scan | Ready locally — current incomplete-build output contained 251 browser artifacts; no forbidden/configured-value leak and one reviewed Supabase SDK sentinel |
| Live database catalog/RLS | Needs Preview verification — SQL files are ready but were not run against a confirmed disposable target |

Part 15.1 Statistics gate: **Local gate passed; authenticated QA blocked.** The
current implementation remains uncommitted. Lint, TypeScript, 62 focused and
596 full Vitest tests, 35 safe Playwright checks, the 478-artifact post-build
secret scan, and the production build passed. Fifteen browser cases were
guarded/skipped, including all 10 authenticated Statistics cases; none is
claimed as passing.

## Known blockers

1. Apply and verify the outstanding database migrations, including
   `202607300001_part_15_tmdb_rate_limits.sql`.
2. Run the read-only readiness/security scripts and resolve every missing or
   unsafe result.
3. Complete two-user authenticated workflow and RLS/privilege QA.
4. Complete the disposable account-deletion run and confirm cascades plus
   shared metadata preservation directly.
5. Verify confirmation and password-reset email delivery/end-to-end links.
6. Configure Preview environment separation, backups, monitoring, SMTP, and
   access controls.
7. Add legal pages and TMDB attribution/licensing evidence before a public or
   paid launch.
8. Run guarded authenticated/two-user Statistics QA when disposable
   credentials and controlled data are available; the local gate and
   `/statistics` production route output are complete.

## Recommendation

Proceed to **Part 16 — Preview Deployment** only as an isolated, access-limited
QA environment. Apply migrations manually in reviewed order, run catalog
verification, provision disposable QA identities, and finish the blocked
browser/database checks there. Do not open production registration or claim
production readiness until every Blocked item above has an accountable owner
and verified result.
## Part 15.5D status

Visual polish is implemented as application/CSS changes only. No migration,
RLS, grants, or authentication configuration changes were introduced. Final
beta regression and release QA is deferred to Part 15.5E.
