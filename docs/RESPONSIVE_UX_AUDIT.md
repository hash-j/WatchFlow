# WatchFlow Responsive UX Audit

Date: 2026-08-12  
Status: implementation complete in the uncommitted working tree; final local gates recorded below

## Scope and recovery

This milestone resumed an interrupted working tree rather than recreating it.
The recovery inspection found 52 modified tracked files and five new responsive
files from the interrupted session. Every diff and new component was inspected,
`git diff --check` was clean, imports resolved, and no file was truncated or
partially written. Existing authentication, Supabase/RLS boundaries, TMDB
integration, migrations, and product behavior were preserved.

## Routes audited

Public/authentication: `/`, `/auth/login`, `/auth/sign-up`,
`/auth/forgot-password`, `/auth/update-password`, `/auth/reset-password`, and
`/auth/error`.

Protected: `/dashboard`, `/search`, `/library`, an owned
`/library/[movieId]`, `/statistics`, `/lists`, an owned `/lists/[listId]`,
`/picker`, `/recommendations`, `/import`, `/watch-next`, `/schedule`,
`/settings`, `/settings/profile`, `/settings/preferences`,
`/settings/notifications`, and `/settings/data`.

Global and route-specific not-found, loading, error, empty, bulk-action,
Add Movies, list CRUD/removal, library confirmation, and account-deletion
states were also inspected in source. The responsive browser suite opens the
major navigation, Library filters and bulk toolbar, shared dialogs, the Add
Movies dialog, and dynamic movie/list detail routes.

## Viewports

- Mobile: 320x568, 360x640, 375x667, 390x844, and 412x915.
- Tablet: 600x960, 768x1024, 820x1180, and 1024x768.
- Desktop regression: 1280x720, 1366x768, 1440x900, and 1920x1080.

The public matrix covers all 13 sizes. The authenticated route matrix covers
all sizes except 1280x720; desktop application regression is covered at 1366,
1440, and 1920, while the public suite retains 1280 coverage.

## Initial problems and root causes

- A desktop-only navigation shell consumed too much narrow-screen width.
- Repeated route-local containers, headings, action rows, padding, and fixed
  column assumptions produced inconsistent gutters and unpredictable wrapping.
- Button and input heights were below a comfortable touch target in several
  flows; flex children were also missing deliberate shrink/wrap behavior.
- Library filters, bulk actions, list rows, queue rows, forms, and pagination
  compressed desktop arrangements instead of presenting a mobile hierarchy.
- Native dialogs used route-specific width/height/footer implementations and
  could put controls outside a short viewport.
- Import tables had legitimate wide data but lacked a shared, explicitly
  approved local-scroll contract and affordance.
- Long titles, labels, metadata, email addresses, chart labels, and intrinsic
  form widths could widen grid or flex tracks.

## Breakpoints and shared system

The implementation uses Tailwind's existing mobile-first breakpoints. Narrow
screens receive 16px page gutters, `sm` screens receive 24px, and large screens
receive 32px inside a shared maximum-width container. The application keeps a
drawer/header through tablet widths and activates the full sidebar at `lg`, so
navigation never leaves a tablet with a cramped desktop content column.

Shared components added or consolidated:

- `PageContainer`, `PageHeader`, `SectionHeader`, `ResponsiveActions`,
  `ResponsiveGrid`, `FormSection`, `EmptyState`, `MobileToolbar`, and
  `DataScrollRegion` in `components/ui/responsive-layout.tsx`.
- `ResponsiveDialog`, `DialogHeader`, `DialogBody`, `DialogFooter`, and
  `DialogCloseButton` in `components/ui/responsive-dialog.tsx`.
- `MobileAppNavigation` in `components/mobile-app-navigation.tsx`.
- Shared 44px minimum controls in Button and Input, responsive Card padding,
  consistent focus rings, `min-w-0`, wrapping, and poster sizing at the
  reusable-component boundary.

There is no root `overflow-x-hidden`. Wide import data is confined to
`DataScrollRegion`, marked `data-horizontal-scroll="approved"`, labelled as a
keyboard-focusable region, and given a narrow-screen swipe affordance.

## Route-specific results

- Dashboard: metric and media sections scale from one column to wider grids;
  poster rows and section actions stay bounded.
- Library: search/sort/view controls stack deliberately, advanced filters use
  a disclosure with active count and clear action, cards use responsive
  columns, list view becomes a stacked item, pagination wraps, and the bulk
  workspace stays visible without covering content.
- Movie detail: poster and management form stack on mobile, long titles wrap,
  controls become one column, and destructive removal remains separated.
- Statistics: metric grids and distribution rows use available width; labels
  wrap, values remain textual, and visual meaning is not color-only.
