# Web release audit — updated 2026-11-04

Scope: movies-only web/PWA release candidate. No Production deployment, commit,
push, Android/device work, migration or QStash/calendar operation is authorized
by this audit. Calendar changes below are test-input portability only.

## Seven test failures: exact cause and correction

Six migration files read by three contract test files contain CRLF in this
Windows working copy. The tests lowercased raw `readFileSync(..., "utf8")`
strings but did not normalize newlines. Seven `toContain` assertions use literal
LF (`\n`) between exact SQL signature/role or claim-condition lines. JavaScript
does not equate `\r\n` and `\n`, so the expected substring was absent even though
the SQL tokens and indentation matched. This was not an authorization or SQL
behavior failure.

| Test file | Affected assertions |
| --- | --- |
| `lib/calendar/part18j-c-migration.test.ts` | Credential revoke/grant boundary; claim revoke/grant signature; event-ID helper revoke boundary; paused-state enqueue revoke boundary (four cases) |
| `lib/calendar/part18j-d-migration.test.ts` | Adjacent disconnect-pending/cleanup claim predicates (one case) |
| `lib/calendar/part18j-privilege-fix.test.ts` | Internal-helper revoke/no-grant checks; exact claim/finalize revoke/grant signatures (two cases) |

`normalizeSourceNewlines` converts **only CRLF pairs to LF** at the source-read
boundary. Existing lowercasing and every substantive assertion are unchanged.
It does not trim indentation, collapse whitespace, tokenize SQL or loosen role
lists/signatures. No migration bytes or application behavior were changed.
Added LF/CRLF regression checks also prove changed arguments, grant operations,
role lists and indentation remain unequal. All 21 focused checks pass. Full
unit/source suite: 148 files / 1,236 tests passed, zero failures/skips.

## Dependency review

Current full npm audit: **16 moderate, zero high/critical**. These are 16
affected package records propagated from **one root advisory**, not 16 distinct
runtime flaws. All 17 installed nodes in those records have `dev: true` in the
lockfile; the separate production audit reports zero findings.

Root: minimatch
[GHSA-g3hv-75wg-m249](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249).
The publisher describes pattern amplification in 10.2.6 with optimization level
at least 2 and identifies 11.0.1 as patched. npm's published affected range also
flags 3.1.5. That broader flag is retained in the counts, not silently dismissed.
The installed copies are 3.1.5 and 10.2.6. There is no patched release in their
declared 3.x/10.x ranges in the audited registry metadata.

The following table lists one explanatory dependency path per affected package;
npm also propagates records through peer dependencies and shared/cyclic lint
dependencies. Abbreviations: **N** = direct dev dependency
`eslint-config-next@16.4.4`; **E** = direct dev dependency `eslint@9.39.5`;
**T** = `N → typescript-eslint@8.72.1`; **M3/M10** = minimatch 3.1.5/10.2.6.
Each row has **no production runtime exposure** and **no compatible update that
resolves the root advisory**; a forced minimatch 11 override or a major toolchain
change is deliberately not applied.

| Package record | Installed version | Dependency path / propagated cause | Runtime users exposed | Non-breaking advisory fix |
| --- | --- | --- | --- | --- |
| `@eslint-community/eslint-utils` | 4.9.1 | E → utils; its ESLint peer carries E → M3 | No | None |
| `@eslint/config-array` | 0.21.2 | E → config-array → M3 | No | None |
| `@eslint/eslintrc` | 3.3.7 | E → eslintrc → M3 | No | None |
| `@next/eslint-plugin-next` | 16.4.4 | N → plugin-next → eslint-utils → ESLint peer → M3 | No | None |
| `@typescript-eslint/eslint-plugin` | 8.72.1 | T → eslint-plugin → parser → typescript-estree → M10 (also ESLint peer) | No | None |
| `@typescript-eslint/parser` | 8.72.1 | T → parser → typescript-estree → M10 | No | None |
| `@typescript-eslint/type-utils` | 8.72.1 | T → eslint-plugin → type-utils → typescript-estree → M10 | No | None |
| `@typescript-eslint/typescript-estree` | 8.72.1 | T → typescript-estree → M10 | No | None |
| `@typescript-eslint/utils` | 8.72.1 | T → utils → typescript-estree → M10 | No | None |
| `eslint` | 9.39.5 | E → M3 (also config-array/eslintrc) | No | None in ESLint 9 dependency ranges |
| `eslint-config-next` | 16.4.4 | N → E / import / JSX / React plugins / T → M3 or M10 | No | None in the current compatible toolchain |
| `eslint-plugin-import` | 2.32.0 | N → plugin-import → M3 | No | None |
| `eslint-plugin-jsx-a11y` | 6.10.2 | N → plugin-jsx-a11y → M3 | No | None |
| `eslint-plugin-react` | 7.37.5 | N → plugin-react → M3 | No | None |
| `minimatch` | 3.1.5; 10.2.6 | E → M3; T → typescript-estree → M10 | No | 11.0.1 is outside both installed major ranges |
| `typescript-eslint` | 8.72.1 | N → T → typescript-estree → M10 | No | None |

