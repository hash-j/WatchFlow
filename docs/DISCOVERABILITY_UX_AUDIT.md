# WatchFlow Discoverability UX Audit

Date: 2026-08-26  
Milestone: Part 15.5C — App Discoverability & User Friendliness  
Next milestone: Part 15.5D — Final Visual/UI Polish

## Scope and evidence

This milestone changes navigation information architecture, terminology,
page-purpose copy, empty states, action hierarchy, progressive disclosure, and
accessibility cues. It adds no product feature, database object, dependency, or
environment variable.

The pre-edit audit combined:

- the complete App Router tree and protected layouts;
- desktop and mobile navigation source;
- every major page, empty state, dialog, destructive control, and responsive
  primitive;
- the clean Git baseline at committed Part 15.5B (`41cb4b4`); and
- authenticated rendering from the real running local app with both guarded QA
  accounts. All 15 protected static routes returned HTTP 200 for both accounts;
  owned movie detail returned 200 for both, and owned list detail returned 200
  for the populated account.

The richer account supplied populated Library, Lists, Watch Next,
Recommendations, Picker, and Statistics states. The lighter account supplied
empty Watch Next, Schedule, Lists, no-watched Dashboard, and limited Statistics
states. No data mutation was used for the audit.

Interactive Playwright could not start a worker or Chrome in this Windows
environment: worker launch failed with `spawn EPERM`, and direct Chrome launch
failed with access denied. Authenticated server rendering therefore establishes
real route/data behavior, but it does not replace final browser focus, console,
network, and layout evidence. Browser results are recorded honestly below.

## Original discoverability issues

- Desktop and mobile showed one flat list of 11 equally weighted destinations.
- Search Movies/My Library/My Lists conflicted with shorter terminology used
  elsewhere.
- Dashboard offered four equal feature cards, including advanced Import, and
  gave implementation-level account state unnecessary prominence.
- Search, Schedule, Statistics, and Profile Settings exposed server, timestamp,
  repository, or storage-policy language.
- Watch Next did not clearly contrast its ordered near-term queue with Want to
  Watch.
- Lists explained collections but made users infer the distinction from Watch
  Next.
- Movie detail labelled the personal section but not the general movie section;
  removal appeared beside the poster before ordinary personal controls.
- Picker showed every optional filter before its main action.
- Recommendations empty states offered four competing destinations.
- Several compact Dashboard/Schedule empty states stated absence without a
  useful next step or context.
- Delete List was prominent on every summary card and alongside ordinary list
  actions.
- Settings had useful sections, but “Data and Privacy” did not communicate the
  account-control scope as clearly as the other labels.

## Navigation information architecture

Before:

```text
Dashboard, Search Movies, My Library, Statistics, My Lists, Movie Picker,
Recommendations, Import Movies, Watch Next, Schedule, Settings
```

After:

```text
HOME
  Dashboard

YOUR MOVIES
  Library
  Watch Next
  Schedule
  Lists

DISCOVER
  Search
  Movie Picker
  Recommendations

INSIGHTS
  Statistics

ACCOUNT
  Import Movies
  Settings
```

One exported grouped model supplies desktop and mobile, so order cannot drift.
Groups have visible labels plus `role="group"`/`aria-labelledby`; links retain
text, supporting icons, minimum targets, focus rings, and `aria-current="page"`.
Settings and sign out remain directly available without nested menus.

## Canonical terminology

| Concept | Canonical term | Contextual action examples |
|---|---|---|
| Saved personal collection | Library | Open Library, Browse Library |
| Near-term ordered queue | Watch Next | Add to Watch Next, Move earlier |
| Date/time plans | Schedule | Schedule a Movie |
| Custom private collections | Lists | Create List, Back to Lists |
| Catalogue lookup | Search | Search Movies, Search for a Movie |
| Random private-library choice | Movie Picker | Pick a Movie |
| Personal rule-based suggestions | Recommendations | Refresh suggestions |
| Personal viewing metrics | Statistics | View Statistics |
| CSV migration tool | Import Movies | Upload CSV |
| Data/export/deletion settings | Data & Account | Export, review deletion |

“Queue” is retained only when explaining that Watch Next is ordered. “Custom
collections” is retained only to define Lists. My Library/My Lists and page-title
variants such as Search Movies are not navigation or page names.

## Page-purpose and action decisions

- Dashboard now has a Dashboard heading, a short account-relevance greeting,
  a compact Next actions section, and a Library count above relevant movie
  summaries. Its primary action follows current state: open Watch Next when it
  has an item, otherwise Search for a Movie. Import is no longer a default
  Dashboard peer action.
- Search says it finds titles to save to the private Library; provider/server
  implementation is absent.
- Library says what it contains. Search remains first, filters stay collapsed,
  active filters remain removable, and a progressive Status guide distinguishes
  Want to Watch, Watch Next, Scheduled, and Watched. Selection mode is named
  explicitly and bulk actions remain conditional.
- Movie detail labels Movie information and Your WatchFlow details. The latter
  explicitly calls rating/status/review/schedule private. Remove from Library
  moved to a separate destructive section after normal details and Lists.
- Watch Next defines an ordered near-term queue and contrasts Want to Watch.
  Reorder controls say Move earlier/Move later and include accessible labels
  and title hints.
- Schedule says movies come from the Library and explains local time/timezone in
  user language. Today, Upcoming, and Past have purpose-specific empty copy.
