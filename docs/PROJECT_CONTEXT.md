# WatchFlow Project Context

Last updated: 2026-09-11
Last updated by: Codex  
Purpose: Canonical project handoff and single source of truth for coding agents  
Current phase: Part 16F final local UI/UX acceptance is complete. All requested PDF UI/UX changes have been implemented and manually verified.
Current branch: `ui-final-polish`.
Current status: Part 16E Preview Acceptance remains PASS. Part 16F local acceptance is now PASS after final manual review of the requested UI/UX changes. The latest Add Movies dialog alignment issue was also corrected and verified. No database, migration, RLS, policy, schema, Auth, or hosted Supabase data changes were introduced by the final UI corrections.
This document records repository evidence, not assumptions about an uninspected Supabase project. Verify relevant statements against current code and update only affected sections after each milestone.

`docs/RELEASE_EVIDENCE.md` remains the authority for permission to create the
isolated Preview. The newer Part 16E section below is the authority for deployed
Preview acceptance status. Older dated milestone sections are historical.

## 2026-09-11 Part 16F final local UI/UX acceptance (PASS)

- Final result: **PART 16F LOCAL ACCEPTANCE PASS**.
- All 34 PDF-audited outcomes were reviewed against the current implementation.
- 32 implemented outcomes pass.
- The two previously reported CSV/JSON 404 issues are not reproducible in the current implementation; both authenticated export endpoints return successfully.
- The user manually reviewed the final affected UI across the requested WatchFlow surfaces and confirmed that all requested PDF changes are complete.
- Final responsive and visual review covered the requested mobile, tablet, and desktop layouts together with light and dark themes.
- The final Add Movies dialog alignment correction was completed and manually verified: field labels are left aligned, and movie titles and release years are left aligned consistently.
- Previously accepted Actor filtering, status behavior, Watched Date persistence, Watched/Saved transitions, Library behavior, Watch Next, scheduling, custom lists, picker, onboarding, import, Settings, and export behavior remain preserved.
- No database schema, migration, RPC, RLS, policy, grant, Auth flow, hosted Supabase configuration, or user-data change was introduced by the final UI acceptance work.
- Part 16F local UI/UX work is complete. The next release step is to checkpoint the accepted local state and deploy the finalized changes to the isolated Preview environment for final Preview acceptance before Part 17.

## 2026-09-11 Part 16F-B Batch 4 Settings, exports, and final cross-app polish

- Removed the visible Preferred TMDB Language control from Settings Preferences
  only. Onboarding retains its language selector and search behavior. The
  authenticated preferences action reads the existing stored preference and
  supplies that value to the existing full preference upsert, so a Settings
  save cannot blank or reset the language field.
- CSV and JSON export investigation found correctly grouped App Router GET
  handlers, matching direct anchor targets, and both routes in the production
  app-path manifest. Authenticated browser clicks returned `200` for both
  download endpoints with no navigation to a 404. The PDF failure is therefore
  not reproducible from the current route tree; the download attribute makes
  the browser-download intent explicit without replacing the private,
  no-store attachment architecture.
- Expanded export response regression coverage and added Batch 4 Settings
  source contracts. Focused Settings/export plus protected Batch 1-3 coverage
  passed (12 files/102 tests); full Vitest passed (79 files/786 tests). Lint,
  direct TypeScript, `git diff --check`, production build (37 routes, including
  both dynamic export routes), and client-secret scan passed.
- The in-app browser does not expose a saved-download file path for inspection,
  so a real browser-download-file existence/size check remains a pre-production
  manual QA item. The exact 1366x768 dark Settings viewport and full three-size
  Settings matrix also remain manual QA items. No database schema, migration,
  RPC, RLS, Auth, hosted Supabase configuration, deployment, or user data was
  changed. Batch 4 remains an uncommitted review diff.

## 2026-09-11 Part 16F-B Batch 3 onboarding, import, queue, schedule, lists, and picker polish

- Onboarding no longer renders visible numeric step counters, duration copy,
  TMDB canonical-language helper copy, or library saved/suggested summaries.
  Existing progress and result counts remain available to assistive technology.
  Movie search has an icon-led, disabled, stable-width `Searching` state.
- Import result status cells are kept on one line within the existing
  scrollable table region. Watch Next, list rows, ordering controls, removal
  action, the Add Movies filters, and picker filters/results now use the
  requested mobile-first layout contracts while retaining their existing data
  and mutation behavior. The shared schedule `Select` controls were preserved.
- Added source-contract regression coverage for the Batch 3 visual and
  responsive requirements. No database schema, migration, RPC, RLS, Auth,
  Supabase configuration, dependency, hosted deployment, or user data was
  changed. Batch 3 remains an uncommitted review diff; Batch 4 has not begun.
- Validation: `git diff --check`, lint, direct TypeScript, the focused 14-file
  159-test selection, full Vitest (78 files/783 tests), production build (37
  routes), and the client-secret scan (507 browser artifacts) passed.
  Authenticated visual inspection covered Watch Next, Schedule, Lists, Add
  Movies, and Picker at 390x844 and 820x1180 in both themes, plus 1366x768 in
  light mode (dark desktop was inspected at the native 1280x720 viewport).
  The completed QA account could not be returned to onboarding, and generating
  an import-results state would mutate user data; those two states are covered
  by source contracts and automated tests rather than a live mutation.

## 2026-09-11 Part 16F-B Batch 2B Library and movie-detail polish

- The Library grid now becomes a compact two-column layout from 360px while
  retaining poster, title, year, rating, status, favourite, and removal
  controls. Titles clamp to two lines, secondary spacing is reduced, actions
  keep a consistent full-width 44px minimum target, and long content cannot
  force horizontal overflow.
- The mobile List view now uses a poster-left/content-right row with its
  actions in the content column; Priority is hidden only on narrow screens.
  Tablet and desktop retain the spacious three-column row architecture.
- Removed the duplicated green Watched overlay from posters. Status remains
  available through the existing text-and-icon badge below the movie metadata.
  Both grid cards and list rows use the shared status accent contract; Watched
  is the only green border treatment, while other statuses keep their existing
  distinct or neutral accents.
- Favourite and removal controls now share stable sizing/alignment. The
  initial removal action is a clearly destructive red outline with a
  movie-specific accessible label; the destructive confirmation remains
  unchanged.
- Selection mode has a contained responsive header, visibly bordered Clear
  Selection and Exit Selection controls, and an aligned status/action toolbar
  that stacks at mobile, balances into two columns at tablet, and aligns into
  one row at wide desktop. Current-page selection, confirmation, and bulk
  mutation behavior are unchanged.
- The movie-detail Custom Lists header now owns explicit minimum-width and
  wrapping constraints. Create New List is full-width on narrow screens and
  intrinsic-width from `sm`, preventing the control and long list content from
  escaping the card.
- Single-movie deletion now carries the server-rendered title through the
  existing action, normalizes control characters/whitespace, caps it at 160
  characters, and returns `<title> was removed from your library.` Detail
  removal preserves its `/library` redirect and adds a sanitized success
  notice there. Empty or invalid titles use a generic safe fallback.
- Persistent regression coverage adds 11 tests for removal-message
  normalization and the Batch 2B grid/list/status/action/selection/custom-list
  contracts, while retaining Batch 2A Actor, selectable-status, watched-date,
  owner-scoping, and queue coverage. Focused tests passed 3 files/32 tests;
  the combined Batch 2B/Watched Date regression selection passed 6 files/66
  tests; the full suite passed 77 files/774 tests.
- Browser QA rendered the production components in Chromium for grid, list,
  detail custom lists, and selected-state toolbar at 390x844, 820x1180, and
  1366x768 in light and dark. All 24 cases passed horizontal-overflow and
  control-visibility/border checks, and every capture was visually inspected.
  The named success notice was also inspected on the real authenticated local
  Library without deleting or altering user data.
  The temporary public fixture, spec, captures, and test results were removed
  or moved out of the repository after inspection.
- Final validation passes: `git diff --check`; `npm run lint`;
  `npx tsc --noEmit`; focused Vitest; `npx vitest run` with 77 files/774 tests;
  `npm run build` with all 37 routes; and `npm run scan:client-secrets` across
  507 browser artifacts. The sandboxed build could not fetch Geist; the
  permitted network-enabled rerun passed.
- No database schema, migration, RPC, RLS, grant, Auth/Supabase configuration,
  filter semantics, status storage, queue behavior, watched-date semantics,
  dependency, hosted deployment, Batch 3/4, commit, or push change was made.
  Batch 2B remains an uncommitted review diff on `ui-final-polish`.

## 2026-09-11 Part 16F-B Batch 2A Watched Date persistence regression

- Authenticated localhost reproduction on an existing Watched movie confirmed
  that the owner-scoped v2 RPC stored the submitted calendar date correctly.
  The fresh server payload contained
  `watchedAt: "2026-09-08T00:00:00+00:00"`, and a hard reload rendered
  `2026-09-08`; the write, row mapping, and PostgreSQL preservation semantics
  were therefore not the failure.
- Root cause: `MovieManagementForm` initialized controlled status and
  watched-date state from server props only once. After a successful Server
  Action refresh, the component instance retained its prior local values, and
  Next's client route cache restored that stale instance when revisiting the
  movie. On a first date save this appeared as a blank field even though
  `watched_at` was populated.
- The action state now remains in a stable outer component while a keyed inner
  fields component remounts whenever the persisted row version/status/date
  changes. This reconciles controlled form values after save without
  effect-driven state writes and keeps the success announcement visible.
- Added `getWatchedDateInput` to validate and extract the stored calendar-date
  prefix for native `<input type="date">` values. It preserves the intended
  calendar day without timezone conversion and rejects localized, impossible,
  or malformed values.
- Manual localhost QA passed: date save remained visible after success;
  Library navigation and client-side reopen restored the date; Watched → Saved
  hid the field without clearing the stored date; Saved → Watched restored it;
  and an explicit empty Watched save wrote `NULL`. The test movie was restored
  to its original Watched/blank-date state.
- Regression coverage now locks the full stored-timestamp read path, date-input
  normalization, v2 RPC watched-date arguments, refreshed-form key, explicit
  clearing, non-Watched/unrelated preservation, owner scoping, Actor behavior,
  and existing status contracts.
- Validation passes: `git diff --check`; `npm run lint`; `npx tsc --noEmit`;
  focused watched-date/management coverage with 6 files and 59 tests;
  `npx vitest run` with 76 files and 763 tests; `npm run build` with all 37
  routes; and `npm run scan:client-secrets` across 507 browser artifacts. The
  sandboxed build could not fetch Geist; the permitted network-enabled rerun
  passed.
- No migration, RLS, grant, Auth, Actor-filter, queue, status-domain, hosted
  Preview/Production, deployment, dependency, commit, push, or Batch 2B change
  was made. The regression fix remains uncommitted on `ui-final-polish`.

## 2026-09-10 Part 16F-B Batch 2A Library data and status behavior

- Added forward-only migration
  `supabase/migrations/202609100001_part_16fb_library_actor_status.sql`.
  `watchflow_library_rows_v2` is a separate security-invoker RPC, avoiding
  PostgREST overload ambiguity. It normalizes `p_actor`, matches normalized
  string and object-name entries in `movies.main_cast`, and applies the actor
  predicate inside the `auth.uid()`-owned relation before PostgREST exact
  count, stable ordering, and range pagination. Existing query, status,
  watched, genre, director, and exact-year filters remain combinable.
- The visible Library filter set no longer includes Favourite, personal-rating
  range, or release-year range. Actor is now a dedicated filter rather than an
  alias for general search. Exact release year and the other useful filters
  remain, with the filter grid rebalanced responsively. Favourite data and
  favourite-first sorting are unchanged.
- The stored status domain is unchanged. New selectors expose **Saved**
  (`want_to_watch`), Watch Next, Scheduled where supported, Currently Watching,
  and Watched; bulk and Settings controls retain their previously narrower
  valid subsets. Saved does not enqueue a movie. `on_hold` and `dropped` remain
  accepted by compatibility mappings, statistics, exports, and the database,
  but cannot be newly selected. Existing legacy values remain readable without
  rewrite and use neutral muted labels/treatment.
- Watched Date is rendered only while the movie-management status is Watched.
  Its controlled local value survives switching away and back. The action now
  distinguishes an omitted field from an explicit empty Watched field, and the
  new owner-scoped `watchflow_update_library_movie_v2` preserves `watched_at`
  for non-Watched and unrelated edits while allowing an explicit clear when
  Watched. Existing schedule validation, queue locking/normalization, and
  `auth.uid()` ownership checks are preserved.
- Added/updated regression coverage for actor parsing/RPC arguments, exact
  count and pagination contracts, owner isolation, combined filters, removed
  fields, Saved compatibility, legacy selection/read/export behavior,
  conditional/restored/cleared Watched Date handling, and Saved queue safety.
  A local-only PostgreSQL behavior script at
  `supabase/testing/part16fb_library_actor_status.sql` verifies real actor
  results, stable pages, cross-user isolation, legacy-row readability,
  watched-date preservation/clearing, and non-queued Saved state.
- Validation passes: `git diff --check`; `npm run lint`; `npx tsc --noEmit`;
  focused Library/query/management tests with 10 files and 164 tests;
  `npx vitest run` with 76 files and 759 tests; `npm run build`; and
  `npm run scan:client-secrets` across 507 browser artifacts. A disposable
  PostgreSQL 18 cluster also passed the repository bootstrap, all migrations
  from zero in filename order, development readiness, production security
  audit, and the Batch 2A behavior smoke; the cluster and fixtures were then
  removed.
- No hosted Preview/Production configuration or data was changed. No Library
  card/list/mobile visual redesign, onboarding work, Batch 2B, Batch 3, Batch
  4, commit, push, deployment, schema-domain deletion, legacy-row rewrite, or
  RLS/grant weakening was performed. The remaining PDF work stays assigned to
  Batches 2B, 3, and 4.

## 2026-09-10 Part 16F-B Batch 1 shared controls and cross-app UI fixes

- Added `components/ui/select.tsx` as the canonical native Select. It preserves
  browser semantics and consumer-controlled labels while providing a roughly
  44px minimum target, deliberate left/right padding, a vertically centered
  pointer-events-none chevron, semantic surface/text colors, responsive type,
  and shared focus-visible, disabled, and invalid states.
- Migrated all 29 user-facing native selects across 10 consumers: onboarding,
  Library filters and bulk actions, movie management, scheduling, CSV import,
  Add Movies, Movie Picker, and Settings preferences/notifications. Existing
  names, values, default values, change handlers, options, and behavior were
  preserved; no page-specific select class treatment remains in those
  consumers.
- Native option menus now receive semantic surface/foreground colors and an
  explicit light/dark `color-scheme`. The closed control and its options no
  longer depend on page-specific hard-coded colors. Because an authenticated
  local session was unavailable, opened Windows Chrome option menus still need
  authenticated manual inspection before visual acceptance can be claimed.
- Removed the forced foreground color from the global `::selection` rule while
  retaining its visible primary-tint background. Native Ctrl+A remains
  untouched. A real Chromium regression passed in light and dark themes at
  390x844, 820x1180, and 1366x768 for normal page selection, input selection,
  and horizontal-overflow safety.
- Focused Select/theme coverage validates native semantics, forwarded form
  attributes, chevron spacing/alignment, shared focus/disabled/invalid styles,
  the ten migrated consumers, light/dark option tokens, and the corrected
  global selection rule. The full Vitest suite passes with 75 files and 751
  tests; the additional Playwright selection suite passes 6 tests.
- Repository validation passes: `git diff --check`, `npm run lint`,
  `npx tsc --noEmit`, focused Select/theme tests, `npx vitest run`,
  `npm run build` with all 37 routes, and `npm run scan:client-secrets` across
  507 browser artifacts. The sandboxed build could not fetch the Geist font;
  its permitted network-enabled rerun passed.
- The protected responsive browser sweep was attempted at all three requested
  viewports but stopped during login because the guarded QA account returned
  **Confirm your email before signing in**. It never reached protected routes,
  so dropdown opening, arrow placement in live forms, and protected-route
  console/network health are not recorded as passing. No auth gate was bypassed
  and no hosted Supabase state was changed.
- No route, database, migration, RLS, policy, schema, hosted configuration,
  authentication behavior, business logic, or user data changed. The approved
  actor RPC, status presentation/selection work, Library redesign, export
  investigation, Settings language removal, and every other page-specific PDF
  item remain deferred to Batches 2-4. No commit, push, deploy, or Batch 2 work
  was performed.

## 2026-09-08 Part 16F-A theme foundation and core-component polish

- Implemented the cinema-inspired visual foundation as an uncommitted,
  visual-only change on `ui-theme-polish`. Shared semantic CSS variables and
  Tailwind mappings now own the light/dark page, surface, border, text, primary,
  sidebar, and rating colors. Light mode uses the requested `#FAFAFA` page,
  `#141414` sidebar/primary action, white cards, `#E5E7EB` borders, `#111827`
  body text, and `#6B7280` secondary text. Dark mode uses the requested
  `#121212` page, black sidebar, `#1E1E1E` cards, `#2C2C2C` borders,
  `#F5F5F5`/`#A0A0A0` text, and `#F5C518` primary action. Existing green,
  amber, and red semantic status treatments remain distinct.
- Polished shared buttons, cards, inputs, checkboxes, dialogs, responsive
  surfaces, and empty states without changing their behavior or public APIs.
  Default actions are near-black in light mode and cinema yellow with dark text
  in dark mode; outlines remain neutral. Empty states use a compact yellow
  cinema icon tile instead of a large decorative color block.
- Desktop and mobile navigation retain their existing information architecture
  but now use near-black/black chrome, restrained muted labels, a yellow brand
  accent, and a thin yellow left rail for the active destination. Focus styling
  remains visible against the dark sidebar.
- The reusable movie-rating treatment is now a compact yellow star pill with
  dark text and an accessible rating label. Search, library, recommendations,
  detail, and picker consumers continue to use the shared component. Poster-card
  redesign remains explicitly deferred.
- Public browser QA passed in both light and dark themes for `/`,
  `/auth/login`, and `/auth/sign-up` at 390x844, 820x1180, and 1366x768. Every
  case rendered the expected theme palette with no horizontal overflow; visual
  inspection of the home and login surfaces passed, the UI theme control
  switched and persisted correctly, `/auth/sign-up` rendered rather than 404,
  and browser warning/error logs were empty.
