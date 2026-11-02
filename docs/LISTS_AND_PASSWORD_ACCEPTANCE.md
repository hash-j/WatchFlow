# Lists and profile password acceptance

Prepared on 2026-11-02 from clean branch `codex/part-18-production-operations`,
HEAD `b188c00`. No migration, dependency, environment change, commit or push.
Completed Unit 2D/calendar/QStash operators and fixtures are untouched.

## Behavior

- Custom-list sort is display-only: Manual order, Year: Oldest first, Year:
  Newest first, Title: A-Z, Title: Z-A. Returning to Manual restores saved
  positions. Move controls are disabled while another sort is displayed.
- Bulk additions append to the existing manual order. Only the newly inserted
  batch is ordered by release year ascending, then title and stable library ID.
  Unknown years are last; a release-date year is used when available. Existing
  members and positions are preserved by the existing owner-bound atomic RPC.
- Library selection reuses the current page's selected library IDs. Add to list
  loads at most 500 owned choices on demand. The existing maximum of 100 movies
  per mutation applies; duplicates already in a list are skipped and counted.
  Missing/cross-user selections fail before mutation; the RPC rechecks under its
  existing locks/RLS. Failed notification creation does not undo membership.
- Movie metadata and notifications use bounded batch reads/writes, not one
  foreground mutation per selected movie. List additions invalidate relevant
  list/movie-detail/notification views without a root-layout refresh. Sorting
  requires no network request. Existing bulk status/removal actions remain.
- Profile password change gets the current user from Supabase Auth, verifies
  that user's current password with email/password sign-in in a nonpersistent
  verifier client, and updates through the original authenticated SSR client.
  The active session is not replaced/downgraded. `current_password` is also sent
  with `updateUser`; independent verification does not rely on a project toggle.
  No passwords/tokens are logged, returned as state, stored in application rows,
  put into a URL, or stored in client persistence. Successful submission clears
  the form. Supabase errors are sanitized. A server fresh-login requirement is
  honored with explicit sign-in guidance; no assurance requirement is bypassed.
- External-provider-only accounts get provider/recovery guidance instead of a
  nonworking current-password form. The action enforces that policy as well.

## Hashim's manual checklist

Use a disposable account for password checks. Repeat list/dialog checks at a
mobile viewport. Do not use or alter the completed calendar acceptance fixture.

1. Bulk-select several Library movies with different years, including an unknown
   year. Add to an empty custom list. Check oldest-first placement, unknown last,
   and the added-count/list-name result. Repeat on an existing manually ordered
   list; confirm only the new batch appends and old positions stay unchanged.
2. Use all five Sort options. Check title/year directions and numbering; unknown
   years stay last in both year views. Reload/navigation returns to Manual order.
3. In a sorted view, check that Move earlier/later are disabled and explanatory
   text is visible. Return to Manual, move both ways, reload and verify the saved
   order. Check first/last boundaries.
4. Select a mix of existing/new list members. Add them and verify added/skipped
   counts and no duplicate membership. Repeat the same selection (all skipped).
   Delete a target list in another tab before confirming; expect a safe error.
5. In Settings → Profile, test mismatch, short password and incorrect current
   password. Change successfully, log out, then sign in with the new password.
6. Log out and confirm the old password no longer authenticates. If available,
   check an external-provider-only account shows guidance instead of the form.

## Validation and limits

All 571 targeted list/auth/library/settings/notification tests passed across 68
files; TypeScript, ESLint and whitespace checks passed. Vitest used a workspace
temporary directory to avoid the Windows sandbox's cache-rename restriction.
The guarded existing Supabase RLS integration suite was invoked
with only relevant read/isolation cases selected; it skipped because its explicit
development integration prerequisites were not enabled. No live password change
or list fixture mutation was performed here. The production build encounters the
existing external Geist Google Fonts fetch failure; that is separate from these
features. The local /auth/sign-up HTTP smoke test returned 200 using Webpack;
Turbopack's Windows CSS worker could not run in this environment. No application
configuration was changed for this check, and temporary test servers were
stopped. Runtime browser acceptance remains the checklist above.

## Change inventory

```text
app/(app)/actions/lists.ts
app/(app)/lists/[listId]/page.tsx
app/(app)/settings/profile/page.tsx
app/(app)/settings/password-actions.ts
components/library/library-selection-workspace.tsx
components/lists/bulk-add-to-list-dialog.tsx
components/lists/sortable-list-movies.tsx
components/lists/list-movie-row.tsx
components/lists/list-order-controls.tsx
components/settings/change-password-form.tsx
lib/auth/change-password.ts
lib/auth/change-password.test.ts
lib/lists/sorting.ts
lib/lists/sorting.test.ts
lib/lists/supabase-lists.ts
lib/lists/supabase-lists.test.ts
lib/lists/actions.test.ts
lib/lists/ui.test.ts
lib/library/library-ui.test.ts
lib/notifications/supabase-notifications.ts
lib/notifications/supabase-notifications.test.ts
docs/PROJECT_CONTEXT.md
docs/LISTS_AND_PASSWORD_ACCEPTANCE.md
```
