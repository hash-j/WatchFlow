# WatchFlow v1.0 web/PWA release checklist

Updated: 2026-11-04. Branch: `codex/part-18-production-operations`.
WatchFlow v1.0 is **movies only**. No commit, push, Production deployment,
migration, QStash/calendar operation or Android/device testing is performed by
this checklist. Prior approved list/password/artwork behavior is preserved.

## Status definitions

- **READY**: implemented and supported by the evidence recorded here.
- **MANUAL ACTION**: owner input, environment access or human acceptance is needed.
- **ANDROID PHASE**: deferred until web acceptance; do not start now.
- **POST-V1**: excluded from the v1 release candidate.

## Web candidate validation

| Classification | Item | Latest evidence |
| --- | --- | --- |
| READY | Deterministic local font | Checked-in Geist WOFF2, local loader, OFL and provenance. No Google Fonts build/runtime request |
| READY | CRLF-sensitive tests | All seven fixed at the test-read boundary; exact SQL assertions unchanged. 21 focused checks pass, including LF/CRLF and changed-token/whitespace rejection |
| READY | Full unit/source suite | 148 files, 1,236 tests passed; zero failed/skipped |
| READY | Compatible dependency updates | Preserved prior Next 16.4.4/Sharp 0.35.5/Zod 4.6.6 fixes. Updated eslintrc 3.3.7 and matching TypeScript-ESLint 8.72.1 packages within existing major/ranges |
| READY | Production dependency audit | Separate `npm audit --omit=dev` reports zero findings |
| READY | Complete audit reviewed | 16 moderate development-only package records from one minimatch advisory; zero high/critical. Exact chains, versions and lack of compatible advisory fixes are in WEB_RELEASE_AUDIT.md. No application runtime exposure from these copies |
| READY | Production build | Next 16.4.4 compilation, TypeScript and 49/49 page generations pass; standard build runs outside this host's Windows sandbox for worker startup |
| READY | ESLint / direct TypeScript | Both commands completed successfully |
| READY | Browser secret boundary | Post-build scan passed across 487 browser/rendered artifacts; no forbidden secret names/values |
| READY | Auth redirect cookie propagation | Earlier fix preserved, including two passing runtime regression tests |
| READY | Read-only live RLS integration | Hashim reports the rerun after local credential refresh passed five read-only cases; one push-subscription write case was intentionally excluded/skipped. No authentication failure, application data write, destructive suite or calendar/QStash tests. This is owner-reported successful execution, not a new agent-run login |
| READY | Scheduled reminder operational acceptance | **PASS; end-to-end PASS** (owner-approved 2026-11-10). Hashim confirmed the Chrome/Windows push appeared on screen and the in-app "Scheduled movie reminder" shows at 12:32 AM Karachi. On watchflow-dev-ops (HEAD 80754b3, VAPID configured), a QStash tick at 19:32Z delivered automatically: 1 job `push_delivered`, 1 delivery accepted by the push service, 1 in-app notification. The pre-due tick was a no-op; bearer and VAPID were verified; isolation held; calendar stayed paused; the reminder schedule was re-paused. Same-version repeat-tick idempotency is covered by the existing automated tests (29/29 focused tests passed), not live evidence. Blockers found and fixed during acceptance: the dev Supabase project was paused, the dev project had no VAPID variables, and the deployment was stale. See V1_REMINDER_RELEASE_ACCEPTANCE.md |
| READY | Public production browser checks | Fresh full sweep: 15/15 passed with zero retries. Includes PWA, public-content and 13 responsive cases covering all new public pages. One earlier Chrome teardown timeout passed on a focused rerun and the subsequent full sweep |
| READY | Signup route stability | Public production browser checks returned HTTP 200 for `/auth/sign-up` and rendered the expected form |
| READY | Scope/diff hygiene | No SQL migrations or application calendar/scheduler behavior changed; no commit/push/deploy |

The earlier full unit run's seven failures are resolved. See
[WEB_RELEASE_AUDIT.md](WEB_RELEASE_AUDIT.md) for exact causes, assertion inventory,
dependency matrix, content evidence, read-only integration command and file list.
Hashim completed the local QA credential refresh and successful read-only RLS
rerun. Credentials remain private and are not inspected or recorded here.

## Public release information

| Classification | Item | Location / remaining action |
| --- | --- | --- |
| READY | Privacy Policy | `/privacy`: account/profile, movies/reviews/schedules, private artwork, import/export, Google connection/events/grants, notifications/push, cookies/theme/offline cache and actual services |
| READY | Terms / acceptable use | `/terms`: movie-organizer purpose, account security, lawful content/use, provider rights and best-effort integrations; no invented jurisdiction/company/address |
| READY | Operator identity | WatchFlow, explicitly supplied by Hashim |
| READY | Data-deletion guidance | `/data-deletion`: browser self-service, recent login, exact confirmations, export, active-data scope, external-copy/log/backup limits and separate Google disconnect cleanup |
| READY | TMDB attribution | `/about`: exact required non-endorsement wording, approved unmodified official logo, proportional original colors and link to TMDB; asset provenance recorded |
| READY | Discoverability | Public footer on homepage/auth/app and additional Settings Help and policies links; all five pages require no login |
| READY | Working support/privacy contact | Owner-approved `hashim.ghub@gmail.com` is published as a mailto link on all five public information pages and the shared footer, reachable from Settings. No SMTP/Brevo or authentication sender configuration changed |
| READY | Public content verification | Re-reviewed `/privacy`, `/terms`, `/data-deletion` and `/about` against the existing implementation and successful public browser evidence. Data use, external copies and deletion limits are explicit; no fabricated contact, fixed backup/log retention or delivery guarantee |