- Authenticated local visual QA across the protected-route matrix remains
  pending. The repository has no local-only authenticated fixture or mock-auth
  mode, and this milestone explicitly forbids touching hosted Supabase data.
  The deployed Preview cannot validate these uncommitted styles. Protected
  source contracts and focused UI tests pass, but that is not represented as a
  substitute for browser coverage; Part 16F-A is therefore not marked fully
  accepted yet.
- Repository validation passed: `npm run lint`; `npx tsc --noEmit`;
  `npx vitest run` with 74 files/734 tests; `npm run build` with all 37 routes;
  `npm run scan:client-secrets` across 507 browser artifacts; and
  `git diff --check`. The focused theme/auth/discovery/library/lists/statistics
  suite also passed with 7 files/85 tests.
- No database, authentication flow, authorization, business logic, server
  action, route, dependency, migration, policy, schema, hosted configuration,
  or deployment changed. Tag `part-16e-preview-acceptance-pass` remains on
  `f985a99` and was not moved. No commit or push was created, and Part 16F-B and
  Part 17 have not begun.

## 2026-09-09 Existing-account signup and login feedback finalization

- The existing-account signup UX preserves native Supabase Auth error handling:
  `user_already_exists` and `email_exists` are handled before the
  compatibility-only message fallback (`User already registered` / already
  exists). The Server Action returns a typed `account_exists` result before
  pending-verification state is written and before any verification redirect.
- Existing confirmed-account signup now shows the explicit **Account already
  exists** feedback path, with the safe message **An account with this email
  already exists.**, instead of navigating to verification. The UI retains the
  visible **Sign in instead** and **Forgot password?** actions; generic provider
  failures remain safely mapped and raw provider details are not exposed.
- Invalid login credentials now use the professional, privacy-safe **We couldnt
  sign you in** feedback state. This does not introduce a service-role or admin
  lookup, an account-enumeration endpoint, or client-side inference from an
  obfuscated Auth response.
- New-signup success still writes only the pending-email state and redirects to
  `/auth/verify-email`. OTP verification, resend/countdown, recovery, session,
  onboarding, and established login behavior remain preserved.
- Automated regression coverage locks the native codes, legacy fallback, safe
  generic failures, absence of pending state/redirect on existing-user errors,
  prominent existing-account and invalid-login feedback, and the successful
  signup verification path.
- Earlier live QA observed Supabase's obfuscated/fake signup success response
  rather than the native existing-user errors. Live authentication QA was later
  resolved by correcting the Supabase Auth phone-confirmation configuration and
  deploying the finalized signup/login feedback changes. The finalized
  authentication changes were merged into `master`, pushed, deployed to
  Preview, and verified before returning to `ui-theme-polish`.

## 2026-09-08 Part 16E password-recovery persistence investigation

- Final result: **PREVIEW ACCEPTANCE PASS**. A fresh disposable account on the
  canonical deployed Preview retained its identity and every controlled
  application-data fixture through an ordinary logout/login, real email-based
  password recovery, and another logout/login using the new password. The
  earlier one-off data-loss observation did not reproduce.
- The target guard passed before the investigation's authenticated mutations.
  The tested origin was `https://watch-flow-preview.vercel.app/`; its live CSP
  named only Supabase project `pupzjbtjxtswslagxrbk` for the application data
  connection and did not name or contact `watchflow-dev`.
- The distinctive controlled fingerprint included an edited profile, complete
  application and notification preferences, three Library movies, favourite,
  status, priority, rating and review metadata, a two-item ordered Watch Next
  queue, a timezone-aware schedule with a note, and a two-item ordered custom
  list. All fixtures were verified before recovery, after recovery, and after a
  fresh password login. The already-completed profile did not re-enter
  onboarding.
- Identity classification: the recovery session and subsequent password login
  resolved to the same Auth ownership UUID. The raw UUID was deliberately not
  retained in this handoff, but identity continuity is proven by continued
  ordinary-client access to the exact pre-existing `profiles`,
  `user_preferences`, `user_movies`, queue/schedule, `lists`, and `list_movies`
  rows under policies that compare ownership to `auth.uid()`. No rows were
  deleted, overwritten, orphaned, or merely hidden.
- The static audit found no recovery data-loss path. Forgot password calls
  `resetPasswordForEmail`; callback/confirm exchange or verify the recovery
  credential; password update calls `auth.updateUser({ password })`; and login
  uses `signInWithPassword`. None creates or deletes an Auth user or mutates
  application tables. Logout is local-session-only. Existing-profile
  onboarding does not recreate rows. Profile/preference creation triggers run
  only after a new `auth.users` insert and use conflict-safe initialization.
  Cascades are reachable only from explicit owner-scoped library/list/account
  deletion paths, not from recovery.
- Exact root-cause conclusion: no product data-loss defect was found. The prior
  failure lacked a controlled before/after ownership fingerprint or UUID proof
  and is classified as an evidence-attribution error unless independent hosted
  logs later establish a different event. Applying a speculative behavior or
  database fix would therefore be incorrect.
- A focused source-contract regression now locks recovery to the existing
  identity-preserving Auth operations and rejects Auth-user deletion/creation
  or profile, preference, library, queue/schedule, and list mutations in the
  recovery surface. No application behavior changed and no migration was added
  or modified.
- Post-recovery CSV and JSON exports were downloaded through the browser and
  inspected without recording private identifiers. CSV contained all three
  Library rows plus the expected favourite, priority, rating, review, scheduled
  date, and timezone values. JSON contained the profile, preferences, Library,
  schedule, and custom-list fingerprints. Browser warning/error logs were empty
  and both attachment responses completed as downloads.
- Final repository validation passed: `npm run lint`; `npx tsc --noEmit`;
  `npx vitest run` with 73 files/729 tests; `npm run build` with all 37 routes;
  `npm run scan:client-secrets` across 507 browser artifacts; and
  `git diff --check`. The first sandboxed build attempt could not fetch the
  Google font; the permitted network-enabled rerun passed and is the build
  result of record.
- The disposable account and its distinctive fixtures remain available for
  review. They must not be deleted without a separate explicit authorization.
  No credential, recovery link, token, cookie, mailbox content, or environment
  value is recorded in this file.
- Part 17 has not begun. The next action is review, followed by explicitly
  authorized disposable-account cleanup if desired; do not commit or deploy
  these unreviewed changes.

## 2026-09-07 Part 16E final deployed Preview acceptance QA

- Final result: **PREVIEW ACCEPTANCE FAIL**. The canonical isolated Preview and
  nearly the entire required authentication, product, responsive, browser-health,
  export, two-user isolation, and deletion matrix passed. Acceptance is blocked
  by an unexplained loss of User A's previously persisted library and profile
  state after a successful password-recovery flow and subsequent login to the
  same Preview account.
- The target guard passed before authenticated mutations. The live deployment
  used the exact `watchflow-preview` Supabase project origin in its CSP and did
  not expose or contact `watchflow-dev`. The tested application origin was
  `https://watch-flow-preview.vercel.app/`.
- Fresh signup, delivered real-email OTP, invalid-code handling, resend with the
  newest code, verification, onboarding, established login, session refresh,
  logout/login, password-recovery request, and password update all completed.
  Human assistance was limited to private mailbox/code/password steps. The
  initial recovery email incorrectly targeted a removed Vercel hostname; the
  user corrected the hosted Preview Auth URL configuration and a newly issued
  recovery link then reached the deployed update-password page successfully.
- Before recovery, authenticated product checks passed for server-side movie
  search and details, private library mutations and personal metadata, Watch
  Next ordering/reordering/removal, timezone-aware schedule create/edit/remove,
  custom list create/edit/membership/order/removal, picker, recommendations and
  reasoning, statistics, profile, preferences, notification preferences, and
  browser-downloaded CSV/JSON exports. Refresh and route-revisit persistence
  passed during those workflows.
- Release-blocking persistence defect: after recovery and login with the same
  stored account identifier on the same pinned Preview project, the earlier
  three-movie library and customized profile/timezone were absent and the
  timezone had reverted to its default. Source inspection found the password
  update path only updates the Auth password and does not intentionally delete
  application data. The underlying identity/database cause is unresolved and
  must be audited in hosted Supabase Auth and database logs; no cause is assumed
  from the browser evidence alone.
- Broad two-user isolation passed through ordinary authenticated clients with no
  service-role bypass. User B could not read or mutate User A's library,
  favourites, personal metadata, Watch Next queue/order, schedule note/timezone,
  custom list/membership/order, profile, preferences, notifications, or private
  identifiers through normal pages, direct resource URLs, CSV, or JSON export.
  User B's exports contained only User B's empty private dataset.
- Authenticated responsive checks passed at 390x844, 820x1180, and 1366x768
  across 15 protected routes with no horizontal overflow, clipped controls, or
  unusable dialogs. Keyboard Escape/focus-return behavior passed. No React
  hydration error, CSP violation, or browser console warning/error was observed
  during the completed normal, OTP, protected, isolation, or cleanup journeys.
- The explicitly authorized dedicated disposable account deletion passed: the
  destructive confirmation completed, the app redirected with the deletion
  result, and subsequent protected navigation required login. The retained QA
  A/B accounts were not deleted.
- Final repository validation passed: `npm run lint`; `npx tsc --noEmit`;
  `npx vitest run` with 73 files/728 tests; `npm run build` with all 37 routes;
  `npm run scan:client-secrets` across 507 browser artifacts; and the GitHub
  Release Quality run for exact SHA `4e2283c`. The sandboxed exact `npm test`
  process launch was denied by Windows `spawn EPERM`; the approved direct Vitest
  run is the passing test evidence. The build's initial sandboxed Google-font
  network denial passed on the approved network-enabled rerun.
- Cleanup completed with explicit authorization. Temporary isolation rows,
  User A's named isolation list and its membership, the two named library movie
  fixtures and their cascading queue/schedule/personal metadata, User B's two
  downloaded export files, and the dedicated disposable account were removed.
  User A's Library, Watch Next, Schedule, and Lists ended empty. No credentials,
  tokens, mailbox contents, or environment-variable values were retained here.
- No application source, deployment, dependency, migration, schema, policy, or
  grant changed in this run. The user made the hosted Auth URL correction; this
  context update is the only repository change.
- Exact next milestone: audit whether the recovery flow changed Auth identity or
  orphaned/failed to load profile and user-owned rows, reproduce and fix the
  post-recovery persistence loss, then rerun the affected session/persistence,
  library, profile, and export acceptance items. Part 17 must not begin until
  the rerun passes.

## 2026-09-05 Part 16E deployed Preview acceptance QA rerun

- Final result: **PREVIEW ACCEPTANCE NOT READY**. The canonical deployment is
  correctly isolated on `watchflow-preview`, and public route/responsive checks
  pass, but current deployed OTP-state browser health has a confirmed hydration
  failure. A minimal local fix passes its regression but has not been deployed.
  Dedicated Preview QA identities and disposable signup/recovery inboxes are
  also still unavailable, so the full authenticated acceptance gate cannot pass.
- Target guard passed before the only Auth request. Linked CLI metadata names
  `watchflow-preview` and its project-ref file agrees with that metadata. The
  live HTTP 200 response CSP pins exactly the corresponding Supabase HTTPS and
  WebSocket hostname, with the expected `nosniff`, frame denial, referrer, and
  restrictive permissions headers. No `watchflow-dev` destination was observed.
- Public deployed evidence passes: landing/login/sign-up/forgot-password/
  verify-email responses, safe callback/confirmation handling, 21/21 anonymous
  protected-route redirects, controlled recovery-session errors and 404, local
  signup validation, keyboard order, and neutral invalid-login copy. The
  in-app browser recorded zero warnings/errors for the normal public and
  invalid-login paths. `/auth/sign-up` returned HTTP 200.
- Public responsive Playwright passed all 13 widths from 320x568 through
  1920x1080. The full run passed 12 widths and one 1920x1080 navigation timed
  out; its focused rerun passed. Agent-browser checks at 390x844, 820x1180, and
  1366x768 found no horizontal overflow or control-boundary violation. A
  separate transient reset-page document/font timeout also passed immediately
  on focused rerun and is not classified as an application defect.
- Confirmed deployed defect: a synthetic, non-submitted pending-verification
  state rendered and accepted six-position keyboard/paste input, but browser
  diagnostics captured React hydration error 418. Root cause was the resend
  countdown calling `Date.now()` independently for the server render and first
  browser render. The local fix now renders a stable disabled availability
  placeholder, starts the clock after hydration, and preserves the live
  countdown. Its focused local production-browser regression passes with no
  browser failure.
- Browser-harness false failures were corrected without changing product
  behavior: Confirm password locators are exact, logged-out/recovery assertions
  use the current headings, logout uses the current login heading, and the
  synthetic pending-verification cookie derives its origin from Playwright's
  configured base URL. Focused Auth source coverage passes 15 tests.
- The only configured QA A/B identities remain pinned to `development` and an
  independently matching non-Preview Supabase target. They were not repurposed.
  No Preview QA A/B credentials, disposable signup/recovery inbox, or existing
  authenticated Preview session is available. Signup delivery, real OTP invalid/
  resend/verification, onboarding, established login/session/logout, recovery,
  every protected product mutation/read, browser-managed exports, authenticated
  responsive UI, and two-user isolation remain **BLOCKED**, not passed.
- Account deletion is **DEFERRED**: there is no dedicated disposable Preview
  deletion identity and the one-use deletion authorization is false. QA A/B,
  developer, owner, and personal accounts were not used.
- Final local validation passes: `npm run lint`; `npx tsc --noEmit`; exact
  `npm test` with 73 files/728 tests; `npm run build` with all 37 static pages;
  `npm run scan:client-secrets` across 507 browser artifacts; and
  `git diff --check`. Initial sandboxed test/browser/build process or network
  denials were rerun in the permitted environment and are not recorded as
  application failures.
- No deployment, database, account, QA row, dependency, migration, schema,
  policy, grant, or hosted configuration changed. Only the OTP Client Component,
  Auth route source regression, three Playwright files, one Playwright helper,
  and this handoff changed. Generated screenshots/traces/videos were removed.
- Exact next milestone: deploy the reviewed OTP hydration fix to the canonical
  Preview, provision dedicated `watchflow-preview` QA A/B identities plus
  disposable signup/recovery inbox inputs, and rerun the full authenticated,
  email, responsive, browser-health, isolation, and export matrix. Run deletion
  only with its distinct one-use account and explicit authorization. Part 17
  must not begin until Part 16E passes.

## 2026-09-01 Part 16E deployed Preview acceptance QA

- Final result: **PREVIEW ACCEPTANCE NOT READY**. The canonical deployed origin
  is reachable and its database-target guard passes, but the required
  authenticated acceptance, responsive, browser-health, email, and two-user
  journeys could not run with valid Preview identities in a browser-capable
  environment. This is a blocked evidence gate, not a confirmed application
  defect and not authorization for public production.
- Target guard: the existing linked-project metadata identifies
  `watchflow-preview`. The deployed landing/login/sign-up responses returned
  HTTP 200; their CSP and all 16 discovered browser JavaScript bundles contained
  only the exact linked Preview Supabase hostname, including its expected HTTPS
  and WebSocket origins. No foreign Supabase hostname or `watchflow-dev`
  destination was observed. No authenticated mutation preceded this guard.
- Public HTTP acceptance passes: landing, login, sign-up, forgot-password, and
  verify-email content/status checks; 21/21 anonymous protected-route redirects;
  safe callback, confirmation, and untrusted-next handling; exact Preview CSP,
  nosniff, frame denial, referrer, and permissions headers; and a controlled 404.
  `/auth/sign-up` returned 200. These are automated HTTP results, not browser or
  responsive results.
- Browser automation is **BLOCKED** before page execution. Repository
  Playwright failed before its first worker with Windows `spawn EPERM`; a direct
  Playwright Chrome launch failed before browser creation with the same error.
  The separate browser connector required approval while approval was disabled.
  No browser screenshot, trace, video, credential, cookie, token, or private
  content was retained.
- The configured QA A/B inputs remain explicitly development-targeted. A
  fail-closed, nonprinting ordinary-client Preview login probe revalidated the
  exact deployed target and then received `invalid_credentials` for both
  identities. Consequently signup/OTP/onboarding/recovery, established login
  and session persistence, all protected product mutations, browser-managed
  exports, responsive authenticated UI, console/network health, and two-user
  isolation are **BLOCKED**, not passed. No QA row or account was mutated.
- Account deletion is **DEFERRED**: neither a dedicated disposable Preview
  deletion identity nor explicit one-use authorization is configured. QA A/B
  were not used.
- Local validation: `npm run lint` and `npx tsc --noEmit` passed. Exact
  `npm test` was blocked before config load by Windows `spawn EPERM`; the
  documented native-loader/single-worker fallback passed 73 files/727 tests.
  `npm run build` compiled successfully and then was blocked starting Next's
  TypeScript child by `spawn EPERM`, so no local build pass is claimed.
  `npm run scan:client-secrets` passed 260 browser artifacts, and
  `git diff --check` passed before and after this documentation update.
- No production behavior, test, dependency, migration, database object,
  deployment configuration, account, or hosted data was changed. The only task
  change is this project-context evidence update.
- Exact next milestone: **Part 16E deployed Preview acceptance QA rerun —
  blocked-evidence closure**. Provision dedicated `watchflow-preview` QA A/B
  identities plus disposable signup/recovery inbox inputs, use a browser-capable
  runner, rerun the full acceptance/responsive/health/isolation/export matrix,
  and run deletion only if its distinct one-use account and authorization are
  supplied. Part 17 must not begin until Part 16E passes.

## 2026-08-30 final Part 15.5E beta-readiness rerun

- Final result: **READY TO BEGIN PART 16 PREVIEW DEPLOYMENT**. This permits an
  isolated Preview and its online QA, not a public production launch.
- `HEAD` and `origin/master` are `2bb576a`. GitHub Release Quality run
  `33268937218` passed every job step for that exact SHA: locked install,
  PostgreSQL 18 FROM-ZERO rebuild, both SQL audits, lint, TypeScript, exact
  unit/source tests, full production build, client-secret scan, Chrome install,
  and public responsive Playwright.
