# WatchFlow Production Readiness

## Assessment

**Overall status: Needs Preview verification.**

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

**Needs Preview verification.** Email/password signup, confirmation state,
login, cookie sessions, logout, forgot-password request, callback/confirm
handlers, and reset/update routes exist. Public route regressions and invalid
local/auth-callback behavior are covered. Valid signup/login/logout,
unconfirmed behavior, email delivery, and delivered-link flows require
disposable QA users and a mailbox.

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

**Blocked.** Notification delivery is intentionally unimplemented. Auth
confirmation/password-reset email needs configured SMTP/templates, a QA inbox,
rate-limit review, and delivered-link tests. Supabase's development mailer is
not production evidence.

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
| Unit/source/contract tests | Ready — 59 files, 596 passing |
| Supabase integration | Needs Preview verification — command completed with all 5 tests skipped by the absent development/credential guard |
| Playwright safe selected suite | Ready for public regression — 35 passing, 15 guarded/skipped (including 10 authenticated Statistics cases), automatic redacted console/network assertions; account deletion excluded |
| Playwright MCP | Ready for public smoke only — clean-restart public routes passed; authenticated workflows/screenshots blocked |
| Dependency audits | Ready — production-only and full audits both reported 0 vulnerabilities |
| Production build | Ready locally — Next.js 16.2.12 build passed, completed the 35-page generation step, and listed `◐ /statistics` |
| Client secret scan | Ready locally — 478 artifacts checked, no forbidden/configured-value leak; one reviewed Supabase SDK sentinel |
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