- Lists: cards/collages become one column, order controls retain touch size,
  list actions wrap, and Add Movies uses a viewport-height dialog with a
  scrolling body and reachable fixed footer.
- Picker and recommendations: filters and result content use single-column
  mobile flows; reasons and actions wrap without nested-card clutter.
- Import: file/mapping controls stack; preview and result tables scroll only
  within labelled data regions, never at document level.
- Watch Next: queue position, poster, metadata, and controls use a clear
  stacked mobile grid; move controls no longer collapse.
- Schedule: date/time/timezone controls stack and the schedule sections/forms
  use comfortable responsive columns.
- Settings: navigation labels remain visible, forms are one column on narrow
  screens, export/delete actions wrap, and the deletion dialog fits 320x568.
- Public/auth routes, loading, error, empty, and not-found states use bounded
  gutters, responsive headings, wrapping messages, and mobile-width actions.

## Navigation and accessibility

Mobile and tablet use a compact sticky application bar with current-page text,
a labelled menu trigger, and a native modal drawer. The drawer closes via its
close button, Escape, route selection, or backdrop; the native dialog traps
focus and prevents background interaction, and focus returns to the trigger.
Desktop retains labelled sidebar navigation and active-route state. Theme,
account, and logout controls remain accessible in both modes.

Interactive controls meet an approximately 44x44 CSS-pixel target. Icon-only
controls have accessible names, form labels remain associated, live
status/error messages keep their semantics, focus indicators are visible, and
dialog headers, descriptions, scroll bodies, and action footers remain usable
on short screens. No decorative motion was added.

## Automated coverage

`e2e/helpers/responsive.ts` verifies document `scrollWidth <= clientWidth`,
reports visible element selectors/accessible labels when their bounds leave
the viewport, checks form controls and cards, validates dialogs and actions,
and exempts only descendants of explicitly approved local data-scroll regions.

`e2e/responsive.spec.ts` covers every public/auth route at the 13 required
viewports. `e2e/responsive-authenticated.spec.ts` covers the 15 protected
static routes at 12 viewports, mobile/tablet drawer keyboard behavior, 320px
Library filters/bulk actions, 320px dialogs, and owned movie/list/Add Movies
layouts. Browser diagnostics reject unexpected console errors, page errors,
failed requests, and HTTP error responses.

## Screenshots

Interrupted-session baselines are retained in
`qa-artifacts/responsive-before/`. Required after images are retained in
`qa-artifacts/responsive-after/`, including mobile dashboard/navigation,
Library grid/list/filters/bulk, movie detail, Statistics, custom list/Add
Movies, Picker, Recommendations, Import, Watch Next, Schedule, Settings/account
deletion, and tablet dashboard/Library/Statistics/Schedule/Settings. These QA
artifacts are intentionally ignored by Git and contain no credentials or
tokens.

## Final overflow and limitations

The completed automated matrices found no document-level horizontal overflow,
off-screen visible elements, clipped form controls, or dialogs outside the
viewport on the routes and sizes listed above. The two intentionally wide
Import table regions remained locally scrollable and did not widen the page.

Remaining limitations: no automated axe or real mobile-keyboard simulation is
configured; delivered password-reset email links and the destructive
account-deletion execution remain separately guarded product checks; Preview
still needs device/browser and assistive-technology spot checks. These do not
represent known responsive overflow defects.

## Recorded local validation

- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm test`: 59 files and 611 tests passed.
- Public responsive Playwright: 13/13 passed across all required viewports.
- Full protected responsive sweep before the clean restart: all 12 static
  viewport sweeps passed; the focused interactions passed after correcting two
  test selectors/navigation-settling assumptions.
- Final clean-server protected validation: 10/10 passed at 375x667, 390x844,
  768x1024, 820x1180, and 1366x768, including mobile/tablet navigation,
  Library filters/bulk actions, shared dialogs, owned detail pages, and the Add
  Movies dialog. Browser diagnostics were clean.
- Statistics responsive regression: 5/5 passed at 375x667, 390x844, 768x1024,
  1366x768, and 1440x900.
- Two-user list isolation: passed after its existing Server Action redirect
  diagnostic was classified narrowly as an asserted navigation cancellation.
- `npm run build`: passed on Next.js 16.2.12 with 35 generated route shells.
- `npm run scan:client-secrets`: passed across 478 browser artifacts; no
  forbidden category or configured secret-value leak was found.

The controlled live TMDB search/add/remove smoke remained incomplete: its
search navigation timed out twice even though a direct status-only TMDB request
returned HTTP 200. This is reported as a remaining external/workflow-test
failure, not as responsive coverage or a passing regression. Route reachability,
the CSV inspect flow, and the non-provider authenticated checks passed.