- Hosted development readiness passes with zero profile/preference backfill
  gaps. Profile hardening is applied: authenticated has table SELECT, no
  INSERT/table UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER, and UPDATE only on the
  six intended profile columns. Hosted production-security findings are zero.
- Fresh signup, delivered six-digit OTP, onboarding, established login/session,
  link-based recovery, and dedicated disposable account deletion have passing
  release-smoke evidence. The user-reported real authenticated browser journey
  covers the major protected product workflows and is recorded as MANUAL PASS.
- QA A/B RLS and comprehensive two-way isolation pass for user-owned data,
  representative mutations/RPCs, private identifiers, and CSV/JSON exports
  without a service-role/admin bypass.
- Windows automated authenticated Playwright remains BLOCKED before worker
  startup by `spawn EPERM`; no local browser PASS is claimed. A fresh
  authenticated mobile/tablet and browser-managed export save/open sweep is
  deferred to Preview. Current manual browser, authenticated route/RLS, and
  Linux public browser evidence is not invalidated by this host limitation.
- Preview must use a new production Supabase project, apply all migrations from
  zero, use separate Vercel/environment/Auth configuration, and never connect
  to `watchflow-dev`.
- This consolidation changes documentation only and remains uncommitted.

## 2026-08-30 Part 15.5G final two-user isolation verification

- A guarded, one-run development audit signed in both designated QA users with
  the public publishable key and ordinary cookie-based authenticated Supabase
  clients. It used no service-role/admin client, did not bypass RLS, verified
  the exact development-project pin, and emitted no credential, identity,
  private value, export content, cookie, or token.
- The audit created uniquely marked temporary data for each QA user and proved
  both `QA A -> QA B` and `QA B -> QA A` isolation for profiles, preferences,
  library relationships and all personal movie fields, favourites, ratings,
  reviews, watched dates, Watch Next membership/order, schedule notes/timezones,
  custom lists, memberships, and list ordering. Shared `movies` metadata was
  treated as intentionally common.
- Representative foreign SELECT, UPDATE, DELETE, and ownership-derived RPC
  attempts returned no accessible/changed rows or the expected safe rejection.
  Cross-parent list membership insertion was also rejected. Follow-up reads by
  the owning user proved that the targeted rows survived unchanged.
- Authenticated HTTP route checks returned each user's private routes, excluded
  the other user's unique markers, rendered nonrevealing not-found content for
  foreign movie/list identifiers, and preserved owned-detail access. Picker,
  Recommendations, and Statistics route output contained no foreign private
  markers; focused ownership-source contracts cover their authenticated
  `user_id` scoping and RLS-backed reads.
- Each user's CSV and JSON exports contained that user's controlled marker and
  excluded the other user's marker and email. Export generation used the normal
  authenticated application routes; no database/admin substitute was used.
- Audit cleanup removed only the uniquely identified temporary lists and
  library rows, restored any guarded profile/preference state, and verified the
  original Watch Next queue IDs and positions exactly. A subsequent guarded
  preflight found no stale audit markers. No account, policy, schema, hosted
  configuration, or non-QA data was changed.
- The existing hosted RLS integration suite passes 1 file/5 tests. Focused
  discovery/statistics/export/settings/list/library ownership contracts pass 7
  files/77 tests. `git diff --check`, lint, and direct TypeScript pass. Exact
  `npm test` is blocked before config load by Windows `spawn EPERM`; the full
  native-loader, single-thread fallback passes 73 files/727 tests.
- The dedicated Playwright two-user isolation case was enabled and selected,
  but Windows denied the worker child process with `spawn EPERM` before the test
  body or a browser launched. No browser mutation occurred. Browser isolation
  evidence is therefore **BLOCKED**, not PASS; database/RLS, authenticated
  route, export, and source-contract isolation evidence passes.
- This milestone changes documentation only. The one-run ignored audit harness
  was removed after execution, and all changes remain uncommitted.

## 2026-08-30 Part 15.5G authenticated browser QA attempt

- The guarded Playwright configuration discovered all three authenticated smoke
  cases without a guarded/skip prefix, establishing that the loopback,
  development-target, exact Supabase URL pin, and dedicated QA configuration
  gates are satisfied without printing their values.
- The already-running loopback application returned HTTP 200, and a read-only
  runtime check confirmed its CSP contains both the exact pinned Supabase HTTPS
  origin and corresponding WebSocket origin. Reuse was enabled only for the
  subsequent guarded command after those checks passed.
- No repository Playwright browser test executed. The guarded one-worker run
  failed before the first worker when Windows denied Playwright's Node child
  process with `spawn EPERM`. A separate direct headless Chrome launch also
  failed before browser creation with `spawn EPERM`.
- The available direct Playwright browser connector could not be used because
  this session's tool policy requires approval while approval is disabled. No
  page was opened through that connector. Server-render fetches or source tests
  were not substituted for the requested real browser evidence.
- Result: every authenticated journey, persistence, export, responsive, and
  browser-health item remains **BLOCKED**, and authenticated browser QA is not
  passing. No QA user was mutated, QA User B was untouched, account deletion was
  not run, and no credential, cookie, token, screenshot, trace, video, or private
  export was printed or retained.
- This verification changes documentation only. It does not change application
  code, tests, workflows, dependencies, migrations, hosted databases, Auth
  configuration, or production data.

## 2026-08-29 Part 15.5G hosted profiles privilege drift

- Hosted development catalog evidence found authenticated table privileges
  `DELETE`, `INSERT`, `REFERENCES`, `SELECT`, `TRIGGER`, and `TRUNCATE` on
  `public.profiles`; table-level `UPDATE` was correctly absent and narrow
  column UPDATE grants remained present.
- Reachable and reflog Git history contains no broad profiles grant to
  `authenticated` and no profile default-privilege statement. The reconstructed
  baseline explicitly revokes browser-role table privileges before restoring
  SELECT/narrow UPDATE, so it did not cause the hosted drift. The hosted set is
  exactly PostgreSQL table `ALL` minus `UPDATE`: the original broad grant is in
  the older unversioned hosted baseline/default ACL, while
  `202607220003_user_settings.sql` removed only table UPDATE and therefore left
  the other six privileges behind. The absent original DDL means repository
  evidence cannot distinguish an explicit legacy `GRANT ALL` from an old ALL
  default ACL without inventing provenance.
- New forward-only migration
  `202608290001_profiles_privilege_hardening.sql` revokes every profile table
  privilege from `PUBLIC`/`anon`, removes authenticated INSERT/table UPDATE/
  DELETE/TRUNCATE/REFERENCES/TRIGGER, and restores only authenticated SELECT and
  UPDATE on `full_name`, `avatar_url`, `country`, `timezone`, `updated_at`, and
  `onboarding_completed_at`. It does not change RLS, policies, Auth trigger/
  cascade behavior, default privileges, functions, or service-role access.
- Readiness/security SQL now audits all seven profile table privileges for both
  API roles, exact profile UPDATE columns, and table-level UPDATE. Focused source
  contracts pass 5 files/39 tests. A disposable PostgreSQL 18 FROM-ZERO rebuild
  applied all 11 migrations with zero readiness/security failures; a separate
  exact ALL-minus-UPDATE simulation reproduced the hosted six-privilege set and
  the new migration reduced it to SELECT plus the six intended UPDATE columns.
- Final repository gates: `git diff --check`, lint, and direct TypeScript pass.
  Exact `npm test` remains blocked before config load by Windows `spawn EPERM`;
  the supported native-loader fallback passes 73 files/727 tests. The final
  FROM-ZERO readiness run has zero `MISSING` results and the production security
  audit has zero findings.
- The migration was not applied to Supabase. Review and deliberate development
  application remain required before rerunning the hosted audit.

## 2026-08-29 Part 15.5G auth production-build regression

- The first clean Ubuntu release-quality run passed dependency installation,
  the PostgreSQL FROM-ZERO rebuild and both SQL audits, lint, direct
  TypeScript, and 71 files/716 tests. `npm run build` then compiled and
  completed TypeScript but failed while prerendering `/auth/login` because
  uncached data was accessed outside Suspense.
- Exact source path: `/auth/login` awaited `redirectAuthenticatedUser()` at
  page scope; that helper constructed the cookie-bound server Supabase client,
  whose first request-time operation is `await cookies()`, then called the
  uncached `auth.getClaims()`. With Cache Components enabled and no Suspense
  ancestor, the whole route blocked prerendering before it could emit a static
  shell. Sign-up and verify-email had the same unbounded session-check pattern;
  verify-email also reads its short-lived pending-verification cookie.
- Added a server-only `PublicAuthGate` beneath focused Suspense boundaries on
  login, sign-up, and verify-email. The static `AuthShell` and an accessible
  session-check fallback remain prerenderable; cookie/claims and pending-email
  reads are deferred to request time. Update-password and auth-error already
  had correct local Suspense boundaries, and forgot-password remains static.
- No dynamic route opt-out, Cache Components change, auth-check removal,
  Client Component conversion, workflow weakening, Supabase security change,
  dependency, environment variable, or database migration was introduced.
- Verification: `git diff --check`, lint, and direct TypeScript passed. Focused
  auth/onboarding passed 12 files/98 tests; the full native-loader fallback
  passed 72 files/721 tests, and the client-secret scan passed 260 browser
  artifacts. Exact `npm test` remains blocked before config load by Windows
  `spawn EPERM`. `npm run build` compiled successfully and then hit the same
  Windows denial starting Next's TypeScript child, before static generation;
  no local build pass is claimed. Commit/push is still required for the
  unchanged Ubuntu workflow to provide authoritative build and prerender
  evidence.

## 2026-08-28 Part 15.5F release blocker remediation

- Fixed the development guard's loader-order defect without weakening its
  exact URL pin. `.env.local` remains authoritative for app configuration,
  `.env.test.local` supplies only missing QA values, final declarations win
  within each file, and explicit shell/CI values remain authoritative.
- Reconstructed `202607200001_base_schema.sql` from Git, docs, code, later
  migrations, verification SQL, and guarded development OpenAPI evidence. It
  creates the pre-Phase-3 profiles/movies/user_movies contract, RLS, grants,
  checks, cascades, and profile trigger while leaving later columns/tables to
  their existing migrations.
- Executed a genuine FROM-ZERO rebuild in a disposable local PostgreSQL 18
  cluster. The first attempt identified a baseline policy-name collision; the
  corrected baseline plus all nine existing migrations then applied cleanly.
  Both SQL audits passed the rebuilt final schema with zero security findings.
- Guarded development evidence now passes: OpenAPI table/column and current
  RPC contracts; QA A/B RLS (5 tests); reversible onboarding ownership (4);
  TMDB limiter behavior (10); and 15/15 authenticated protected-route reads for
  each QA account. Exact hosted catalog SQL remains blocked by absent database
  connection credentials/linked CLI.
- Safely patched the Next/PostCSS/Nanoid production path and current ESLint
  transitive advisories. Production-only and full npm audits report zero
  vulnerabilities; no force or major upgrade was used.
- Added an Ubuntu non-live workflow for `npm ci`, FROM-ZERO PostgreSQL
  verification, lint, TypeScript, unit/source tests, build, client-secret scan,
  and public responsive Playwright. It contains no real QA or hosted Supabase
  secret and is not yet executed because changes remain uncommitted/unpushed.
- Remaining blockers: hosted development catalog SQL, Playwright/live browser
  flows, disposable inbox OTP/recovery, separately authorized deletion, and a
  successful clean-environment workflow/build run. See
  `docs/RELEASE_BLOCKER_REMEDIATION.md`.

## 2026-08-27 Part 15.5E final beta regression QA

- Part 15.5D is committed at `480303f`; QA began from a clean tree. Repository
  hygiene, conflict checks, ignored environment/QA artifacts, direct
  TypeScript, lint, public HTTP route smoke, and client-secret scanning pass.
- The version-controlled migration sequence has nine unique timestamps and
  compatible incremental dependencies. It cannot recreate the complete schema
  from zero because the original `profiles`, `movies`, and `user_movies` base
  migration remains absent. A source contract now preserves that explicit gap.
- The live safety gate failed closed: `E2E_TARGET_ENV` is development and both
  QA accounts are configured, but the configured and independently expected
  Supabase URLs do not exactly match. No live read, mutation, email, RLS,
  provider, or destructive workflow was attempted after that result.
- Full source/unit coverage passes through the supported runner loader. The
  required `npm test`, Playwright worker startup, integration fork pool, and
  Next TypeScript child remain blocked by Windows `spawn EPERM`; Next bundle
  compilation and direct TypeScript succeed.
- Production dependency audit fails on three high-severity transitive
  Next/PostCSS/Nanoid findings for which npm reports no available fix. Full
  audit also reports development-tool findings.
- Overall result: **FAIL / NO-GO for Part 16 Preview deployment** until the
  base-schema provenance, exact development target pin, dependency findings,
  live guarded regression matrix, and executable browser/build environment are
  resolved. See `docs/FINAL_BETA_QA.md` for the complete PASS/FAIL/BLOCKED
  matrix.

## 2026-08-26 Part 15.5C app discoverability and user friendliness

- Confirmed Part 15.5B is committed at `41cb4b4`; the milestone began from a
  clean worktree. The older Part 15.5B status below is retained as historical
  handoff evidence and is superseded by this section.
- Replaced the flat authenticated destination list with one shared, ordered,
  semantic group model used by desktop and mobile: Home; Your movies;
  Discover; Insights; Account. Current-route semantics, text labels, icons,
  focus behavior, Settings, sign out, and the existing drawer are preserved.
- Canonical route names are Dashboard, Search, Library, Watch Next, Schedule,
  Lists, Movie Picker, Recommendations, Statistics, Import Movies, and
  Settings. Contextual CTAs remain verb-led.
- Refined every major protected page's purpose copy and key actions. Dashboard
  now prioritizes a small state-aware Next actions area and Library overview;
  Library adds a status guide and explicit selection mode; Movie detail
  separates Movie information, Your WatchFlow details, and its destructive
  removal section.
- Watch Next explicitly contrasts Want to Watch; Lists explicitly contrasts
  the immediate queue and moves deletion to a separated detail section; Picker
  collapses optional filters; Recommendations reduces competing cold-start
  actions while preserving transparent reasons; Schedule/Statistics/Profile
  remove implementation language; Import progressively explains CSV matching;
  Settings uses Data & Account with exports above Danger Zone.
- Added `lib/ux/discoverability.test.ts`, guarded read-only
  `e2e/discoverability.spec.ts`, and updated existing canonical-label/browser
  contracts. Created `docs/DISCOVERABILITY_UX_AUDIT.md` and updated Product,
  Architecture, Testing, and Production Readiness documentation.
- Pre-edit real-app authenticated HTTP rendering used both guarded QA accounts:
  all 15 static protected routes returned 200 for each account, both owned
  movie details returned 200, and the populated account's owned list detail
  returned 200. The lighter account exposed empty Watch Next, Schedule, Lists,
  and limited Statistics states. No user data was mutated.
- Final local verification: lint and direct TypeScript passed; the focused
  discoverability suite passed 4 files/53 tests; and the complete runner-loader
  fallback passed 69 files/707 tests. The required `npm test` entry point hit
  Windows `spawn EPERM` twice before config load.
- Guarded discoverability Playwright loaded four cases and responsive
  Playwright loaded 17 cases, but both hit `spawn EPERM` before a worker on two
  attempts. Direct Chrome startup also failed with access denied, so no fresh
  interactive viewport, console/network, focus, or keyboard pass is claimed.
- The final client-secret scan passed 260 current browser artifacts (an earlier
  pre-build scan passed 325). Next compiled the
  production bundle successfully twice, then hit `spawn EPERM` while launching
  its TypeScript worker; direct TypeScript passed. `/auth/sign-up` returned 200.
- Database: no migration, table, column, function, policy, grant, index,
  trigger, dependency, or environment variable was added or changed.
- Current milestone: Part 15.5C - App Discoverability & User Friendliness.
- Next milestone: Part 15.5D - Final Visual/UI Polish.

## 2026-08-17 Part 15.5B first-time onboarding

- Added protected `/onboarding` with three URL-backed, refresh-safe steps:
  Welcome, Personalize, and First Movies. It uses a focused branded shell
  without the authenticated navigation sidebar.
- Migration `202608170001_part_15_5b_first_time_onboarding.sql` adds nullable
  `profiles.onboarding_completed_at`. It backfills every profile present at
  deployment so established users remain complete; profiles created afterward
  default to null. It grants authenticated UPDATE only on the new column and
  relies on existing own-profile RLS. It was not applied remotely.
- OTP verification now reads the verified user's profile after `getUser()`:
  incomplete profiles enter `/onboarding`; completed or missing legacy
  profiles enter `/dashboard`. A schema/read failure also falls back to
  Dashboard so a staggered manual migration cannot break email verification.
- Personalize persists only settings already used by the product: profile
  timezone, preferred TMDB search language, and grid/list Library view. Genre
  preferences are deferred because the current picker/recommendation engine
  consumes owned library metadata and activity and has no genre-preference
  contract.
- First Movies reuses `searchTmdbMoviesForCurrentUser`, its per-user database
  limiter and in-flight deduplication, shared metadata ingestion, unique
  duplicate protection, and the Part 12 status RPC. Choices are only Want to
  Watch and Watched; status changes do not invent `watched_at`.
- Movie additions and Step 2 preferences persist immediately. Finish and Skip
  only stamp completion, preserve partial data, revalidate private product
  routes, and redirect to Dashboard. The app is not globally gated.
- Existing empty discovery/Statistics states were retained; Dashboard adds a
  compact Import Movies quick action so zero-movie completion still exposes
  Search, Import, and Library paths.
- Added unit/source/migration contracts, guarded live onboarding RLS coverage,
  and guarded Playwright flows for completion, skip, refresh, status choices,
  two-user isolation, and the requested viewport matrix. Delivered OTP-to-
  onboarding execution remains dependent on a disposable inbox and hosted Auth
  configuration.