Safe updates applied in this pass: `@eslint/eslintrc` 3.3.6 → 3.3.7 and
`typescript-eslint` plus its matching parser/plugin/type-utils/utils/estree
packages 8.65.0 → 8.72.1. npm updated 13 installed packages without direct
dependency or major-version changes. The new releases still declare minimatch
3.x/10.x, so the 16 audit records remain. Earlier production security fixes
(Next 16.4.4, Sharp 0.35.5, Zod 4.6.6) are preserved.

Residual risk is lint/build-machine resource exhaustion with attacker-controlled
glob patterns, not application HTTP input, private data access or browser code.
Run untrusted contributions in isolated, resource-limited CI with its existing
read-only permissions; do not expose privileged developer secrets to untrusted
lint configuration. Monitor upstream compatible fixes. No `npm audit fix --force`,
tool downgrade or unsupported major override was used.

## Public content evidence

Added public Server Component routes `/privacy`, `/terms`, `/support`,
`/data-deletion` and `/about`. Root footer links make them available from the
homepage, auth screens and app. Settings has an additional Help and policies
link group. Existing protected routes and identity/RLS code are unchanged.

| Disclosure | Repository evidence used |
| --- | --- |
| Account/profile/preferences | `lib/settings/types.ts`, settings validation/actions, Supabase cookie auth |
| Library/ratings/reviews/notes/import/export | Existing movie types, private settings data controls and import/export flow |
| Private uploaded artwork | `lib/artwork/images.ts`, `lib/artwork/server.ts`, authenticated artwork routes |
| Google identity/grant/events | `lib/calendar/google-provider.ts`, encrypted oauth store, event transport and Settings Calendar page; read only for documentation |
| Notifications/push | `lib/push/supabase-push.ts`, web-push adapter, browser notification controls; user agent and subscription metadata included |
| Cookies/theme/offline assets | Auth SSR clients, next-themes, service worker static allowlist |
| Hosting/API/delivery services | Vercel configuration, Supabase, TMDB provider, Google Calendar, browser push and existing QStash background invocation design |
| Analytics/trailers | No advertising/analytics SDK or integration found in package/app source; trailer URLs open YouTube links, not embedded players |
| Deletion limitations | Existing account deletion removes artwork before Auth user; owned records cascade. Google event cleanup is a separate disconnect operation and must not be promised as an account-delete side effect |

The operator name **WatchFlow** and public contact **hashim.ghub@gmail.com** are
supplied by Hashim. The previously unresolved contact is now published as an
exact mailto link on `/privacy`, `/terms`, `/support`, `/data-deletion`, `/about`
and the shared footer; Settings already links to Help & contact. No company,
legal entity, address, jurisdiction or domain was fabricated. No fixed
backup/log-retention promise or unverified marketing claim is invented. Approved
policy wording is preserved except where needed to publish the support contact.

TMDB's [official FAQ](https://developer.themoviedb.org/docs/faq) requires its
approved logo and non-endorsement notice in an About/Credits surface. `/about`
includes the exact notice, links to TMDB and displays the unmodified official
asset in original colors/proportions, subordinate to WatchFlow branding. The
download's SHA-256 matches its official asset filename:
`9665a76b1ae401a510ec1e0ca40ddcb3b0cfe45f1d51b77a308fea0845885648`.
Local delivery adds no new third-party request or image-host CSP requirement.
Brand provenance is recorded under `public/brand/README.md`.

The Google disclosure is grounded in the implemented scopes and transport and
links to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy).
Publishing accurate privacy/support URLs in provider consoles remains an
operator step, not a console mutation performed by this task.

## Integration credentials and scope

**READY — owner-reported successful rerun.** Hashim confirms the QA credentials
were refreshed locally and the read-only RLS verification passed five tests,
with one intentionally skipped push-subscription write test, no authentication
failure, no destructive/write suite and no calendar/QStash tests. This supersedes
the earlier `invalid_credentials` setup failure. No new agent authentication or
remote operation was needed to record this evidence.