Public self-service deletion instructions are ready. Account-access, privacy
and deletion assistance can be requested at [hashim.ghub@gmail.com](mailto:hashim.ghub@gmail.com).
No public support-contact placeholders or public-content blockers remain.
The controlled development reminder acceptance passed on 2026-11-10. Overall
web release acceptance now awaits Hashim's final acceptance; public launch
needs a separately approved release.
Android is not authorized to start.

## PWA / performance and acceptance

| Classification | Item | Evidence / next action |
| --- | --- | --- |
| READY | PWA implementation | Existing manifest identity, start URL, static-only cache and generic offline behavior preserved |
| READY | PWA runtime audit | Real Chrome verifies manifest/icon delivery, worker headers/control, local fonts, protected logged-out redirects, static-only Cache Storage, offline fallback/recovery and signup |
| READY | Public page coverage | Public-content regression checks routes, footer links, TMDB logo/wording, the exact approved support mailto link in each public page and footer, and absence of unresolved support notices. Responsive matrix includes all five new pages at 13 desktop/mobile web viewports |
| READY | Performance scope | Existing request-scoped private reads, bounded datasets, responsive images and earlier approved optimizations preserved; no new analytics/client feature or cross-user cache |
| MANUAL ACTION | Hashim final web acceptance | Public content is ready and the reminder gate passed. QA cleanup was done and verified on 2026-11-10. Remaining: a decision on committing these docs and pushing the 4 unpushed commits, then final review of the overall web candidate |
| MANUAL ACTION | Deployed web acceptance | After a separately authorized deployment: verify target parity/private artwork policies, HTTPS/Auth/email/callback configuration, required public policy/support URLs in provider consoles and authenticated desktop/mobile web smoke. These are later deployment checks, not additional public-content authoring blockers. No deployment or console change is authorized now |
| MANUAL ACTION | Deployed performance evidence | Measure representative authenticated mobile web routes; local builds/public browser passes are not field Core Web Vitals or database query-plan evidence |
| POST-V1 | New performance architecture | No global private caching, prefetch migration or speculative indexing is introduced to complete this release |

The production test server is a fresh loopback server on port 3101, not a reused
human development server. The release profile uses one worker, zero retries,
video off and failure diagnostics. Release Quality CI invokes it, but no remote
CI workflow has been run in this task.

Support-contact publication validation on 2026-11-04: production build (49/49),
direct TypeScript, ESLint, the 487-artifact secret scan and all 15 public-content,
PWA and responsive browser checks passed. The exact contact/href is present in
every generated public information page and footer. Source and release-document
searches found no unresolved support-contact notices. SMTP/Brevo and Auth sender
configuration are unchanged. No email was sent by the browser checks.

## Deferred work

| Classification | Item |
| --- | --- |
| ANDROID PHASE | Real Android/device PWA install, launcher crop, OS permission and installed-worker update testing |
| ANDROID PHASE | App identity, Bubblewrap/TWA wrapper, SDK setup, signing, Digital Asset Links and tested Play-distributed AAB |
| ANDROID PHASE | Play account eligibility, listing assets, Data safety/deletion declarations, review access and submission |
| POST-V1 | Series / TV support |
| POST-V1 | Payments / paid SaaS |
| POST-V1 | New product features, analytics integrations or delivery channels |
| POST-V1 | Adopt a major lint-toolchain migration only if justified separately; monitor compatible minimatch fixes without forced overrides |

The existing Android runbook is preparation only. Do not start it until Hashim
accepts the web candidate and explicitly authorizes that phase. Completed
QStash/calendar work stays frozen; none of the above authorizes its operators.

## Reproduce

```powershell
npm run lint
npm run typecheck
npm test
npx vitest run lib/calendar/part18j-c-migration.test.ts lib/calendar/part18j-d-migration.test.ts lib/calendar/part18j-privilege-fix.test.ts lib/testing/source-text.test.ts
npm run build
npm run scan:client-secrets
npm run test:release
npm audit --omit=dev
npm audit
git diff --check
```

The exact read-only integration command and environment-key instructions are in
WEB_RELEASE_AUDIT.md. Do not invoke all live integration suites: some contain
write/provider cases outside this task. QA credentials must refer only to the
existing development target. Reports/temporary files remain ignored; do not
publish private credentials or test artifacts.