- Lists defines custom collections and explicitly contrasts Watch Next. Empty
  list detail includes its Add Movies action. Delete List is no longer on every
  summary card or beside primary list actions; it lives in a separated section
  on list detail.
- Movie Picker leads with Pick from your Library and keeps Pick a Movie visible.
  Optional filters live in a labelled disclosure that reports active count.
- Recommendations says suggestions use personal ratings and clear matching
  rules, preserves “Because you rated…” reasoning, and never claims AI. Empty
  states now prioritize Search with Library as the single secondary route.
- Statistics uses user language for ratings, genres, watched dates, coverage,
  and timezones. Empty/no-watched/no-rating states retain useful actions.
- Import states `.csv`, when Import is useful, the four user-facing matching
  stages, review-before-save, and that confirmed movies enter the private
  Library. Detailed matching remains in later wizard steps.
- Settings keeps Profile, Preferences, Notifications, and Data & Account.
  Subpages state their purpose. Exports precede a clearly labelled Danger Zone;
  profile-photo limitations no longer mention repository/storage internals.

## Empty-state and CTA strategy

An empty state should name the empty concept, explain why or what populates it,
and point to one best next step. A second action is included only when it is a
genuinely distinct path (for example Search versus Import for an empty
Statistics library). Inline Dashboard and Schedule states rely on a visible
nearby action area or form rather than repeating buttons in every card.

Primary actions use the existing default Button treatment. Secondary actions
use outline/ghost treatment. Destructive actions use the destructive variant,
confirmation, and spatial separation. Cancel remains secondary and appears
before the destructive confirmation in reading order while the responsive
footer reverses visual stacking appropriately on narrow screens.

## Progressive disclosure

- Library advanced filters and the new status guide use native `details`.
- Picker optional filters use native `details`, auto-open when filters/warnings
  are active, and collapse after clearing.
- Recommendation scoring remains under How recommendations work.
- Import’s high-level process is optional before upload; detailed mapping,
  matching, and conflict controls appear only at their relevant step.
- Frequently used Search, Pick a Movie, Library view, and primary form actions
  remain visible.

## Routes audited

- `/dashboard`
- `/search`
- `/library`
- `/library/[movieId]`
- `/watch-next`
- `/schedule`
- `/lists`
- `/lists/[listId]`
- `/picker`
- `/recommendations`
- `/statistics`
- `/import`
- `/settings`
- `/settings/profile`
- `/settings/preferences`
- `/settings/notifications`
- `/settings/data`

Critical `/auth/sign-up` stability remains covered by existing route and
Playwright regressions; the final local HTTP check returned 200.

## Responsive viewports

Required matrix:

- Mobile: 320×568, 360×640, 375×667, 390×844, 412×915
- Tablet: 768×1024, 820×1180
- Desktop: 1366×768, 1440×900, 1920×1080

The implementation reuses the Part 15.2 no-root-overflow primitives, labelled
drawer, responsive actions, dialog containment, and local-only data scroll
regions. Source coverage protects the shared grouped navigation model. The
responsive suite loaded 17 cases but hit `spawn EPERM` before a worker on two
attempts. The required matrix is therefore environment-blocked and is not
represented as passing.

## Final local verification

- Lint: passed.
- TypeScript: passed.
- Focused UX/source tests: 4 files, 53 tests passed.
- Complete unit/source fallback: 69 files, 707 tests passed.
- Required `npm test`: environment-blocked before config load by `spawn EPERM`
  on two attempts.
- Discoverability Playwright: four cases loaded; environment-blocked before
  worker startup by `spawn EPERM` on two attempts.
- Responsive Playwright: 17 cases loaded; environment-blocked before worker
  startup by `spawn EPERM` on two attempts.
- Client-secret scan: final post-build scan passed across 260 current browser
  artifacts; an earlier pre-build scan passed 325.
- Production build: bundle compilation passed twice; Next's TypeScript worker
  then hit `spawn EPERM` twice. Direct TypeScript passed.

## Accessibility findings

Implemented/preserved:

- semantic page headings and section headings;
- labelled navigation and settings navigation;
- named navigation groups and current-page semantics;
- all navigation items retain text labels;
- keyboard-native disclosures and dialogs;
- visible focus rings and 44-pixel navigation/action targets;
- labelled Favourite, theme, drawer, reorder, filter-removal, and dialog-close
  controls;
- visible Move earlier/Move later wording plus title hints;
- status/empty feedback through `role="status"` or `role="alert"` where state
  changes;
- contextual Back to Library and Back to Lists links; and
- no status, active route, or chart value communicated only by color/icons.

Remaining manual evidence:

- assistive-technology reading order and announcements;
- native dialog focus trapping across supported browsers;
- touch/device checks; and
- fresh keyboard/overflow verification once Chrome can start.

## Remaining usability concerns

- Library is still the densest route and its largest client bundle remains a
  later performance/polish concern.
- Import necessarily remains a seven-step advanced workflow.
- Settings navigation is compact at mobile widths; real-device text wrapping
  should be observed in Part 15.5D/Preview.
- Dashboard/Schedule/List legacy reads retain existing documented data bounds.
- The app still needs real-device and assistive-technology Preview evidence.
- Visual rhythm, typography refinement, and final aesthetic polish belong to
  Part 15.5D, not this milestone.

## Database impact

No migration or database change was created. Part 15.5C uses existing routes,
state, actions, and data contracts.