The earlier inspection found duplicate QA declarations in ignored
`.env.test.local`, whose loader uses the last occurrence in that file. Hashim
has now refreshed the credentials locally. The relevant key names are
`E2E_USER_A_EMAIL`, `E2E_USER_A_PASSWORD`, `E2E_USER_B_EMAIL`,
`E2E_USER_B_PASSWORD`. Both must be distinct, existing confirmed development
users. Existing development origin pins must match. No actual values belong
in this document. The loader honors existing shell values, then `.env.local`,
then `.env.test.local`. No credential contents were read for this status update.

Exact read-only rerun from the repository:

```powershell
$env:RUN_SUPABASE_INTEGRATION_TESTS = "true"
npx vitest run --config vitest.integration.config.ts integration/supabase-rls.integration.test.ts --testNamePattern "allows each user|isolates private preferences|isolates list memberships|denies anonymous|allows authenticated reads"
```

This selects five reads plus login/local sign-out setup; it skips the one
push-subscription write case. The list-membership check is conditional on QA A
already owning a list; do not create data merely to change coverage in this pass.

## Public production browser verification

The expanded release selection passed 15/15 with one worker and zero retries:
the existing PWA runtime case, one public-information/branding/contact case and
13 responsive cases now visiting the five new public pages as well as auth and
the homepage. Signup returned HTTP 200; the public policy routes also returned
HTTP 200 without login. An earlier 1280px case completed its assertions but
Chrome context teardown exceeded its timeout; both its focused rerun and the
subsequent complete 15-case sweep passed without changing timeouts or assertions.

The final build generates 49/49 pages; the new public pages are static Server
Components. No live credentials were used by the public browser selection.

## Final web acceptance checkpoint — 2026-11-03 (before contact publication)

The successful RLS rerun is accepted as owner-reported evidence. `/privacy`,
`/terms`, `/data-deletion` and `/about` were re-reviewed and are otherwise ready
for final web acceptance. At that checkpoint the support contact was the only
manual public-content blocker; the owner supplied it on 2026-11-04 and that
blocker is now resolved. No company/legal entity, address or domain was invented.

Application code, dependency lockfile and public-page source remain unchanged
since the completed final production build and 15/15 public browser sweep.
TypeScript, ESLint and the 487-artifact secret scan also passed on that source.
Only handoff/checklist/audit documentation changes in this checkpoint, so those
completed checks are retained without unnecessary rebuilds or repeat logins.
Diff hygiene is checked again. No Android/device work, commit, push, deployment,
provider-console change or calendar/QStash action was performed.

## Approved public support contact — 2026-11-04

Applied Hashim's exact approved public support email, `hashim.ghub@gmail.com`,
through a shared Server Component mailto link. Updated the five public pages,
global footer, information-page date and support-only wording in release docs.
The public-content browser test now verifies the exact contact on every public
page and footer, rejects unresolved notices and inspects hrefs without sending
email. Existing policy substance, TMDB attribution and deletion controls remain
unchanged. This is public contact content only: no SMTP/Brevo configuration,
authentication email sender, environment file or provider setting was changed.

No public-content authoring blocker remains. Hashim's final web acceptance and
any future release authorization are separate. No commit, push, deployment or
Android/device work was performed.

Actual validation for this publication: production build passed 49/49 page
generations; ESLint and direct TypeScript passed; the refreshed secret scan
passed across 487 artifacts; all 15 public-content/PWA/responsive browser checks
passed with one worker and zero retries. The five generated public information
pages contain the exact mailto contact and no unresolved notice. Source/release
documentation searches confirm the former contact notices are removed, and
`git diff --check` passes. No RLS login or live integration was repeated.

## Files in this pass

This inventory is relative to the prior uncommitted release-finalization pass;
its existing changes remain intact.

- `app/layout.tsx`
- `app/(app)/settings/layout.tsx`
- `app/(public)/layout.tsx`
- `app/(public)/privacy/page.tsx`
- `app/(public)/terms/page.tsx`
- `app/(public)/support/page.tsx`
- `app/(public)/data-deletion/page.tsx`
- `app/(public)/about/page.tsx`
- `components/public-information.tsx`
- `public/brand/tmdb-logo.svg`
- `public/brand/README.md`
- `lib/calendar/part18j-c-migration.test.ts`
- `lib/calendar/part18j-d-migration.test.ts`
- `lib/calendar/part18j-privilege-fix.test.ts`
- `lib/testing/source-text.ts`
- `lib/testing/source-text.test.ts`
- `package-lock.json`
- `e2e/public-release-content.spec.ts`
- `e2e/responsive.spec.ts`
- `playwright.release.config.ts`
- `docs/WEB_RELEASE_AUDIT.md`
- `docs/ANDROID_PLAY_RELEASE.md` (approved support contact only)
- `docs/WATCHFLOW_V1_RELEASE_CHECKLIST.md`
- `docs/PROJECT_CONTEXT.md`