- Verification on 2026-08-17: clean lint and direct TypeScript passed; focused
  onboarding/auth passed 8 files/75 tests; the full runner-loader fallback
  passed 68 files/688 tests. Required `npm test` was blocked before config load
  by `spawn EPERM` twice. Onboarding Playwright loaded four guarded/skipped
  cases; responsive Playwright hit `spawn EPERM` twice before a browser worker.
  The final client-secret scan passed 260 artifacts. Next compiled twice, then hit
  `spawn EPERM` starting its TypeScript child, so build is not claimed passed.
  Live migration, OTP delivery, database isolation, and authenticated browser
  evidence remain blocked and were not simulated as passes.
- Current milestone: Part 15.5B - First-Time User Onboarding.
- Next milestone: Part 15.5C - App Discoverability & User Friendliness.

## 2026-08-15 Part 15.5A authentication + signup email OTP

- Signup is now a server-validated email/password Server Action with full name,
  normalized email, password confirmation, safe errors, duplicate-submit
  protection, and `full_name` Auth metadata for the existing profile trigger.
- Successful unverified signup redirects to `/auth/verify-email`; the legacy
  success route now redirects into the verification recovery state.
- Supabase remains the OTP authority. Verification uses the installed SDK
  `verifyOtp({ email, token, type: "email" })`; resend uses
  `resend({ type: "signup", email })`. Normal login remains password-based.
- Pending email lives for 15 minutes in an HttpOnly, `SameSite=Lax`,
  production-secure, `/auth`-scoped cookie with only email/expiry/resend timing.
  It is not authorization. Success also requires a fresh confirmed Auth user
  and session before `/dashboard`.
- `/auth/verify-email` provides one accessible numeric input rendered as six
  positions, whole-code paste, native keyboard editing, masked email, stable
  feedback space, resend countdown, and change-email cleanup.
- Login, signup, verification, forgot/reset, and auth-error screens share a
  responsive WatchFlow shell. `/auth/callback` and `/auth/confirm` remain for
  recovery, existing emails, and other token-hash flows.
- Focused auth Vitest passed 5 files/42 tests. Lint and direct TypeScript pass;
  the full fallback Vitest run passed 62 files/637 tests; and the current
  251-artifact client-secret scan passes.
- Required `npm test`, Playwright execution, and final Next build are
  environment-blocked by persistent Windows `spawn EPERM`. `npm test` failed
  before loading config twice; the equivalent supported Vitest runner-loader
  command passed all tests. Playwright listed all 10 auth tests successfully
  but failed before server/browser startup twice. Next compiled successfully
  twice and then failed spawning its TypeScript child; direct TypeScript passes.
- No local Supabase Auth config, linked CLI metadata, available Management API
  credential, or disposable mailbox exists. Runtime environment files were not
  read because their values are secret. Hosted OTP length/expiry/rate-limit/
  template state and delivery therefore remain blocked.
- Historical Part 15.5A handoff: Part 15.5B was next and verified signup then
  redirected directly to Dashboard; the Part 15.5B section above supersedes
  that routing behavior.

## 2026-08-12 responsive UX milestone

- Recovered the interrupted 57-file responsive working tree without reset,
  checkout, clean, restore, or component duplication. No truncated files,
  unresolved imports, database changes, or migration changes were found.
- Added a mobile-first shared page/layout/action/empty/data-region system, a
  viewport-constrained dialog system, and a compact labelled mobile/tablet
  navigation drawer. The full labelled sidebar begins at `lg`.
- Updated all public/auth routes and the Dashboard, Search, Library, movie
  detail, Statistics, Lists, Picker, Recommendations, Import, Watch Next,
  Schedule, and Settings route families, including responsive loading, error,
  empty, not-found, filter, bulk-action, and confirmation states.
- Horizontal overflow is fixed at its source; the root does not hide overflow.
  Only labelled Import data regions have explicitly approved local horizontal
  scrolling.
- Added reusable Playwright overflow/boundary/form/dialog checks. The 13-case
  public matrix passed; the final clean-server protected matrix passed 10/10
  at 375x667, 390x844, 768x1024, 820x1180, and 1366x768. The earlier expanded
  protected sweep passed all static routes at 320, 360, 375, 390, 412, 600,
  768, 820, 1024, 1366, 1440, and 1920 widths.
- Local gates: lint and direct TypeScript passed; 59 Vitest files/611 tests
  passed; the Next 16.2.12 production build generated 35 route shells; and the
  478-artifact client-secret scan passed.
- Remaining evidence: the separately guarded destructive account-deletion run,
  delivered password-reset email, real-device/assistive-technology Preview
  checks, and a controlled TMDB search/add smoke that timed out despite direct
  provider HTTP 200 reachability. No responsive test depends on that provider
  smoke.
- Current milestone: responsive implementation and local responsive gate are
  complete in the uncommitted working tree.
- Next milestone: controlled Preview verification, including real devices,
  assistive technology, email links, database catalog/RLS checks, and the
  remaining guarded product workflows.

## 2. Product Overview

WatchFlow is a private, multi-user movie-management SaaS for discovering movies, maintaining a personal library, choosing what to watch next, and planning viewing times.

The implemented flow is:

1. Register or sign in with email and password.
2. Search TMDB from the server and retrieve normalized movie metadata.
3. Add a shared movie record to a private, RLS-protected personal library.
4. Track status, rating, review, priority, watched date, and rewatch intent.
5. Order a Watch Next queue or schedule a local date/time and IANA timezone.
6. Organize personal-library movies into ordered private custom lists.
7. Pick a filtered random library movie or review transparent, rule-based
   recommendations from the private library.
8. Review private, server-calculated personal viewing statistics.
9. Import a downloaded CSV, export private data, and manage account settings.

The product currently supports authentication, profiles, title search, private
libraries, movie management, queueing, scheduling, favourites, private custom
lists, a random picker, rule-based recommendations, CSV import, CSV/JSON
export, settings, a personal Statistics page, and basic dashboard summaries.
It does **not** contain public/global/social analytics, shared lists, AI
recommendations or insights, notification delivery, calendar sync, or payments.

The direction remains a production-oriented SaaS, but paid launch is deferred. The repository contains no billing implementation or proof of a production deployment.

## 3. Technology Stack

| Area | Actual repository choice |
|---|---|
| Framework | Next.js App Router; `next` pinned and installed as `16.2.12` |
| UI runtime | React and React DOM `19.2.7` installed (`^19.0.0` declared) |
| Language | TypeScript `5.9.3`, strict mode, path alias `@/*` |
| Styling | Tailwind CSS `3.4.19`, PostCSS, Autoprefixer, `tailwindcss-animate` |
| Components | Radix primitives, shadcn-style local components, Lucide icons, `next-themes` |
| Auth/data | Supabase Auth, PostgreSQL, and RLS through `@supabase/ssr 0.12.3` and `@supabase/supabase-js 2.110.7` |
| Movie data | Server-only TMDB API v3 adapter with provider-neutral internal types |
| Validation | Zod `4.4.3` for settings and custom lists; typed custom validators for library/import/TMDB inputs |
| CSV parsing | Custom parser in `lib/import/csv.ts`; no third-party CSV package |
| Charts | No charting dependency; Part 15.1 uses semantic HTML and lightweight CSS bars with visible text values |
| Tests | Vitest `4.1.10`; the committed Statistics baseline has 59 unit/contract files plus a guarded real-Supabase integration configuration |
| Browser E2E | `@playwright/test 1.62.0`, headless Chrome, safe in-memory QA contexts, public regressions, and credential-gated authenticated/two-user/account-deletion/Statistics suites |
| Deployment | Vercel is the intended target inferred from runtime variables/starter UI; no `vercel.json` or deployment record exists |
| Package manager | npm with `package-lock.json` lockfile version 3 |

Part 15 aligns `eslint-config-next` with Next `16.2.12`, migrates ESLint to
the native flat configuration, and overrides Next's internal PostCSS/sharp
versions to audited compatible releases. Final production-only and full
`npm audit` runs both report zero vulnerabilities.

## 4. Repository Structure

| Path | Purpose |
|---|---|
| `app/` | The only App Router root; public/auth routes and protected `(app)` route group |
| `app/(app)/actions/` | Library, management, CSV-import, Part 13 list, and Part 14 picker Server Actions |
| `components/` | Auth, shell, movie, import, settings, library/list UI, Part 14 discovery UI, and reusable UI components |
| `lib/auth/` | Safe redirect validation and auth route contracts |
| `lib/movies/` | Provider contract, TMDB adapter/mapper, authenticated rate limiting, shared metadata cache, movie types, and validation |
| `lib/library/` | Legacy/detail library service plus Part 12 query parsing, URL state, mapping, selection, mutations, queue, schedule, and Supabase adapters |
| `lib/import/` | CSV parsing, mapping, validation, matching, confirmation, persistence |
| `lib/settings/` | Settings adapters/types, formatting, exports, and data controls |
| `lib/lists/` | Part 13 list types, Zod validation, defensive mapping, safe errors, authenticated queries/mutations, and tests |
| `lib/discovery/` | Part 14 private dataset adapter, mapping, picker validation/matching, mood rules, recommendation scoring/diversity, errors, types, and tests |
| `lib/statistics/` | Part 15.1 private query adapter, normalization, pure metric/distribution/timeline calculations, formatting, errors, types, and tests |
| `lib/supabase/` | Browser, server, proxy, auth-context, admin, and safe-error modules |
| `docs/` | Architecture, database, product, testing/security/readiness reports, implementation plan, and this canonical context |
| `supabase/migrations/` | Complete 11-migration sequence from the reconstructed base schema through final profile privilege hardening |
| `supabase/verification/` | Read-only database readiness and production security audit scripts |
| `integration/`, `vitest.integration.config.ts` | Guarded two-user real-Supabase RLS verification plus a separately opted-in limiter contract/concurrency harness with read-only privileged diagnostics |
| `scripts/` | Post-build client-secret-pattern scanner |
| `lib/**/*.test.ts` | Vitest unit, adapter, route/source, and migration-contract tests |
| `e2e/`, `playwright.config.ts` | Public auth/protection/responsive tests plus guarded in-memory QA fixtures, two-user isolation, controlled mutation, CSV, and disposable deletion coverage |
| `app/*.{ico,png}` | Favicon and social metadata images |

There is no `src/app/`, `features/`, or `public/` directory. Extend the existing root `app/` tree; never create a second App Router root.

## 5. Critical Routes

The `(app)` directory is a route group and does not appear in URLs.

| Route | Kind | Access and purpose |
|---|---|---|
| `/` | Page | Public WatchFlow landing page |
| `/auth/login` | Page | Public password login |
| `/auth/sign-up` | Page | Public email/password registration; critical regression route |
| `/auth/sign-up-success` | Page | Legacy public route that redirects to `/auth/verify-email` |
| `/auth/verify-email` | Page | Public pending-signup email OTP entry and recovery state |
| `/auth/forgot-password` | Page | Public recovery-email request |
| `/auth/reset-password` | Page | Recovery-session-gated alias of `/auth/update-password` |
| `/auth/update-password` | Page | Recovery-session-gated password update |
| `/auth/error` | Page | Public callback error display |
| `/auth/callback` | GET Route Handler | Public PKCE code or token-hash callback |
| `/auth/confirm` | GET Route Handler | Public token-hash confirmation callback |
| `/onboarding` | Page | Verified authenticated optional three-step first-time setup; completed users redirect to Dashboard |
| `/dashboard` | Page | Protected dashboard and viewing summaries |
| `/search` | Page | Protected server-side TMDB title search; query key `q` |
| `/library` | Page | Protected server-query library; canonical URL keys `q`, `status`, `watched`, `favourite`, `genre`, `director`, `year`, `yearFrom`, `yearTo`, `ratingMin`, `ratingMax`, `sort`, `view`, `page`, `perPage`; legacy `filter` is accepted |
| `/library/[movieId]` | Dynamic page | Protected stored movie detail, personal management, favourite toggle, and private custom-list membership editor |
| `/lists` | Page | Protected private custom-list summaries, count, create/edit/delete actions, and poster previews |
| `/lists/[listId]` | Dynamic page | Protected owned-list detail, library picker, ordering, and membership-only removal; invalid/missing/foreign UUIDs share one not-found result |
| `/picker` | Page | Protected random picker using explicit private-library filters, URL filter state, and session-memory repeat avoidance |
| `/recommendations` | Page | Protected transparent rule-based recommendations from eligible unwatched private-library movies |
| `/statistics` | Page | Protected personal library summary metrics, status/genre/rating distributions, 12-month watched activity, and watched-movie lists |
| `/import` | Page | Protected seven-step CSV import |
| `/watch-next` | Page | Protected ordered queue |
| `/schedule` | Page | Protected scheduler and Today/Upcoming/Past groups |
| `/settings` | Page | Protected settings overview |
| `/settings/profile` | Page | Protected profile settings |
| `/settings/preferences` | Page | Protected application/search/display defaults |
| `/settings/notifications` | Page | Protected future-notification preferences |
| `/settings/data` | Page | Protected exports and destructive data controls |
| `/settings/data/export/csv` | GET Route Handler | Protected private CSV attachment |
| `/settings/data/export/json` | GET Route Handler | Protected private JSON attachment |
| `/protected` | Page | Protected compatibility route that redirects to `/dashboard`; it no longer renders starter claims/tutorial content |

No `/api/*` route exists. Loading, error, not-found, layout, favicon, and metadata-image files are framework boundaries/assets, not routes.

## 6. Authentication Architecture

- Supabase email/password Auth uses cookie-backed `@supabase/ssr` clients.
- Browser client: `lib/supabase/client.ts`; public URL and publishable key only.
- Server client: `lib/supabase/server.ts`; one request-scoped client using `cookies()`.
- Session proxy: root `proxy.ts` delegates to `lib/supabase/proxy.ts`, preserves every Supabase cookie mutation, calls `auth.getClaims()`, and redirects anonymous protected prefixes to `/auth/login`.
- The protected `app/(app)/layout.tsx` repeats the verified-claims boundary through `lib/supabase/auth.ts` and owner-filters the profile by `claims.sub`.
- Settings, library mutations, imports, exports, discovery reads, and
  Statistics reads, and destructive operations use fresh `auth.getUser()` checks where current
  Auth-server data is required.
- Login calls `signInWithPassword()`, then replaces navigation with `/dashboard` and refreshes Server Components.
- Signup uses a server-validated Server Action, calls `signUp()` with
  `full_name` metadata, stores short-lived pending-email context, and redirects
  to `/auth/verify-email` without creating a protected session.
- Signup confirmation uses the code in `{{ .Token }}`. Verification resolves
  pending email server-side, calls `verifyOtp()` with email/token/type `email`,
  validates the fresh confirmed Auth user/session, then enters `/dashboard`.
- `/auth/callback` supports PKCE `code` exchange and token-hash OTP verification;
  `/auth/confirm` supports token-hash links.
- `lib/auth/safe-redirect.ts` accepts only internal single-slash paths and rejects missing, protocol-relative, or backslash-containing redirect values.
- Recovery uses `/auth/callback?next=/auth/update-password`; the reset/update page verifies claims before the browser calls `updateUser()`.
- Callback OTP types are allowlisted and callback failures use stable reason
  codes rather than provider messages in URLs.
- Sign-out is a cookie-aware Server Action, checks fresh Auth state, clears the
  local session, disables repeat submission while pending, and redirects only
  after Supabase succeeds.
- Browser Supabase configuration is validated before client construction;
  public auth forms map configuration, network, and provider failures to
  controlled messages and never expose a configuration-related `Failed to
  fetch`.
- Auth cards expose page-level `h1` headings; form/provider errors use `role="alert"`, and forgot-password success uses `role="status"`.
- The final Playwright MCP/repository E2E pass confirmed public auth semantics,
  controlled callback failures, keyboard order, and `/auth/sign-up` route
  stability. The real invalid-provider-login case was guarded and skipped in
  that final run; source tests still enforce controlled auth-error mapping.

Authorization warning: use verified `auth.getUser()` for fresh user-sensitive mutation/deletion boundaries; verified `auth.getClaims()` is the established proxy/layout JWT check. Never use `getSession()` as authorization, accept `user_id` from browser input, or use an admin key for login/ordinary user mutations.

Historical regression: `/auth/sign-up` was previously removed during unrelated work and returned 404. It now exists and `lib/auth/routes.test.ts` guards it; re-test after every major milestone.

Account deletion requires exact confirmation, a checkbox, and server-verified `last_sign_in_at` no older than 30 minutes before final Auth admin deletion.

## 7. Environment Variables

Names only are recorded here; values must never enter this file.

| Variable | Purpose | Exposure | Requirement |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL for browser/server/proxy/admin clients | Browser-safe public | Required |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable or legacy anon value under this exact name | Browser-safe public | Required |
| `SUPABASE_SECRET_KEY` | Shared movie metadata upsert and final Auth-user deletion | Server-only secret | Required for full product |
| `TMDB_READ_ACCESS_TOKEN` | TMDB Bearer token for search/details/import | Server-only secret | Required for movie workflows |
| `NEXT_PUBLIC_APP_URL` | Reserved public application origin name; current source does not consume it | Browser-safe public | Optional |
| `VERCEL_URL` | Platform-provided metadata base URL | Server/runtime | Optional; localhost fallback |
| `VERCEL_ENV` | Referenced only by a dormant starter tutorial component; no current route renders it | Server/runtime | Optional |
| `VERCEL_PROJECT_PRODUCTION_URL` | Referenced only by a dormant starter tutorial component; no current route renders it | Server/runtime | Optional |
| `NODE_ENV` | Framework mode and development-only safe error logging | Runtime | Framework-provided |
| `PLAYWRIGHT_BASE_URL` | Optional Playwright target override; defaults to `http://localhost:3000` | Test runtime | Optional |
| `E2E_BASE_URL` | Preferred Playwright target override | Test runtime | Optional |
| `E2E_WEB_SERVER_COMMAND` | Local command Playwright manages for the target | Test runtime | Optional |
| `E2E_TARGET_ENV` | Must equal `development` before authenticated QA mutations are enabled | Test runtime | Required for authenticated QA |
| `E2E_EXPECTED_SUPABASE_URL` | Exact disposable-development project pin; must match `NEXT_PUBLIC_SUPABASE_URL` | Test runtime | Required for authenticated QA and live integration |
| `E2E_USER_A_EMAIL`, `E2E_USER_A_PASSWORD` | Disposable QA User A | Test secret | Required for authenticated QA |
| `E2E_USER_B_EMAIL`, `E2E_USER_B_PASSWORD` | Disposable QA User B | Test secret | Required for isolation QA |
| `E2E_DELETE_ACCOUNT_EMAIL`, `E2E_DELETE_ACCOUNT_PASSWORD` | Dedicated one-shot deletion account, distinct from A/B | Test secret | Required only for deletion QA |
| `E2E_RUN_ACCOUNT_DELETION` | Explicit one-shot deletion opt-in | Test runtime | Required only for deletion QA |
| `E2E_TEST_MOVIE_QUERY` | Controlled QA search title | Test runtime | Optional |
| `RUN_SUPABASE_INTEGRATION_TESTS` | Explicit real-development-project RLS suite opt-in | Test runtime | Required for live integration |
| `RUN_TMDB_RATE_LIMIT_INTEGRATION_TESTS` | Explicit authenticated limiter RPC contract/concurrency opt-in | Test runtime | Required only for live limiter integration |
| `E2E_RATE_LIMIT_BUCKETS_ARE_FRESH` | Operator confirmation used in addition to a read-only freshness check | Test runtime | Required only for live limiter integration |
| `RUN_TMDB_RATE_LIMIT_E2E` | Explicit opt-in for sequential real TMDB search traffic | Test runtime | Required only for limiter browser QA |
| `E2E_RATE_LIMIT_UI_BUCKETS_ARE_FRESH` | Operator confirmation that QA UI search buckets are fresh | Test runtime | Required only for limiter browser QA |
| `CI` | Enables CI retries, one worker, and strict `test.only` rejection | Test runtime | Optional |

`.env.example` records these names and non-secret local placeholders only.
Real values remain in ignored local/CI configuration. `TMDB_API_BASE_URL` and
`TMDB_IMAGE_BASE_URL` are not environment variables here; TMDB API/image bases
remain fixed module constants.

## 8. Database Schema

The original historical baseline was absent from early repository history, so
`202607200001_base_schema.sql` was reconstructed from converging repository and
hosted evidence. The reviewed 11-migration sequence now rebuilds from zero and
passes both SQL audits. Hosted development catalog/readiness evidence verifies
the final objects and security contract; generated database types and a linked
Supabase CLI history are still not repository dependencies.

| Table | Ownership and purpose | Important current contract | RLS |
|---|---|---|---|
| `profiles` | User-owned, one application profile per Auth identity | `id`, `full_name`, `avatar_url`, `country`, `timezone`, nullable `onboarding_completed_at`, `subscription_plan`, `created_at`, `updated_at`; exact base FK/cascade not versioned | Documented enabled; own-row access expected |
| `movies` | Shared TMDB-derived metadata | Shared ID, unique `tmdb_id`, titles, overview, poster/backdrop, release date/year, runtime, JSONB genres/cast/countries, director, language, public rating, trailer, metadata timestamp | Documented enabled; shared read policy not versioned |
| `user_movies` | User-owned relationship between a user and shared movie | UUID `id`, `user_id`, bigint `movie_id`, status, `favourite`, rating, review, priority, queue, schedule, watched/rewatch, audit timestamps | Enabled; ownership is `auth.uid() = user_id` |
| `user_preferences` | User-owned one-row-per-Auth-user defaults/preferences | UUID `user_id` PK/FK to `auth.users` with delete cascade, application/display/search/notification fields, audit timestamps | Enabled with explicit own-row policies |
| `lists` | User-owned private custom-list metadata | UUID `id`, Auth `user_id`, normalized unique name per user, optional 500-character description, private-only visibility, audit timestamps | Enabled; own SELECT/INSERT/UPDATE/DELETE |
| `list_movies` | Ordered membership from a list to a personal-library relationship | UUID `id`, cascading `list_id`, cascading UUID `user_movie_id`, positive unique-per-list position, audit timestamps | Enabled; every policy requires both owned parent list and owned `user_movies` row |

`movies.tmdb_id` and `user_movies (user_id, movie_id)` are confirmed unique
guards. The reconstructed baseline versions Auth foreign-key cascades, and the
dedicated disposable account-deletion flow has passed against hosted
development.

`user_movies` statuses are `want_to_watch`, `watch_next`, `scheduled`, `currently_watching`, `watched`, `on_hold`, and `dropped`. Important fields include `favourite boolean not null default false`, `personal_rating`, `review`, `priority`, `queue_position`, `scheduled_for`/`watched_at` (`timestamptz`), `schedule_timezone`, `schedule_note`, and `would_watch_again`.

`user_preferences` defaults: status `want_to_watch`, priority `0`, view `grid`, date `DD/MM/YYYY`, time `12h`, adult `false`, unreleased `true`, language `en`, page size `24`, notification toggles `false`, offset `60`. Checks restrict these enums/ranges, language-code shape, page sizes 12/24/48/96, and offsets 15/30/60/180/1440.

Personal data placement is mandatory:

- TMDB/canonical metadata belongs on shared `movies`.
- Status, `favourite`, `personal_rating`, review, priority, queue, schedule, watched data, and rewatch intent belong on `user_movies`.
- Profile identity-adjacent presentation fields belong on `profiles`.
- Application/display/search/notification choices belong on `user_preferences`.
- Private collection metadata belongs on `lists`; ordered membership references
  `user_movies.id` through `list_movies`, never `movies.id` or a TMDB ID.
- `favourite` is never inferred from ratings and must never be moved to shared `movies`.

## 9. RLS and Database Privileges

| Object | Current version-controlled or documented rule |
|---|---|
| `profiles` | Own-row SELECT/UPDATE RLS remains authoritative. Authenticated has table SELECT plus UPDATE only on `full_name`, `avatar_url`, `country`, `timezone`, `updated_at`, and `onboarding_completed_at`; no INSERT, table UPDATE, DELETE, TRUNCATE, REFERENCES, or TRIGGER. `PUBLIC`/`anon` have no profile table or column privilege |
| `movies` | Shared reads follow deployed policy; only the protected secret client performs metadata upserts |
| `user_movies` | Existing own SELECT/UPDATE policies remain; Part 12 narrowly grants authenticated SELECT/UPDATE on `favourite`; existing INSERT/DELETE policies and base grants remain unversioned |
| `user_preferences` | Own SELECT, INSERT, UPDATE policies; no normal DELETE policy |
| `lists` | Own SELECT/INSERT/UPDATE/DELETE policies. Authenticated gets table SELECT/DELETE plus scoped INSERT (`user_id`, `name`, `description`) and UPDATE (`name`, `description`, `updated_at`) privileges |
| `list_movies` | SELECT/INSERT/UPDATE/DELETE policies each require an owned parent list and owned referenced `user_movies` row. Authenticated gets table SELECT/DELETE plus scoped membership INSERT and position-only UPDATE privileges |
| Query/queue/library RPCs | Security invoker, derive `auth.uid()`, accept no browser user ID, execute revoked from public/anon and granted to authenticated |
| Part 13 list RPCs | Security invoker with fixed `public, pg_temp` search path, `auth.uid()`, per-list locks, public/anon execute revocation, authenticated execute only |

Historical issue: `user_preferences` had correct RLS but only SELECT privilege for `authenticated`. The fix grants `SELECT`, `INSERT`, and `UPDATE`, never `DELETE`. RLS policies and SQL privileges are both required.

Nuance: `202607220003_user_settings.sql` used column-level preference grants, but `202607230001_user_preferences_privileges.sql` grants table-level INSERT/UPDATE. RLS still owner-scopes rows and the trigger controls `updated_at`, but older audit-column restriction claims are stale. Profile column restrictions remain intact.

## 10. Supabase Migrations

| Filename | Purpose |
|---|---|
| `202607200001_base_schema.sql` | Reconstructed evidenced base for profiles, shared movies, private user movies, ownership RLS, grants, trigger, and cascades |
| `202607210001_phase_3_movie_management.sql` | Movie management, queue, schedule note, and security-invoker operations |
| `202607220002_schedule_queue_fixes.sql` | Schedule timezone, queue/schedule constraints/indexes, ownership policies, atomic movement |
| `202607220003_user_settings.sql` | Profile settings, private preferences, backfill, policies, grants, and preference-aware add |
| `202607230001_user_preferences_privileges.sql` | Correct authenticated preference SELECT/INSERT/UPDATE privileges and backfill |
| `202607280001_part_12_library_improvements.sql` | Private favourite, filtered/paged library functions, indexes, atomic bulk operations |
| `202607290001_part_13_private_custom_lists.sql` | Private lists/memberships, RLS, scoped grants, ordering/membership RPCs and compaction |
| `202607300001_part_15_tmdb_rate_limits.sql` | Durable provider limits, shared-cache hardening, transactional management/scheduling replacements |
| `202608030001_schedule_profile_permissions.sql` | Narrow profile timezone/updated-at UPDATE needed by scheduling |
| `202608170001_part_15_5b_first_time_onboarding.sql` | Onboarding completion column, established-user backfill, narrow grant |
| `202608290001_profiles_privilege_hardening.sql` | Remove legacy broad profile privileges and restore exact SELECT/narrow UPDATE contract |

The complete sequence applies from zero in current-HEAD Linux CI and produces
no readiness/security finding. Hosted development is also at the intended
final object and privilege contract. Do not rerun old non-idempotent migrations
or apply the reconstructed baseline over the existing development base. A new
Preview project should apply the entire sequence from zero and rerun both SQL
verification files.

## 11. TMDB Integration

- Provider abstraction: `lib/movies/provider.ts`.
- Server-only adapter: `lib/movies/tmdb-provider.ts`; Bearer token, eight-second timeout, page-one requests, `cache: "no-store"`, and explicit 404/429/timeout handling.
- Boundary mapper: `lib/movies/tmdb-mapper.ts`; maps unknown payloads to internal types, including director, top five cast, genres/countries, rating, and preferred YouTube trailer.
- Search: `/search` reads adult, unreleased, and language preferences; disabling unreleased filters future/missing release dates after mapping.
- Detail ingestion: authenticate, fetch `/movie/{id}` with `credits,videos`, admin-upsert shared `movies`, then create private `user_movies` through the authenticated client/RPC.
- CSV matching uses provider defaults (adult off, unreleased included, English), not stored search preferences.
- Shared duplicates use unique `tmdb_id`; private duplicates use unique `(user_id, movie_id)` plus owner lookups/RPC handling.
- `components/movies/movie-poster.tsx` has an accessible missing-poster fallback; `next.config.ts` restricts TMDB image paths.

TMDB tokens must remain server-only. No TMDB attribution UI was found. A paid/commercial launch must resolve attribution and movie-data licensing before payments.

## 12. Feature Status

Status describes current repository implementation plus final hosted/manual
release evidence where recorded.

| Feature | Status | Main routes/files | Notes |
|---|---|---|---|
| Authentication | Complete | `/auth/*`, `lib/supabase/*` | Email/password, verification, recovery, logout |
| Profiles | Complete | `/settings/profile` | Existing profile row required |
| Movie search | Complete | `/search`, `lib/movies/*` | Title search only |
| Add to library | Complete | `actions/library.ts`, `lib/library/service.ts` | Defaults read from preferences |
| Remove from library | Complete and verified | `/library`, `/library/[movieId]` | Single/bulk owner-derived removal plus two-user mutation isolation pass |
| Movie status | Complete | Movie detail form | Seven statuses |
| Personal rating | Complete | Movie detail form | Decimal 0–10 |
| Review | Complete | Movie detail form | Private, max 5,000 characters |
| Watched date | Complete | Movie detail/import | Stored as UTC-midnight timestamp |
| Favourite field | Complete and verified | `/library`, `/library/[movieId]`, Part 12 migration/actions | Private `user_movies.favourite`; hosted migration and two-user evidence pass |
| Watch Next queue | Complete | `/watch-next` | One-based private queue |
| Queue reordering | Complete and verified | `move_watch_queue_item` | Hosted owner-scoped ordering/persistence and two-user evidence pass |
| Scheduling | Complete and verified | `/schedule`, movie detail, transactional management RPCs | Narrow profile permission patch is hosted; schedule/settings smoke, manual workflow, and isolation pass |
| Watched/unwatched UI | Complete | `/library?watched=` | Unwatched means every non-watched status; legacy `filter` remains accepted |
| CSV import | Complete | `/import`, `lib/import/*` | In-memory, review before write |
| CSV export | Complete | `/settings/data/export/csv` | Private no-store attachment |
| JSON export | Complete | `/settings/data/export/json` | Format version 2 includes owned custom lists/memberships without internal IDs |
| Profile settings | Complete | `/settings/profile` | Avatar upload deferred |
| Application preferences | Complete | `/settings/preferences` | Applied to search/add/library/display |
| Notification preferences | Complete | `/settings/notifications` | Storage only; no delivery |
| Delete library data | Complete | `/settings/data` | Deletes current user's relationships only |
| Delete account | Complete and verified | `/settings/data` | Dedicated disposable real application flow passed; QA A/B preserved |
| Dashboard statistics | Partial | `/dashboard` | Summary lists only; no KPIs/charts/ranges |
| Statistics page | Complete and verified | `/statistics`, `lib/statistics/*`, `components/statistics/*` | Manual authenticated workflow plus private-query/two-user source and live isolation evidence pass |
| Advanced library search | Complete | `/library`, `watchflow_library_rows` | Literal substring title/original/director/cast/genre search, max 100 characters |
| Advanced filters | Complete | `/library` | Status, watched, favourite, genre, director, exact/range year, personal-rating range |
| Sorting controls | Complete | `/library`, `lib/library/query.ts` | Twelve stable database sorts; nullable rating/year/watched values last |
| Pagination | Complete | `/library`, `lib/library/supabase-query.ts` | Exact filtered count and server range; preferences/URL sizes 12/24/48/96 |
| Multi-select | Complete | `components/library/library-selection-workspace.tsx` | Current visible page only; resets on URL scope change |
| Bulk actions | Complete | Part 12 actions/RPCs | Status (scheduled excluded) and relationship deletion; atomic queue normalization |
| Private custom lists | Complete and verified | `/lists`, `/lists/[listId]`, movie detail, `lib/lists/*` | Manual workflow and two-way list/membership/order isolation pass |
| Random movie picker | Complete and verified | `/picker`, `lib/discovery/*` | Manual authenticated workflow and owner-scoped dataset contracts/isolation pass |
| Rule-based recommendations | Complete and verified | `/recommendations`, `lib/discovery/*` | Manual authenticated workflow and private personal-input scope pass |
| Notifications | Deferred | Preferences only | Delivery planned for Part 18 |
| Calendar integration | Deferred | None | Part 18 roadmap |
| Payments | Deferred | None | Part 19 only after separate design/licensing |

## 13. Current Dashboard and Statistics

`app/(app)/dashboard/page.tsx` currently renders:

- the first Watch Next item by queue position;
- every movie scheduled for today in its saved timezone, with profile fallback;
- the four most recently added movies;
- the four most recently watched movies, sorted by `watched_at` then `updated_at`, with personal rating when available;
- signed-in email/profile connection state and quick actions.

Every summary has an empty state; missing profile/provider metadata has safe fallbacks.

Part 15.1 adds a separate protected `/statistics` page without turning the
dashboard into an analytics surface. It provides total, watched, unwatched,
Watch Next, favourite, valid scheduled, average personal rating, known watched
runtime, watched-this-month, and watched-this-year summary cards. Additional
sections show the current status distribution, up to eight normalized common
genres, a zero-filled 12-month watched timeline, five personal-rating ranges,
up to five top-rated watched movies, and up to five recently watched movies.

Definitions are explicit: watched is exact `watched`; unwatched is every other
status; a counted schedule requires exact `scheduled` plus a valid
`scheduled_for`; ratings include only valid 0-10 personal values; watched
runtime includes only watched movies with positive integer metadata; timeline
and recent activity require `watched_at` and never infer from relationship
creation/update time. Unknown stored statuses are labelled rather than silently
mapped to a valid status.

`lib/statistics/supabase-statistics.ts` calls fresh `auth.getUser()`, queries
the authenticated member's `user_movies` through both an explicit owner filter
and RLS, joins only required shared metadata, and processes at most 1,000 rows
with an exact total/partial-coverage notice. One small owner-filtered profile
query supplies a validated timezone. Raw library rows stay on the server; the
page calls Next.js `connection()` to establish an explicit request-time
boundary under Cache Components and uses no admin client, TMDB call, global
cache, static private output, public metadata, migration, RPC, new index,
dependency, or environment variable.

Private reads use request-scoped cookie clients. `getAuthContext()` uses React
`cache()` for render/request deduplication only; no private Statistics result
uses shared persistent caching. The visualizations use semantic HTML and CSS,
not a chart dependency, and retain visible text values and screen-reader
summaries.

## 14. CSV Import and Export

### CSV import

- Route/code: `/import`, `components/import/import-wizard.tsx`, `app/(app)/actions/import.ts`, `lib/import/*`.
- Accepts downloaded comma-delimited `.csv` as UTF-8 memory text; MIME may be CSV, Excel CSV, plain text, or empty browser type.
- Limits: 2 MiB, 500 non-empty rows, 100 reconstructed columns, 10,000 characters/cell, 20-row preview.
- Handles BOM, quoted/escaped cells, embedded newlines, CRLF, duplicate/unnamed headers, and empty rows.
- Seven steps: Upload, Map, Preview, Match, Review, Confirm, Results.
- Required mapping: title. Optional: year, director, cast, genres, rating, status, watched date, review, priority.
- Validates year 1888–current UTC year + 5, rating 0–10, integer priority 0–5, review length, and ISO/unambiguous slash dates.
- Status aliases map to the six non-scheduled statuses; `scheduled` and other
  unknown values require accepting `want_to_watch` because CSV has no schedule
  instant/timezone fields. Empty status defaults automatically.
- Matching scores title/original title/year, returns up to five candidates, caches lookups, and runs four searches maximum. Exact/probable may preselect; ambiguous requires choice. Director/cast/genres do not score.
- Confirmation refetches details. Admin upserts shared metadata; authenticated owner writes use unique guards. Watch Next preserves CSV order.
- Results: imported, already in library, skipped, invalid, unmatched, failed; partial success, retry, copy, and failure download exist.
- Limitations: no live Sheets connection or persisted wizard, comma only, and default TMDB preferences.

### CSV export

- Route: `/settings/data/export/csv`.
- Fields: Title, Original Title, Release Year, Director, Cast, Genres, Public Rating, Personal Rating, Status, Favourite, Priority, Review, Watched Date, Scheduled Date, Schedule Timezone, Would Watch Again, Date Added, TMDB ID.
- Requires fresh authenticated identity and an explicit owner filter.
- Generated in memory with private no-store/nosniff attachment headers.
- Standard quoting applies; cells beginning (even after whitespace) with `=`, `+`, `-`, `@`, or `*` receive an apostrophe.
- Filename: `watchflow-library-YYYY-MM-DD.csv`.

### JSON export

- Route: `/settings/data/export/json`.
- Includes export time, email/profile, preferences, movie metadata, personal fields including favourite, queue positions, and derived schedules.
- Excludes raw Auth records, relationship UUIDs, tokens, passwords, keys, and other users' data.
- `metadata.formatVersion` is `2`.
- Filename: `watchflow-account-data-YYYY-MM-DD.json`.

## 15. Settings Architecture

Profile settings use `profiles`: editable `full_name`, optional `country`, validated IANA `timezone`; Auth email/created time are read-only. `avatar_url` is read/exported, but upload awaits private Storage policies.

Application preferences use `user_preferences`:

- default movie status and priority;
- grid/list default and page size 12/24/48/96;
- date formats `DD/MM/YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD`;
- time formats `12h` or `24h`;
- adult and unreleased search toggles;
- language `en`, `ur`, `es`, `fr`, or `de`.

Notification settings store email, reminder, offset, and weekly-summary choices; nothing is delivered.

Data and Privacy provides exports, `DELETE MOVIES` library deletion, and recent-login `DELETE` plus checkbox account deletion. Library deletion never removes shared `movies`.

## 16. Date, Time, and Timezone Rules

- Scheduled instants are stored in `scheduled_for` as `timestamptz`.
- Local date/time plus validated IANA zone becomes a server-side ISO instant; nonexistent DST times and past times are rejected.
- The selected zone belongs in `schedule_timezone`; `schedule_note` is private.
- `profiles.timezone` is the preferred default, then a valid browser zone where used, then UTC.
- A scheduled row's saved zone precedes the profile zone for Today/Upcoming/Past grouping.
- Profile timezone changes do not rewrite timestamps or saved schedule zones.
- Date/time preferences affect settings/schedule displays; native HTML date inputs remain ISO.
- Watched dates normalize to UTC midnight; the dashboard sorts them, but has no month grouping.

Movie detail and the dedicated schedule route prefer the row's saved timezone,
persist timezone/note values, and use transactional RPCs so queue compaction
cannot fail after the primary schedule/status mutation commits.

## 17. Security Boundaries

The authenticated cookie-bound Supabase client is mandatory for user-owned:

- profile/preference/library reads;
- `user_movies` and preference inserts;
- owner-filtered updates;
- library/preference/data deletes allowed by RLS;
- exports and queue/schedule operations.

The secret/admin client is limited by call-site policy to:

- shared `movies` metadata upserts after a verified user exists; and
- final deletion of that same freshly verified Auth user.

Sensitive provider/admin/adapters use `import "server-only"`. Never import them into Client Components, expose keys, or bypass RLS/privilege errors.

Server Actions validate untrusted input; verified sessions supply user IDs. Never log secrets/tokens/private rows. CSV uploads are memory-only and exports are on-demand private no-store responses.

Part 12 library reads call authenticated security-invoker functions that derive
`auth.uid()` and then apply count/order/range server-side. Favourite updates
filter by both `user_movies.id` and verified `user_id`. Bulk requests accept at
most 100 unique UUIDs, never a user ID; transactional RPCs reject a stale or
foreign mixed selection before mutation and normalize the caller's queue.

Part 13 list actions use the cookie-bound server client plus fresh
`auth.getUser()`. The browser submits list, `list_movies`, and `user_movies`
UUIDs only; it never submits a user ID. Every membership references
`public.user_movies.id`, and each RLS predicate proves both parent-list and
personal-library ownership. Mutations use security-invoker RPCs with a stable
user-movie-then-list lock order. Deleting a list cascades membership rows only;
deleting a library relationship cascades memberships and a statement trigger
compacts every surviving affected list. Shared `movies` rows are never deleted
or directly referenced by list membership.

## 18. Testing and Quality Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js development server |
| `npm run lint` | ESLint over the repository |
| `npm run typecheck` | Scripted `tsc --noEmit` |
| `npx tsc --noEmit` | Required direct TypeScript check |
| `npm test` | All Vitest tests via `vitest run` |
| `npm run test:integration` | Guarded real-development-Supabase RLS suite |
| `npx vitest run <path>` | Focused Vitest file(s) |
| `npm run test:e2e` | All Playwright specs via headless Chrome |
| `npx playwright test <path>` | Focused Playwright spec(s) |
| `npm run scan:client-secrets` | Scan browser/rendered build artifacts for server-secret patterns |
| `npm run build` | Production Next.js build |
| `npm start` | Serve a completed production build |

`vitest.config.ts` includes `lib/**/*.test.ts` in Node. Those tests are unit,
mocked-adapter, server-markup, route/source, and migration contracts; none use
live Supabase. The separate integration config is opt-in, read-only, and
requires a confirmed development target and two QA identities.
`playwright.config.ts` runs Chrome against an existing or auto-started local
server. Authenticated specs create isolated in-memory contexts and never write
storage state; they remain skipped until the development/credential guards are
satisfied.

The 2026-07-28 Playwright MCP pass exercised `/`, all public auth/error routes,
and logged-out redirects for dashboard, search, library, Watch Next, schedule,
import, and every settings page. After clean server/browser restarts,
`/auth/sign-up` returned 200, `/library` redirected to login, the 390x844 auth
page had no horizontal overflow, and no unexpected console or local-request
failure occurred. `/statistics` correctly exposed the repository's known 404.
The generated signup fallback could not yield a confirmed QA session, so no
authenticated or destructive library flow was attempted.

That 2026-07-28 Statistics result is retained as historical evidence only. The
new Part 15.1 route supersedes the known 404; local route/build verification
passed, while guarded authenticated verification remains blocked.

The 2026-07-29 Part 13 Playwright MCP pass confirmed that anonymous `/lists`
and a UUID `/lists/[listId]` redirect to `/auth/login`, while
`/auth/sign-up` remains public and loads. Its development-server console
reported repeated blocked HMR WebSocket handshakes for the `127.0.0.1` origin;
no failed non-static application request was reported. The repository
Playwright run supplies the reliable five-viewport public sign-up result. Authenticated list
screenshots and mutation/isolation flows remain blocked by the unapplied
migration and absence of two confirmed QA sessions.

The 2026-07-29 Part 14 Playwright MCP pass confirmed anonymous `/picker` and
`/recommendations` redirect to `/auth/login`; `/auth/sign-up` remained public,
rendered its `Sign up` heading at 390x844, matched the 390px document width, and
kept inspected controls inside the viewport. No non-static failed request or
application/hydration error was observed. The MCP development connection again
reported only its repeated HMR WebSocket handshake failure. The repository has
no QA credentials or authenticated storage states, so none of the requested
authenticated picker/recommendation/two-user flows or discovery screenshots
were run.

The 2026-07-30 Part 15 production-server run passed 35 public/protection/auth/
responsive tests with automatic safe console/network assertions and skipped 6
credential-gated authenticated/destructive tests. A clean-restart Playwright
MCP pass found zero public warnings/errors, no failed application request, no
inline secret pattern, and no storage/cookie residue. It did not authenticate
or mutate data.

### Last verified

| Check | Status | Latest evidence |
|---|---|---|
| GitHub Release Quality | Passed | Run `33268937218` passed every step for exact current code SHA `2bb576a` |
| From-zero migrations/SQL audits | Passed | Current-HEAD Ubuntu PostgreSQL 18 applied all 11 migrations and both verification files |
| Hosted readiness/security | Passed | Backfill gaps zero, hardened profile ACL exact, hosted security findings zero |
| Lint | Passed | Current local command and exact current-HEAD Ubuntu workflow |
| TypeScript | Passed | Current local direct command and exact current-HEAD Ubuntu workflow |
| Unit/source tests | Passed | Exact `npm test` in Ubuntu; Windows fallback 73 files/727 tests |
| Focused ownership tests | Passed | 7 files/77 tests plus hosted RLS 1 file/5 tests |
| Live limiter | Passed | 10/10 including user/operation isolation, limits, expiry, and concurrency |
| Authentication/deletion | Manual pass | Fresh signup, six-digit OTP, onboarding, login/session, link recovery, and disposable account deletion |
| Authenticated core workflow | Manual pass | Major protected product routes/workflows exercised in development |
| Two-user isolation | Passed | QA A to B and B to A private reads/mutations/routes/exports |
| Production build | Passed | Exact current-HEAD Ubuntu build, including fixed public-auth prerendering |
| Client secret scan | Passed | Exact current-HEAD post-build scan |
| Public responsive Playwright | Passed | Exact current-HEAD Ubuntu Chrome run |
| Local authenticated Playwright | Windows environment blocked | `spawn EPERM` before worker/browser; no local browser PASS claimed |

Mark Passed only after that exact command succeeds.

## 19. Historical Regression Ledger and Current Limitations

Resolved milestone evidence below is historical. Current release status is the
2026-08-30 section and `docs/RELEASE_EVIDENCE.md`.

| State | Issue or lesson |
|---|---|
| Resolved/guarded | `/auth/sign-up` was accidentally removed and returned 404; it now exists with a route-contract test |
| Resolved/guarded | `CardTitle` rendered a `div` and auth errors rendered plain paragraphs; page titles are now `h1` and auth errors use `role="alert"` |
| Resolved/verified | The repository now has 11 migrations, rebuilds from zero, and hosted readiness/security verifies the intended final development state |
| Resolved locally | `user_preferences` had RLS but insufficient INSERT/UPDATE privileges; the latest patch grants SELECT/INSERT/UPDATE, no DELETE |
| Resolved/verified | Hosted profile/preference backfills report zero missing rows and onboarding release smoke passes |
| Preserved boundary | Shared movie writes require the authenticated-first, server-only admin path; never weaken this to solve RLS errors |
| Resolved/guarded | Empty FormData values previously caused numeric/date update errors; current validators map optional rating/date/text values safely |
| Resolved locally | Individual removal called the undeployed legacy `watchflow_remove_library_movie(p_library_id)` RPC and failed with `PGRST202`; it now submits one validated `user_movies.id` UUID through the working Part 12 removal RPC shared with bulk deletion |
| Migration-dependent | Queue reordering requires `move_watch_queue_item`; missing RPC errors are mapped to a migration message |
| Resolved/verified | The narrow scheduling profile permission is hosted; schedule/settings smoke, manual workflow, and two-user verification pass |
| Resolved/verified | Hosted catalog/readiness and security SQL now attest the final RLS/ACL/constraint/function contract; limiter behavior passes 10/10 |
| Reviewed/preserved | Duplicate ownership-equivalent `user_movies` SELECT/UPDATE policies remain deliberately; the reconstructed baseline and hosted audits preserve the verified behavior |
| Resolved/guarded | Detail-form schedule editing now defaults to its saved schedule zone and persists/clears zone and note through the dedicated contract |
| Resolved/documented | The preference privilege patch is table-level; architecture/database/security verification now use that source-of-truth contract |
| Resolved/verified | Auth-delete cascades are versioned in the reconstructed baseline and the dedicated disposable application deletion flow passes |
| Resolved locally | `.env.example` lists server/test variable names without real secret values |
| Resolved locally | `README.md` is WatchFlow-specific and documents guarded setup/migration/testing steps |
| Resolved locally | `/protected` redirects to the dashboard and no longer renders claims JSON |
| Historical mismatch preserved | `statistics-v1` points to `8f92cbe`, the same settings commit/tree as `settings-v1`; investigation found no Part 11 implementation in normal history, reflog, or alternate route. The tag is not moved; Part 15.1 is a new implementation |
| Resolved/verified | `/statistics` has complete source coverage, manual authenticated workflow evidence, and two-user private-scope evidence |
| Resolved/guarded | Shared CSV escaping neutralizes formula-leading values, including after whitespace or line breaks, in exports and import failure reports |
| Resolved locally | `/library` previously fetched every row before filtering/slicing; Part 12 now filters, counts, sorts, and ranges through a private database function |
| Migration-dependent | Part 12 requires `202607280001_part_12_library_improvements.sql`; without it `/library` and favourite/bulk actions show a safe migration-required error |
| Migration-dependent | Part 13 requires `202607290001_part_13_private_custom_lists.sql`; missing table, column/schema-cache, RPC, permission, validation, constraint, and generic database failures have distinct safe handling |
| Active limitation | Part 12 literal substring search scans the authenticated member's joined library; it targets several hundred to about 1,000 movies and has no trigram/full-text index |
| Active limitation | Selection is intentionally current-page only and clears on search/filter/sort/view/page changes; bulk `scheduled` is excluded because no date may be invented |
| Resolved/verified | Part 12 is installed; manual core-library evidence and QA A/B ownership/mutation verification pass. Fresh online responsive/dialog QA remains Preview work |
| Resolved/verified | Part 13 is installed; manual list workflow plus live two-way list/membership/order isolation passes |
| Active limitation | The Add Movies picker returns at most 50 owner-scoped results per search and movie-detail membership reconciliation accepts at most 500 desired list UUIDs; list summaries are not paginated |
| Active limitation | Part 13 membership writes share the Part 12 per-user advisory lock and row order, but the legacy full-library settings DELETE does not take that advisory lock; concurrent full-library deletion versus a list batch remains a live stress-test item |
| Active limitation | Part 14 processes at most the 1,000 most recently added `user_movies` relationships per request, keeps at most 50 recent picker IDs in component memory, and renders at most 16 recommendations |
| Resolved/verified | Part 14 manual authenticated workflow and private ownership-scope evidence pass; fresh online responsive screenshots remain Preview work |
| Browser tooling note | Playwright MCP reports repeated development HMR WebSocket handshake failures for its `127.0.0.1` origin; the repository Playwright run completed without application request failures |
| Resolved locally | Next `16.2.12`, aligned ESLint config, and compatible internal PostCSS/sharp overrides produce zero-vulnerability production-only and full audits |
| Later public-production gate | No TMDB attribution UI or resolved commercial movie-data licensing; this does not block an access-limited Preview |
| Resolved/guarded | Browser auth configuration/network failures map to controlled messages; source contracts guard the mapping, while the real invalid-provider Playwright case remains development-gated and was skipped in the final run |
| Resolved/guarded | Credentialed QA previously trusted a loopback app URL without pinning its Supabase backend; authenticated/integration suites now require an exact expected-project URL match and credentialed Playwright never reuses an unknown listener |
| Resolved/guarded | ASCII-only CSV title normalization collapsed distinct Urdu titles in matching and duplicate detection; shared Unicode normalization and regressions preserve letters/numbers |
| Resolved/guarded | CSV accepted `scheduled` without an instant/timezone; it now requires explicit fallback to an unscheduled status |
| Resolved locally | Per-user detail locales could churn the one-row-per-TMDB shared cache and expose preference-derived shared state; detail metadata is canonical English and preferred language remains search-only |
| Resolved locally | Status/schedule updates could commit before a separate queue-normalization call failed; the Part 15 patch and application now use transactional owner-derived RPCs |
| Resolved locally | The concise SQL security result could miss required policy operations or column-level privilege leaks; it now includes both checks |

Migrations 1 and parts of 2 are not safely repeatable; never rerun old SQL blindly.

## 20. Current Project State

- Branch and code HEAD: `master` at `2bb576a` (`fix: harden authenticated
  profile privileges`), matching `origin/master` and the latest successful
  Release Quality run.
- The complete feature set through Part 15.5G is committed. The only current
  working-tree changes are final Part 15.5E release-evidence documentation.
- Latest migration:
  `202608290001_profiles_privilege_hardening.sql`; all 11 migrations rebuild
  from zero and hosted development has the intended final hardening.
- Hosted readiness/security, fresh Auth/OTP/onboarding/recovery, account
  deletion, authenticated core workflow, and QA A/B isolation evidence pass.
- Automated authenticated Playwright remains blocked only on this Windows host
  by process-spawn denial. Current manual browser evidence passes for core
  workflows; a fresh mobile/tablet/export-download sweep is deferred to
  Preview and is not mislabeled as local automation.
- Current decision: **READY TO BEGIN PART 16 PREVIEW DEPLOYMENT**, not public
  production. Preview must use a new production Supabase project and never
  `watchflow-dev`.

## 21. Next Development Queue

This is the roadmap, not completed functionality.

1. **Part 16 - Preview deployment**
2. **Part 17 - Public beta preparation**
3. **Part 18 - Notifications and calendar integration**
4. **Part 19 - Paid SaaS**

## 22. Part 12 Implementation Notes

Implemented contract:

- Main modules: `lib/library/{query,query-mapping,selection,mutations,supabase-query,supabase-mutations}.ts`; UI: `components/library/{library-controls,library-pagination,library-selection-workspace,library-item-actions}.tsx` and `components/movies/favourite-toggle-form.tsx`.
- `lib/library/query.ts` validates canonical URL state. Exact `year` overrides `yearFrom`/`yearTo`; invalid ranges are ignored with a warning.
- `watchflow_library_rows` searches title, original title, director, JSONB cast names, and genres literally. It has no user-ID parameter and ranges only after owner filters.
- Sorts cover title, added date, release year, personal rating, priority, watched date, and favourite in both requested directions. Nullable data is last; `user_movie_id` is the final tie.
- URL `view`/`perPage` override saved defaults. Sizes are 12/24/48/96; invalid pages redirect; selection covers only the visible page.
- Favourite belongs to `public.user_movies`; direct updates use the authenticated client plus relationship/owner filters.
- Bulk status excludes `scheduled`, appends new Watch Next rows in display order, compacts departures, never invents `watched_at`, and preserves latent schedules.
- Bulk deletion removes only selected owned `user_movies`, never `movies`, and compacts the queue transactionally; mixed stale/foreign selections cause no mutation.
- Individual removal validates `userMovieId` as a UUID and passes a one-item selection through that same authenticated bulk-removal RPC. The RPC derives `auth.uid()`, rejects a stale or foreign ID without mutation, deletes only `user_movies`, and deliberately normalizes the queue after every successful removal.
- Five indexes support added-date, status, favourite, personal-rating, and watched-date queries; shared title/genre/trigram indexes are deferred.

## 23. Part 13 Implementation Notes

Implemented contract:

- Routes: protected `/lists` summaries/CRUD and `/lists/[listId]` detail; the
  stored-movie detail page now includes a private Custom Lists membership
  editor. `My Lists` is in the authenticated shell and `/lists` is a protected
  proxy prefix.
- Main module: `lib/lists/{types,validation,errors,mapping,supabase-lists}.ts`;
  Server Actions: `app/(app)/actions/lists.ts`; UI:
  `components/lists/*`.
- `lists` owns private name/description metadata. The normalized
  case/whitespace-insensitive name index is unique per user. Visibility is
  constrained to `private`.
- `list_movies.user_movie_id` references the UUID `user_movies.id`. A movie can
  be in multiple lists but only once per list. Deleting a list removes only its
  memberships; deleting a personal-library row cascades memberships and
  compacts surviving lists.
- One owner-scoped summary RPC returns counts and at most four posters per list.
  Detail rows use one joined request. The Add Movies picker reuses the Part 12
  library query, caps results at 50, labels existing memberships, and submits
  one ordered batch of at most 100 UUIDs.
- Ordering uses a unique `(list_id, position)` constraint, the Part 12 per-user
  advisory lock for cross-feature membership writes, per-list advisory locks,
  Part 12's queue/creation/UUID relationship-row order, and deferred two-stage
  positive positions. First-up and last-down are successful no-ops. Multi-list
  movie-detail saves lock lists in stable order, preserve existing positions,
  append new memberships, and compact removed lists atomically.
- All list reads/mutations use the authenticated SSR client and fresh
  `auth.getUser()` where required. No list operation imports the admin client,
  accepts a browser user ID, exposes raw Postgres errors, caches private data
  globally, or writes public metadata.
- Tests:
  `lib/lists/{validation,mapping,supabase-lists,actions,migration-contract,ui}.test.ts`;
  route-protection coverage also includes `/lists` and one UUID detail URL.
- Migration:
  `supabase/migrations/202607290001_part_13_private_custom_lists.sql`. It is
  part of the passing from-zero chain and the hosted list/RLS behavior is
  verified.
- Scaling limits: summaries are currently unpaginated, picker results are
  capped at 50, movie batches at 100, and the movie-detail desired-list set at
  500. Source/mocked tests do not prove live PostgreSQL RLS, privileges,
  cascades, or concurrency.

## 24. Part 14 Implementation Notes

Implemented contract:

- Routes: protected `/picker` and `/recommendations`; both appear in the
  authenticated shell and proxy prefix set. Anonymous requests redirect to
  `/auth/login`. The private pages remain request-scoped Server Components
  under Suspense and expose neither private metadata nor user IDs through
  public route metadata.
- Main module:
  `lib/discovery/{types,moods,picker,recommendations,mapping,errors,supabase-discovery}.ts`;
  picker Server Action: `app/(app)/actions/discovery.ts`; UI:
  `components/discovery/*`.
- Dataset: one exact-column `user_movies -> movies!inner` query through the
  normal cookie-bound SSR client after fresh `auth.getUser()`. RLS and an
  explicit verified-user filter both apply. The query is stable, bounded to
  rows 0-999, returns an exact count/truncation flag, calls neither TMDB nor an
  admin client, and never selects or returns `user_id`. The picker action
  projects out recommendation-only `personal_rating` before its one selected
  movie crosses the Client Component boundary.
- Picker filters: represented genre; maximum runtime 90/120/150/180; minimum
  **public** rating from `movies.public_rating`; eight explicit moods; decade
  period; watched/unwatched/any; Watch Next only; and favourite only. Runtime,
  public-rating, and year nulls remain eligible with no corresponding filter
  and are excluded when that filter is active. Default Unwatched follows the
  requested `status !== "watched"` definition, including Dropped; Watch Next
  requires the exact `watch_next` status and overrides watched-state display.
- Mood rules: Exciting = Action/Adventure; Relaxing =
  Animation/Comedy/Romance plus runtime <=130; Funny = Comedy; Emotional =
  Drama/Romance; Dark = Crime/Horror/Thriller; Intense =
  Action/Crime/Thriller/War; Mind-Bending =
  Mystery/Science Fiction/Thriller; Family-oriented =
  Adventure/Animation/Family. Family-oriented copy explicitly states that
  incomplete certification metadata cannot establish child suitability.
- Picker selection: all filters apply before secure server randomness.
  Excluded values must be at most 50 valid `user_movies.id` UUIDs and only
  subtract from the newly authenticated owned candidate set. The Client
  Component keeps exclusions in memory only, avoids repeats while alternatives
  remain, resets after exhausting the eligible pool, and preserves validated
  filters—not private IDs—in the URL.
- Recommendation seeds: personal rating >=8 first, then watched favourites,
  then watched rating >=7; at most five seeds and three rendered seed groups.
  Rated-genre weights are divided across a movie's genres. A director pattern
  needs at least two ratings averaging >=7.
- Recommendation candidates: only `want_to_watch`, `watch_next`, `scheduled`,
  and `on_hold`; `currently_watching`, `watched`, and `dropped` are excluded.
  Seeds are excluded from output. Recommendations are globally deduplicated
  and capped at 16.
- Score weights: +4 per shared genre capped at +12, +3 same director, +1
  release years within 10, +1 runtime within 30 minutes, +1 favourite, +1
  Watch Next, +1 public rating >=7 or +2 >=8, and seed weight +1 at rating 9
  or +2 at 10. Missing metadata adds no quality penalty. Stable ties use public
  rating, title, and relationship UUID. Soft genre/director diversity may
  select within two points of the current best; refresh only changes
  equal-score presentation after the diversity penalty.
- Every displayed item has a concrete stored-signal reason. Cold starts
  distinguish empty library, no eligible candidates, no ratings, and no
  suitable recommendations. The UI says Rule-based recommendations and makes
  no AI, prediction, psychological, or family-safety claim.
- Integration: result cards reuse Part 12 favourite and one-item Watch Next
  mutations and link to the Part 13 movie-detail membership editor. Viewing or
  picking is read-only. Library/management/import/full-library deletion paths
  revalidate both discovery routes.
- Database: no Part 14 migration, index, table, RPC, policy, grant, trigger, or
  stored recommendation result. No dependency or environment variable was
  added.
- Tests:
  `lib/discovery/{moods,picker,recommendations,mapping,supabase-discovery,actions,ui}.test.ts`;
  logged-out E2E route protection also covers both routes.
- Browser evidence: authenticated Picker and Recommendations have current
  manual workflow evidence, and private dataset/two-user ownership checks pass.
  A fresh post-hardening automated mobile/tablet sweep remains deferred to
  Preview because local Windows Playwright cannot start its worker.

## 25. Part 15 Testing and Production-Hardening Notes

### Local hardening and test architecture

Part 15 hardening and test architecture are committed at `f6b15d4`. The required
authenticated workflow matrix and live Preview verification are incomplete;
this is not a production-readiness claim.

- Unit/contract tests use typed Supabase/provider mocks and source/migration
  contracts; they never connect to the configured project.
- `integration/supabase-rls.integration.test.ts` is a read-only, two-user,
  real-development-project suite. It requires
  `RUN_SUPABASE_INTEGRATION_TESTS=true`, `E2E_TARGET_ENV=development`, the
  public Supabase names, an exact `E2E_EXPECTED_SUPABASE_URL` match, and QA A/B
  credentials. It creates no records, signs out locally, and performs no data
  cleanup; the operator must still confirm the pinned project is disposable
  development infrastructure.
- Playwright creates fresh in-memory browser contexts and never serializes
  cookies or auth state. Public tests always run. Authenticated mutations
  require the same development/loopback guard, an exact expected Supabase URL
  pin, and QA A/B credentials. Credentialed runs start the configured server
  rather than reusing an unknown loopback listener; helpers remove only the
  exact TMDB/list records they created. Account deletion additionally requires
  a distinct dedicated account and `E2E_RUN_ACCOUNT_DELETION=true`.
- CSV browser fixtures are generated in memory, capped, and are not confirmed
  unless a test explicitly owns the cleanup. QA artifacts and auth state are
  ignored by Git.
- Required environment-variable names and destructive/non-destructive
  boundaries are documented in `docs/TESTING.md` and `.env.example`; no values
  are committed.

Final local results on 2026-07-30:

- `npm run lint`: passed with the Next 16 native flat configuration and no
  rule suppressions.
- `npx tsc --noEmit`: passed.
- `npm test`: 55 files, 534 tests passed.
- `npm run test:integration`: runner passed, but 1 file/5 tests were skipped
  because the live-development guard and QA credentials were absent. Live RLS
  is therefore unverified.
- `npx playwright test --workers=1` against a managed production server: 35
  passed, 6 credential-gated tests skipped, 0 failed. The passing suite covers
  public auth semantics, callback/reset failure handling, `/auth/sign-up`
  non-404, all logged-out protected-route redirects, no redirect loops,
  automatic safe console/network diagnostics, keyboard focus, and the five
  requested public viewports.
- Playwright MCP restarted the production server, opened a clean context with
  zero cookies/storage entries, verified canonical signup, controlled auth
  errors, protected redirects, mobile overflow/touch size, and a friendly
  not-found page. It found no unexpected public console warning/error, failed
  application request, or inline secret pattern. Safe screenshots exist only
  under ignored `qa-artifacts/`.
- `npm run scan:client-secrets`: 462 built artifacts checked, passed. One
  Supabase SDK `sb_secret_` sentinel in a client chunk was reviewed; no
  configured secret value leaked.
- `npm audit --omit=dev` and full `npm audit`: zero vulnerabilities.
- `npm run build`: passed on Next `16.2.12`, including TypeScript and all 34
  static page generations. That historical Part 15 baseline route output
  confirmed `/statistics` was absent before the current Part 15.1 work.

### Security, RLS, and database readiness

- `docs/SECURITY_AUDIT.md` records the Server Action, Route Handler,
  admin-client, upload, export, authentication, logging, and browser-boundary
  review. User identity comes from fresh `auth.getUser()` at mutation/export/
  provider boundaries; browser user IDs are not accepted; normal user-owned
  operations use the cookie-bound client so RLS remains final enforcement.
- The server-only admin client is imported only by shared movie metadata
  upsert logic and final deletion of the same freshly verified Auth user. It
  disables persistence, refresh, and URL session detection. No Client
  Component or client-safe barrel imports it.
- Auth callback/confirmation inputs are allowlisted, redirect targets remain
  internal-only, auth/configuration errors are controlled, Supabase diagnostic
  logs contain only sanitized code/category, and logout is cookie aware.
- CSV input is authenticated before parsing, limited to 2 MB/500 rows/100
  columns/10,000 characters per cell, validates temporary JSON at 4 MiB before
  returning it to the browser, and uses a 6 MiB Server Action transport ceiling.
  Decision batches are capped, matching concurrency is four, and uploaded
  content is neither stored nor logged. CSV exports neutralize formula prefixes
  including leading whitespace or line breaks. CSV/JSON responses are private,
  `no-store`, `nosniff` attachments.
- Static migration inspection found no unrestricted `true` policy in the
  versioned user-owned tables. `user_preferences` includes authenticated
  SELECT/INSERT/UPDATE grants and owner policies; list tables have owner RLS;
  the limiter table has RLS, no policies, and no direct browser-role grants.
  The base schema for `profiles`, `movies`, and `user_movies` is not
  version-controlled, so its live policies, privileges, and cascades cannot be
  certified from the repository.
- `supabase/verification/production_security_audit.sql` reports table RLS,
  policies, expected policy operations, effective/raw authenticated and anon
  privileges, limiter isolation, and missing protections without mutation.
- `supabase/verification/development_readiness.sql` reports required tables,
  columns, RLS/policies, privileges, functions/grants, constraints/cascades,
  triggers, indexes, backfills, queue normalization, scheduling, favourites,
  lists, exact profile UPDATE-column exposure, and Part 15 objects as
  `INSTALLED` or `MISSING`. Database objects, not migration-history rows, are
  the source of truth.

### TMDB limits, caching, duplicate prevention, and performance

- Migration
  `supabase/migrations/202607300001_part_15_tmdb_rate_limits.sql` is the single
  Part 15 patch. The confirmed target contains its scheduling RPC, authenticated
  EXECUTE grant, and queue-normalization dependency, although that selected
  object evidence does not prove full migration parity or ledger state. Do not
  rerun this existing migration on the inspected target. It adds nullable
  `movies.tmdb_adult`/`metadata_language`, repairs the impossible `scheduled`
  preference default, makes shared `movies` authenticated-read/server-write-
  only at table and column privilege levels, replaces management/schedule RPCs
  so mutation and queue normalization are transactional, creates the private
  `watchflow_tmdb_rate_limits` counter table, and grants authenticated callers
  only the hardened `watchflow_take_tmdb_rate_limit(text, integer)` RPC.
- The durable PostgreSQL fixed windows are per authenticated user and
  operation: search 30/60 seconds; details 20/60 seconds; import search and
  import details each 120/600 seconds. Advisory plus row locks serialize a
  bucket across server instances. No unauthenticated route calls TMDB, so no
  public fallback bucket exists; one is required before adding such a route.
- `public.movies` is the only persistent shared metadata cache. Its one row per
  `tmdb_id` uses canonical English, while preferred language remains
  request-scoped to search. A row is fresh for 30 days only when timestamp,
  canonical language, and adult classification are safe for the request.
  Stale/missing rows refresh through authenticated, rate-limited, server-only
  logic and upsert on unique `tmdb_id`. Private `user_movies`, profiles,
  preferences, lists, picker state, and exports are never globally cached.
- Per-process in-flight maps deduplicate identical search, detail, import, and
  provider URL requests. Database uniqueness remains authoritative for
  `movies.tmdb_id`, `(user_id,movie_id)`, normalized list names, memberships,
  queue positions, and list positions. Pending controls cover repeat form
  submission.
- Watch Next now queries only the ordered owner queue, selects explicit fields,
  detects truncation at 500, and normalizes inside transactional RPCs rather
  than an N+1 update loop or a post-commit second call. Import matching is
  concurrency-limited, Unicode-safe, and reuses title/detail promises within a
  batch. Client logout no longer ships the browser Supabase SDK in the
  authenticated shell.
- The final build contains 47 static JS chunks totaling 1,746,342 raw bytes.
  The largest route entry is `/library` at 486,629 raw bytes; auth signup/login
  are about 333 KB, import 218,819 bytes, list detail 214,464 bytes, and picker
  214,351 bytes. These are uncompressed build-artifact measurements, not
  network timings. Library remains the first bundle-splitting candidate.
- Existing indexes match the inspected owner/status/time/order query patterns.
  No speculative workload index was added; only the limiter primary key on
  `(user_id, operation)` creates a new index. Live `EXPLAIN ANALYZE` evidence
  is still needed before adding text/facet indexes.

### Reliability and UI hardening

- TMDB requests have an eight-second abort timeout, provider 429 handling,
  friendly retry text, stable input normalization/limits, and server-only
  credentials.
- Movie posters and list collages use `next/image`, reserve aspect ratio,
  validate fixed TMDB paths, use `w342`/`w500` sources and `sizes`, lazy-load by
  default, prioritize only explicit detail art, and fall back after missing or
  failed images. The only remote image pattern is HTTPS
  `image.tmdb.org/t/p/**`.
- A shared authenticated loading skeleton covers all implemented protected
  routes; import/lists/picker/recommendations retain focused loaders and
  long-running controls expose pending status. Route error boundaries now
  cover the authenticated shell, library, search, import, lists, picker,
  recommendations, and settings. Root/list/movie not-found states are
  controlled and contain no raw errors.
- Dashboard, library, Watch Next, schedule, import, lists, picker, and
  recommendations expose contextual empty/limited states and a relevant next
  action. Part 15.1 Statistics adds distinct empty-library, no-watched,
  no-rating, missing-metadata, and partial-coverage states without false values.
- Native Next 16 linting exposed render-inside-catch and synchronous
  effect-state patterns. They were refactored through data result objects,
  keyed state scopes, derived selections, input refs, and
  `useSyncExternalStore`; no lint rule was disabled.
- Security headers now include a scoped CSP, `nosniff`, frame denial,
  referrer policy, and a restrictive permissions policy.

### Current readiness after historical Part 15 blockers

- Migration parity, hosted catalog/security, scheduling permission, fresh Auth
  delivery, disposable deletion, core authenticated workflows, and QA A/B
  isolation now pass the final Part 15.5E evidence gate.
- Remaining online work is Preview-scoped: create the separate production
  Supabase/Vercel environment, repeat SQL verification, run current
  authenticated mobile/tablet/export-download QA, and record operational
  backup/monitoring/rollback evidence.
- Public-production gates such as legal pages and TMDB attribution/licensing do
  not block beginning an access-limited Preview.

Current milestone: final Part 15.5E rerun complete.
Next milestone: Part 16 Preview Deployment.

## 26. Part 15.1 Statistics Implementation Notes

Committed contract (`0c05fc8`):

- Routes: protected `app/(app)/statistics/{page,loading,error}.tsx` with a
  request-time `connection()` boundary compatible with Cache Components, a
  structure-matched announced skeleton, and shared safe retry/dashboard error
  UI. Authenticated navigation contains one active-state Statistics item and
  preserves mobile/keyboard behavior.
- Main module:
  `lib/statistics/{types,mapping,calculations,formatting,errors,supabase-statistics}.ts`;
  presentation: `components/statistics/*`. Database retrieval, untrusted-row
  normalization, pure aggregation, formatting, empty-state flags, and UI are
  separate.
- Authentication/isolation: fresh `auth.getUser()`, normal cookie-bound SSR
  client, explicit `user_movies.user_id = verified user`, existing RLS, and an
  owner-filtered profile timezone read. No input accepts `user_id`; no admin
  client, TMDB request, public metadata, static private generation, or global
  private cache is used.
- Query: one exact-column `user_movies -> movies!inner` read selects only IDs,
  status, favourite, personal rating, watched/scheduled dates, title, poster,
  release year, runtime, and genres. It is ordered by creation/relationship ID,
  ranges 0-999, obtains an exact total, and exposes honest coverage state.
- Summary: total, exact watched, all non-watched, exact Watch Next, favourites,
  valid scheduled, average valid personal rating, known watched runtime,
  watched this month, and watched this year. Missing rating/runtime/date values
  are excluded and shown as unavailable where appropriate.
- Distributions/activity: current valid statuses plus an explicit nonzero
  unknown fallback; top eight normalized library genres; zero-filled last 12
  months; five personal-rating buckets (`0-2`, `>2-4`, `>4-6`, `>6-8`,
  `>8-10`); top five personally rated watched movies; and five most recent
  watched-date records with stable title/movie/relationship tie-breaks.
- Genre normalization accepts JSON strings or objects with `name`, collapses
  whitespace, ignores blank/malformed entries, deduplicates case-insensitively
  within a movie, and counts one movie once per label. Watched activity never
  substitutes `created_at` or `updated_at`.
- Empty/accessibility/responsive behavior: separate empty-library,
  no-watched, no-rating, missing-genre/runtime, and partial-coverage copy;
  Search/Import/Library/Watch Next actions; semantic headings/definition lists;
  visible counts/percentages and screen-reader summaries; CSS bars that do not
  rely on color; wrapped responsive grids; poster fallbacks and focus-visible
  movie links.
- Database: no Part 15.1 migration, table, RPC, index, trigger, policy, grant,
  dependency, or environment variable. Existing Part 12 owner/status/
  favourite/rating/watched indexes and the schedule index are sufficient for
  the documented several-hundred-to-1,000-row target.
- Tests: focused calculation/mapping/formatting/adapter/safe-error and
  route/navigation/protection/rendering coverage plus guarded Statistics
  Playwright coverage are committed. Current manual authenticated workflow and
  two-user private-scope evidence pass; automated Windows browser execution
  remains environment-blocked and is deferred to Preview.
- History: investigation found no prior implementation in reachable Git,
  reflog-only commits, deleted paths, or another route. `statistics-v1` and
  `settings-v1` both point to commit `8f92cbe` and tree `38b1e70`; the tag is
  deliberately not moved. Part 15.1 was built on the committed Part 15 baseline
  `f6b15d4` and committed as `0c05fc8` with tag `statistics-v2`.

## 27. Agent Handoff Protocol

Before starting any task, every coding agent must:

1. Read `AGENTS.md`.
2. Read `docs/PROJECT_CONTEXT.md`.
3. Inspect files relevant to the requested feature.
4. Check the current Git diff.
5. Check existing migration files.
6. Present a short plan.
7. Preserve working routes and features, especially critical auth routes.

After completing any task, update `docs/PROJECT_CONTEXT.md` with only relevant:

- new or changed features and routes;
- database fields, migrations, policies, grants, and application status;
- dependencies and environment-variable **names only**;
- tests and latest actual verification results;
- known/resolved issues;
- current milestone and next milestone.

Do not rewrite unrelated sections, erase useful history, duplicate the full
context elsewhere, or add secrets/actual environment values. Keep this document
concise, internally consistent, and grounded in repository evidence.

## Context Change Log

### 2026-08-04 - Codex live Part 15 TMDB limiter verification

- Safety guards passed before any allowance was consumed: the target was
  explicitly `development`, the application and expected Supabase URLs matched
  exactly without being printed, QA A/B were configured and distinct, and the
  existing loopback app's CSP matched the same development project at runtime.
- Live effective-access preflight passed: the limiter table was readable only
  through the scoped privileged diagnostic, the named RPC executed for an
  authenticated QA client, anonymous RPC access failed, and authenticated and
  anonymous direct table reads failed. Invalid operation/cost probes and the
  missing-RPC control did not consume valid allowance. Exact PostgreSQL catalog
  ACL/RLS/PK/CHECK/function-definition checks remain blocked because no direct
  database URL, CLI link, or management/catalog runner is configured.
- All ten guarded limiter integration tests passed: search 30/31, details
  20/21, RPC-only import search/details 120/121, batched costs, user and
  operation isolation, natural expiry/restart, invalid input, unauthenticated
  and expired sessions, ten concurrent accepts, and exactly 30 accepted/five
  denied out of 35 concurrent search calls with final accepted cost 30.
- The focused real-browser search limiter test passed with one worker and no
  retries: request 31 showed the friendly rate-limit copy via the documented
  application-level HTTP 200 response, QA B remained available, click/double-
  click/Enter each emitted one search navigation, query edits emitted none,
  browser/network diagnostics were clean apart from the specifically classified
  Next development cache diagnostic, and search recovered after the UI-reported
  retry interval. Poster optimization was locally fulfilled to avoid unrelated
  image-provider traffic.
- Final exact-user diagnostics found four valid operation rows per QA user,
  expected counts, valid timestamp ordering, no duplicates/unknown operations/
  negative counts, and then removed exactly the eight disposable QA limiter
  rows. No QA account or normal user data was deleted.
- Final repository checks passed: lint, direct TypeScript, 59 files/611 unit
  tests, the 10-test live limiter integration suite, one focused live
  Playwright test, the Next 16.2.12 build with 35 generated shells, and the
  post-build 478-artifact client-secret scan. The five unrelated integration
  tests remained explicitly skipped and are not counted as passing.

### 2026-08-04 - Codex Part 15 TMDB limiter verification harness

- Safety gate: the local application URL is loopback and application Supabase/
  TMDB variable names are present, but `E2E_TARGET_ENV=development`, the exact
  `E2E_EXPECTED_SUPABASE_URL` pin, disposable QA A/B credentials, and a direct
  catalog connection are absent. No login, limiter RPC, TMDB request, remote
  schema read/write, or QA-row cleanup was attempted.
- Static verification: the unchanged Part 15 migration defines the four exact
  per-user/operation buckets, private counter table, RLS, composite primary
  key, operation/nonnegative checks, authenticated-only SECURITY DEFINER RPC,
  fixed empty search path, advisory/row locking, natural window reset, and
  denial-without-increment behavior. Migration text is not claimed as live
  installation evidence.
- Added separately guarded `integration/rate-limit.integration.test.ts` and
  `e2e/tmdb-rate-limit.spec.ts`. The integration harness calls the limiter only
  through normal authenticated clients and reserves the server-secret client
  for exact read-only QA-row diagnostics. The browser suite uses sequential
  unique searches, in-memory QA contexts, safe response checks, and no
  trace/video. Neither suite can run live without its explicit traffic/fresh-
  bucket opt-in in addition to the existing development pin.
- Added import bucket-routing assertions and focused failure-classification/
  invalid-cost regressions. Permission failures that name the limiter are no
  longer classified as a missing RPC; true PostgREST schema-cache/missing-
  function responses remain distinct.
- Executed local evidence: lint and direct TypeScript passed; 7 focused files/
  65 tests and the full 59-file/611-test Vitest suite passed; the full live
  integration selection loaded 2 files/15 tests and skipped all 15; the focused
  limiter Playwright selection loaded one test and skipped it; the production
  build generated 35 static shells; and the fresh 478-artifact secret scan
  passed. Skipped live cases are not counted as passing.
- Live database object, ACL/RLS/constraint, threshold, expiry, concurrency,
  two-user, UI denial, cache, final-row, and cleanup results remain blocked,
  not passed. Run both read-only SQL audits in the confirmed development SQL
  editor before enabling the new live suites.

### 2026-08-03 - Codex scheduling profile-permission patch

- Root cause: the confirmed `SECURITY INVOKER`
  `watchflow_schedule_movie(uuid,timestamptz,text,text)` updates the owned
  profile's `timezone` and `updated_at`, but authenticated had UPDATE only on
  the first column. PostgreSQL permission denial prevented the schedule
  transaction from committing even though the RPC, EXECUTE privilege,
  `user_movies` privileges/RLS, profile ownership RLS, and queue normalizer
  were present.
- Added `202608030001_schedule_profile_permissions.sql` with only
  `UPDATE (timezone, updated_at)` on `public.profiles` to `authenticated`. No
  table-level UPDATE, `PUBLIC`/`anon` grant, RLS/policy change, or Part 15
  function recreation was added; the existing Part 15 migration was not changed
  or rerun.
- Tests/readiness: exact grant and effective-column contracts, strict ownership
  policy auditing, owner/foreign scheduling, timezone persistence, queue
  normalization, and `42501` permission-vs-missing-RPC mapping are covered.
  Focused Vitest passed 3 files/45 tests; full Vitest passed 59 files/601 tests;
  lint, direct TypeScript, the 478-artifact client-secret scan, and the Next
  16.2.12 production build with 35 static shells passed.
- Policy review: duplicate ownership-equivalent `user_movies` SELECT/UPDATE
  policies were retained because the base migration is absent and no regression
  evidence proves removal safe.
- Manual status: the new patch was not applied to Supabase, and post-patch live
  owner/cross-user scheduling, timezone persistence, and queue normalization
  were not retested.

### 2026-08-02 - Codex Part 15.1 personal viewing Statistics

- Historical audit: no Statistics implementation existed in reachable Git,
  reflog-only history, deleted paths, or an alternate route. The misleading
  `statistics-v1` tag remains unchanged on the Part 10B settings commit/tree.
- Baseline correction: Part 15 is committed at `f6b15d4`; the Part 15.1 work is
  the current uncommitted diff and does not rewrite prior history.
- Added protected `/statistics`, authenticated navigation, focused loading and
  safe error boundaries, server-only owner-scoped retrieval, defensive mapping,
  pure metrics/distributions/timeline calculations, lightweight accessible
  visualizations, watched-movie lists, coverage reporting, and distinct empty
  states.
- Security/data: fresh `auth.getUser()`, explicit owner filter plus RLS, no
  browser user ID, admin client, TMDB call, full-library Client Component
  payload, global cache, static private data, or public metadata.
- Database: no migration, RPC, index, table, policy, grant, dependency, or
  environment variable. The query analyzes at most 1,000 owned relationships
  and reports an exact-total/partial-coverage state.
- Tests/verification: lint and direct TypeScript passed; Statistics focused
  tests passed (4 files, 62 tests); full Vitest passed (59 files, 596 tests);
  the safe Playwright selection passed 35 and guarded/skipped 15; the
  post-build secret scan passed across 478 browser artifacts; and the Next.js
  16.2.12 build completed 35 static shells with `◐ /statistics` in its route
  table. All 10 authenticated Statistics browser cases were skipped by the
  unavailable development QA guard and are not claimed as passing.

### 2026-07-30 - Codex Part 15 testing and production hardening

- Added guarded public/authenticated/two-user/disposable-account Playwright
  architecture, a read-only live-Supabase integration suite, automatic
  redacted console/network diagnostics, two read-only SQL verification
  reports, post-build secret scanning, and testing/security/readiness
  documentation.
- Hardened auth callbacks/errors/logout, Supabase logging, private exports, CSV
  validation/formula protection, Server Action inputs, shared metadata
  ingestion, queue normalization/reads, scheduling fields/defaults, route
  errors/loading/empty states, poster fallbacks, accessibility semantics,
  security headers, and Next 16 lint compatibility.
- Added unapplied migration
  `202607300001_part_15_tmdb_rate_limits.sql`: durable per-user TMDB fixed
  windows, private limiter storage/RPC, canonical shared-cache markers,
  authenticated-read/server-write-only `movies` privileges, transactional
  movie-management/schedule RPC replacements, and preference-default repair.
  No speculative query index was added; the only new index is the limiter
  primary key.
- Final local verification: lint and direct TypeScript passed; 55 files/534
  unit tests passed; guarded integration loaded with 5 tests skipped;
  Playwright passed 35 and skipped 6 credential-gated cases; public clean
  Playwright MCP passed; both npm audits reported zero vulnerabilities; 462
  built artifacts passed the secret scan; and the Next `16.2.12` production
  build passed with 34 static page generations.
- Live limitations: no migration was applied, no real QA account/data was
  mutated, password email delivery and account deletion were not tested, live
  RLS/privileges/cascades remain unverified, protected screenshots/responsive
  QA remain blocked, and `/statistics` remains absent.
- Milestone: Part 15 hardening/test architecture is locally implemented; the
  required authenticated matrix and live Preview gates remain incomplete. Part
  16 Preview Deployment is next.

### 2026-07-29 - Codex Part 14 picker and rule-based recommendations

- Added protected `/picker` and `/recommendations`, authenticated navigation,
  URL-backed picker filters, eight documented moods, server random selection,
  in-memory repeat avoidance, transparent seed/scoring/diversity rules,
  concrete recommendation reasons, cold starts, refresh ordering, and safe
  favourite/Watch Next/custom-list integrations.
- Security/data: one fresh-`getUser`, owner-filtered, RLS-protected,
  exact-column dataset query handles at most 1,000 relationships. No browser
  user ID, full-library Client Component payload, admin client, TMDB/AI call,
  global cache, public metadata, or stored result was added.
- Database: no Part 14 migration, table, index, RPC, policy, privilege, trigger,
  dependency, or environment variable.
- Tests: seven focused Part 14 files/113 tests and the full 48-file/469-test
  Vitest suite passed. Logged-out/public Playwright passed 26 tests, including
  both new redirects and the sign-up regression at five public viewports.
  Lint, direct TypeScript, and production build passed.
- Browser limitation: MCP confirmed logged-out protection and the public
  390x844 sign-up layout only. Authenticated discovery flows, two-user
  isolation, mutation shortcuts, discovery-responsive screenshots, and live
  database behavior remain unverified because no confirmed QA sessions exist.
- Milestone: Part 14 is implemented locally; Part 15 Testing and Production
  Hardening is next.

### 2026-07-29 - Codex Part 13 private custom movie lists

- Added: protected `/lists` and `/lists/[listId]`, authenticated navigation,
  private list create/edit/delete dialogs, one-query count/poster summaries,
  personal-library search/filter/multi-add, accessible persisted up/down order,
  confirmed membership-only removal, and movie-detail multi-list membership.
- Database:
  `supabase/migrations/202607290001_part_13_private_custom_lists.sql` creates
  `lists`/`list_movies`, five justified index/index-backed structures, updated
  timestamp triggers, eight RLS policies, scoped authenticated privileges, six
  callable security-invoker functions, and statement-level cascade
  compaction. The migration was created only, not applied remotely.
- Security: membership always references `user_movies.id`; `auth.getUser()`
  supplies identity; no browser user ID or admin client is used. Missing
  table/column/RPC/schema cache, permission, validation, constraint, stale, and
  generic database failures have distinct safe handling and logging remains
  limited to `message`, `code`, `details`, and `hint`.
- Preservation: Part 12 relationship deletions now revalidate list routes, and
  the database membership-delete trigger keeps surviving list positions
  sequential without modifying Part 12 queue RPCs or shared `movies`.
- Tests: Part 13 focused 6 files/75 tests passed; focused Part 13 plus Part 12
  deletion/query regressions 13 files/184 tests passed; full Vitest 41
  files/356 tests, logged-out Playwright 24 tests, lint, direct TypeScript, and
  production build passed.
- Browser limitation: Playwright MCP verified logged-out list protection and
  public sign-up only. The requested authenticated screenshots, CRUD/order,
  two-user isolation, and live database/concurrency checks were not run because
  the migration is intentionally unapplied and no QA credentials/storage
  states exist.
- Milestone: Part 13 is implemented locally; Part 14 Movie Picker and
  Recommendations is next.

### 2026-07-29 - Codex single-movie removal fix

- Diagnosed: the card already submitted `user_movies.id`; the original deployed error was `PGRST202` because `watchflow_remove_library_movie(p_library_id)` was absent from the PostgREST schema cache, whose hint named the available Part 12 bulk-removal function.
- Changed: retired the legacy single-delete adapter, renamed the browser boundary to `userMovieId`, routed one-item removal through the shared authenticated Part 12 helper, added specific safe messages, exact affected-route revalidation, refresh/success behavior, and persisted safe Supabase error fields only.
- Database/queue: no migration or target-data change; deletion remains `user_movies`-only and the existing transactional Part 12 RPC deliberately normalizes the caller's queue after all removals.
- Tests: focused deletion/Part 12 tests passed (7 files, 113 tests); full Vitest passed (35 files, 281 tests); logged-out/public Playwright passed (22 tests); lint, direct TypeScript, and production build passed.
- Browser limitation: Playwright MCP had no authenticated session or QA credentials, so the requested destructive status/queue/two-user/filter/pagination matrix was not executed and is not claimed as passed.
- Part 12 status: local implementation and automated regression coverage are complete; authenticated destructive QA remains before final live sign-off.

### 2026-07-28 - Codex browser QA hardening

- Added: Playwright 1.62.0 configuration plus 22 logged-out auth, route-protection, keyboard, and responsive tests.
- Changed: Auth card titles are semantic headings; auth errors and recovery success are announced.
- Migration: No database change; Part 12 migration application remains unknown and manual.
- Tests: Lint, TypeScript, 271 Vitest tests, 119 focused Part 12 tests, 22 Playwright tests, and production build passed.
- Known issue: Authenticated Part 12/two-user QA is blocked by missing QA credentials/confirmation and unapplied-migration evidence; three high transitive production audit findings remain.
- Next: Apply/verify the Part 12 migration in development, supply two confirmed QA users, complete authenticated browser QA, then proceed to Part 13.

### 2026-07-28 — Codex Part 12

- Added: Private search/facets, filters, twelve sorts, ranged pagination, favourites, current-page selection, and confirmed bulk status/deletion.
- Changed: `/library`, stored-movie detail, CSV/JSON exports, library query/mutation modules, and milestone documentation.
- Migration: `202607280001_part_12_library_improvements.sql`; manual application and live privilege/RLS verification required.
- Tests: Lint, TypeScript, 270 Vitest cases, build, and logged-out route smoke passed; no live Supabase/Playwright test.
- Known issue: Part 11 `/statistics` remains absent; Part 12 search is a bounded literal scan and selection is page-local.
- Next: Part 13 custom lists.

### 2026-07-28 — Codex context-system audit

- Added: Canonical repository-wide project context and mandatory handoff protocol.
- Migration/tests: No schema change; inventoried four migrations; lint, TypeScript, 155 tests, and build passed.
- Known issue: Part 11/statistics is absent despite the `statistics-v1` tag.
- Next: Part 12 search and library improvements; do not implement it during this task.
