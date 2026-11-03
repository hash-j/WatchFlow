# Profile pictures and custom-list thumbnails

Implemented from clean `codex/part-18-production-operations` HEAD `973ef90`,
after Hashim approved the list sorting, Library bulk lists and password batch.
Codex performed no commit, push, live Storage change or migration application.
Completed calendar/QStash/Google acceptance code and fixtures are untouched.

## Current development status — original committed, correction awaiting approval

Hashim reports that `202611020001_private_profile_and_list_artwork` committed on
development after the required approval, then stopped with
`QSTASH_CHANGED_AFTER_COMMIT migration_committed=true`. Do not reapply or repair
the migration. Do not use the completed Unit 2D operators or modify schedules.

The subsequent read-only policy inspection supplied by Hashim confirms an
ACTUAL_POLICY_DEFECT in `watchflow_artwork_insert_own` and
`watchflow_artwork_list_insert_guard`: the inner `name` resolved to `l.name`,
the list title. Ordinary valid list artwork can be rejected. A crafted owned
list title can also satisfy the EXISTS check for an unrelated path list ID.
Existing namespace ownership and overwrite restrictions still apply; this is
not authorization to overwrite or read another user's object namespace.

One forward correction is prepared, **not applied**:
`supabase/migrations/202611020002_fix_private_list_artwork_policies.sql`.
It adds an invoker helper with an explicit object-path argument, referenced as
`$1` inside the list lookup to avoid SQL column capture. Existing strict path
shape and caller namespace checks are reused; the parsed list must exist and
belong to `auth.uid()`. Only the two defective INSERT checks are altered. The
private bucket, other four policies, no-overwrite, SELECT/DELETE behavior and
all existing data are preserved. The original migration is byte-for-byte unchanged.
Do not apply either migration through the original operator's application path.
A separate approved development deployment of the correction is still required.

### Corrective development operator (prepared; not executed by Codex)

From `E:\watchflow` in the existing credentialed PowerShell session:

```powershell
node .\scripts\apply-dev-list-artwork-policy-fix.mjs
```

It inherits the already loaded database password, CA path and EU QStash token;
do not persist or paste credentials. The proven direct pg/verified-TLS/linked
development identity checks are reused. Both migration files are SHA-pinned.
The ledger must show the original applied exactly once and the correction absent
as the only pending repository migration; duplicates, remote-only, unrelated
pending or an already-applied correction fail closed before prompting.

The precondition validates the exact known legacy INSERT defect and original
three helper contracts; that legacy mode is never used by `--recover`. Require:

```text
APPROVE_WATCHFLOW_DEV_LIST_ARTWORK_POLICY_FIX
```

Anything else aborts. After approval the target/hash/ledger/data/schema checks
repeat with the migration ledger locked. Only the corrective SQL body executes,
followed by its single version/name/statements ledger insert in the same
transaction. Postchecks require the fourth helper's exact source, invoker mode,
signature, grants and empty search path; corrected policy semantics; private
bucket and six-policy inventory. Original helper metadata, all four unaffected
policies and avatar branches remain unchanged. Existing public/Auth/Storage
data (including artwork bucket and thumbnail references) must fingerprint-match.
Avatar/owner/anonymous checks are read-only. Both schedules remain paused with
the approved stable-field/label comparison. No uploads, fixtures, OAuth, Google,
GitHub, executor, CLI broad deployment or QStash mutation is performed.

`--precheck-only` returns after read-only checks without prompting or writing.
Failures report `correction_committed=false`, `true`, or
`UNKNOWN_DO_NOT_RERUN`; never retry application blindly after a commit attempt.
Use the existing original operator's read-only `--recover` for already-committed
state. No corrective deployment or live postcheck has been executed by Codex.

### Read-only recovery operator (prepared; not executed by Codex)

The latest reported recovery correctly rejected the defective list expressions.
The exact binding defect was supplied through live metadata by Hashim. If another
safe metadata capture is needed, the diagnostic remains available:

```powershell
node .\scripts\apply-dev-private-artwork-migration.mjs --inspect-policies
```

This diagnostic requires only the inherited database password and CA path,
uses the same development link/identity/ledger guards, and performs read-only
SQL only. It prints the six policy definitions with their names/schema/table,
commands, roles and permissive status. It never contacts QStash or changes the
validator, policies or data. It can inspect the known pending corrective migration
state. Recovery itself remains fail-closed until the correction is installed.

From `E:\watchflow` in the existing credentialed PowerShell session, run:

```powershell
node .\scripts\apply-dev-private-artwork-migration.mjs --recover
```

Inherit `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_CA_CERT_PATH` and `QSTASH_TOKEN_EU`
from that session. Do not persist or paste their values. The operator uses the
existing `pg` client and Part 18J session-pooler/TLS conventions, with certificate
verification enabled. No CLI, Management API or password-bearing URL is used.

Recovery returns through its own branch before any application approval, write
transaction, DDL, ledger insertion or locking code. It uses only read-only SQL
transactions and the exact two schedule GETs. It requires the target version/name
once, recorded statements equal to the pinned migration, private bucket, both
fields, all six policy contracts, helper source/signatures/grants and RLS.
Owner/anonymous/path helper reads and profile/list/membership integrity must pass.
Two fresh read-only database snapshots must agree, including thumbnail references.
No migration, uploads, credential changes, executor or OAuth is run.
The corrected validator additionally requires the new invoker helper with its
exact pinned source/signature/grants and the corrected INSERT expressions. It
does not accept the original defective expression as equivalent formatting.

Only stable schedule fields are compared: ID, destination, GET, cron, retries,
timeout, paused state and labels. Calendar values are pinned. Reminder fixed
values are pinned to its existing acceptance contract. Per Hashim's explicit
approval, its current label names become the in-memory baseline only after all
other fixed fields pass. A second GET must preserve that set; order is immaterial.
Opaque/volatile metadata and header/callback/auth values are excluded. Stable
failures print only schedule and field names, never raw values.

The old full-object hashes have no retained snapshots. The exact historical
changed property is UNKNOWN, and a volatile-only cause is not proven. The old
failure location follows successful committed DB/data checks, but no historical
data snapshot is reconstructed. Recovery states its comparison scope explicitly.
On success it prints `ARTWORK_MIGRATION_RECOVERED_PASS` with the requested safe
field/bucket/policy/pause assertions. Browser and image-upload tests remain manual.

### Original application path (historical; do not run again)

It pins the branch, development URL, linked name/ref, pooler identity and exact
migration SHA-256, then verifies the live known development fixtures. It reads
the PostgreSQL migration ledger directly and requires all repository predecessors
applied, no remote-only/duplicate versions, and this migration as the sole pending
version. Conflicting columns, bucket, policies, helpers or named reference guards
abort before approval. It requires exactly:

```text
APPROVE_WATCHFLOW_DEV_PRIVATE_ARTWORK_MIGRATION
```

After approval it repeats target/hash/ledger/conflict checks. It applies only
the pinned file's SQL body and records that one ledger entry in the same explicit
transaction. The file's outer transaction delimiters are replaced so schema,
bucket, ledger and pre-commit postchecks succeed or roll back together. It never
runs `db push`, `migration up`, other migrations, test fixtures or artwork uploads.

Postchecks verify both fields, private bucket limits/MIME, the six policy names,
commands/roles/restrictive boundaries, helper signatures/grants/empty search paths
and reference guards. Read-only authenticated-role queries verify owned profile,
list and Storage helper initialization; anonymous, foreign and traversal helper
checks must be denied. These are SQL/RLS checks, not a browser login or upload.
The operator keeps only in-memory fingerprints of existing public data, Auth
users, Storage objects/other buckets, existing functions and policies. Existing
data must match before and after, excluding only the new nullable list column.
Both real schedules were checked paused with GET-only reads. The former complete
object comparison caused the final stop and has been replaced by the stable-field
policy above. No Google, GitHub or executor call occurs.

`--precheck-only` performs the initial read-only checks without prompting or
applying anything. On a failure after a commit attempt, read the sanitized
`migration_committed` status: `UNKNOWN_DO_NOT_RERUN` means do not rerun blindly;
`true` means the migration committed but final verification needs attention.
Local HTTP checks and the nine browser/upload tests below remain separate.
Live application was reported by Hashim; Codex has not run live recovery.

It reuses `profiles.avatar_url` for a private object reference, adds only
`lists.thumbnail_path`, and creates the private `watchflow-artwork` bucket.
The gallery/detail retain their existing behavior before the new column exists;
upload controls report a safe setup/storage error until deployment is complete.
The previous list sorting, membership and password flows are unchanged.

## Security and image contract

- Source uploads: JPEG, PNG or WebP only; maximum 2 MiB and 20 megapixels.
  Server checks signatures, decoded format, pixel count and corrupt/multiframe
  input. Existing Sharp 0.35.3 is now a declared direct dependency. Output is
  resized to fit 1024 × 1024, EXIF-oriented, metadata-stripped WebP. SVG/GIF/HTML
  and MIME-spoofed files are rejected; uploaded filenames are never object keys.
- Objects use `avatars/<verified-user>/<random-version>.webp` or
  `list-thumbnails/<verified-user>/<owned-list>/<random-version>.webp`.
  Server authentication is fresh `getUser`. The list row must belong to that
  user. No client owner or object path is accepted. All Storage calls use the
  ordinary authenticated client, never a browser service-role credential.
- Existing profile/list RLS remains. The list reference constraint and avatar
  update trigger enforce owner-qualified paths. Legacy unchanged avatar values
  do not block unrelated profile edits and are not rendered as remote URLs.
- Six bucket-scoped Storage policies include restrictive owner and immutable
  object boundaries, so broader permissive policies cannot bypass them. A list
  insert additionally requires an owned list. Other buckets keep their policy
  behavior. The migration refuses to proceed if Storage object RLS is disabled.
  Old version/orphan objects can only be read/removed by their path owner.
- Private same-origin image GET verifies the session and owner, then downloads
  through Storage RLS. It serves only WebP signature bytes with `private,
  no-store`, `nosniff` and same-origin resource protection. Arbitrary URLs,
  traversal and cross-owner paths are rejected. There are no per-render signed
  URLs or new CSP/image-host exceptions. The existing service worker does not
  cache this API route.

## Replacement, removal and failure behavior

Each replacement gets a new versioned URL. A compare-and-swap reference update
prevents one tab overwriting a newer image from another. The prior object is
removed only after a confirmed reference update. A rejected CAS cleans only
that request's unused new object. An ambiguous database response does not delete
possibly referenced files: refresh before retrying. Such failures can leave a
private orphan, never a cross-user deletion.

Removal clears the reference and then deletes the old object. If stored-file
cleanup fails after the reference changed, the success message explicitly warns
that cleanup failed; the new image/fallback is already authoritative. A database
failure is reported as unconfirmed, without deleting the old object. Errors do
not contain provider messages, uploaded bytes, auth tokens or private paths.

Confirmed, recent-login account deletion now first removes this user's artwork
through bounded Storage API batches. This is necessary because Supabase blocks
deleting users who own Storage objects. A narrow invoker/RLS path-listing RPC
includes orphaned versions; it accepts no owner ID and does not directly delete
Storage metadata. Cleanup failure keeps the account active and blocks Auth
deletion. Some images may already have been removed on a partial failure; retry
finishes cleanup. Other buckets are outside this helper's scope.

## UI and performance

A shared avatar renders profile, desktop account and mobile drawer pictures,
with initials on absent/invalid/unavailable images. Lists retain their existing
poster collage/empty visual when custom artwork is absent or cannot load.
Gallery cards display custom artwork; list detail contains list information and
movies only. The separate Edit thumbnail action/inline detail cover were removed.
Both Create list and Edit list contain the shared cover field alongside name and
description: current/local preview, strong upload/replace CTA, remove/undo and
format/size guidance. There are no permanent upload forms in list cards.
Previews are local object URLs and are revoked on change/unmount; no crop editor.

Profile data is reused from the existing request context. Gallery references are
loaded in one owner-scoped batch; detail adds the reference to its existing query.
There is no database request per list card. Avatar changes revalidate the shared
layout; thumbnail changes revalidate only Lists and that list detail.
The combined create/edit form invalidates its existing list/membership views
immediately in the server action so card cover changes appear in its response.

Create first saves an owned list, then uses the existing artwork mutation for an
optional cover. Basic MIME/size errors are rejected before saving the list. If
full image processing/Storage later fails, the created list is retained and its
detail displays a safe retry notice; creation is not repeated or rolled back.
Edit applies details then the optional upload/remove through the same secure
flow. A cover failure reports that details saved and keeps the dialog open.
Both forms retain name/description and selected File in memory for validation
retries; closing clears the selection. Removal happens on Save, so Cancel/Undo
preserve the stored cover. No new migrations, Storage or ownership changes.

## Hashim's manual checklist (after migration deployment)

Use a disposable development account and list, not the calendar acceptance fixture.

1. Settings → Profile: upload a JPEG/PNG/WebP; check avatar and sidebar/drawer.
2. Refresh/reopen: confirm the avatar persists.
3. Replace it: confirm the new photo appears immediately, without old-cache reuse.
4. Remove it: confirm initials return everywhere.
5. Create a list with a cover and another without one; check gallery cards.
6. Refresh/reopen: confirm the thumbnail persists.
7. Edit list: check the current preview, select a replacement and Save; verify the card.
8. Edit list: Remove cover → Undo/Cancel preserves it; Remove → Save restores the collage/empty fallback.
9. Repeat create/edit on mobile; check file buttons, modal scrolling, footer and no horizontal overflow. List detail must have no cover block/Edit thumbnail button.

Also try unsupported/SVG, corrupt, spoofed MIME and oversized files; expect safe
errors. With two development users, verify that forged other-user list IDs and
Storage paths cannot upload/read/update/delete their artwork. Test two-tab
replacement conflicts. Confirm the approved sorting, bulk-add and password flows
still work. Live Storage RLS and end-to-end deployment are not claimed verified
by unit/static tests.

## Local validation

All 652 relevant tests passed across 80 files, including actual Sharp decoding of
valid/invalid formats and compressed oversized dimensions, mutation/ownership
and concurrency boundaries, image-route authentication, gallery batch reads,
account cleanup and migration/UI contracts. The previously approved sort/bulk/
password suites remain passing. TypeScript and ESLint passed. The production
build failed only fetching Geist from Google Fonts. Read-only localhost smoke
checks returned 200 for sign-up and 401 for an unauthenticated artwork GET. The
existing development server was not stopped or modified. Recovery/live Storage
RLS verification and the nine manual checks remain pending.

The 41 passing offline operator/correction checks exercise the actual production runner
with mocked PostgreSQL/GET transports, including no-write precheck, exact typed
approval, sole-pending guard/recheck, transactional ledger insertion, rollback,
uncertain commit classification, unchanged-data checks and separate read-only
recovery. Production GET readers are exercised with mocked HTTP responses,
including volatile metadata changes and safe stable-field failure codes. The 54
artwork unit tests, syntax, TypeScript and ESLint also pass. The production build
again failed only fetching Geist from Google Fonts. No live operator run
is part of these tests.

The separate cover-dialog browser fixture uses the actual client dialogs with
mocked actions, dummy public configuration and intercepted synthetic images.
It performs no live application/Storage operation. Desktop/mobile checks cover
selection/preview, invalid files, retry bytes, cancel reset, remove/undo, save
and visible non-overflowing controls. Screenshots are in the ignored
node_modules/.cache/watchflow-cover-browser directory.

## Cover-dialog UX change inventory (2026-11-03)

```text
E:\watchflow\app\(app)\actions\lists.ts
E:\watchflow\app\(app)\lists\[listId]\page.tsx
E:\watchflow\components\lists\create-list-dialog.tsx
E:\watchflow\components\lists\edit-list-dialog.tsx
E:\watchflow\components\lists\list-form-fields.tsx
E:\watchflow\components\lists\list-details-form.tsx
E:\watchflow\components\lists\list-cover-field.tsx
E:\watchflow\components\lists\list-artwork-dialog.tsx (removed)
E:\watchflow\lib\artwork\paths.ts
E:\watchflow\lib\artwork\images.ts
E:\watchflow\lib\artwork\list-cover-ui.test.ts
E:\watchflow\lib\artwork\migration-ui.test.ts
E:\watchflow\lib\lists\actions.test.ts
E:\watchflow\scripts\fixtures\list-cover-dialogs.test.mjs
E:\watchflow\docs\PROJECT_CONTEXT.md
E:\watchflow\docs\PRIVATE_ARTWORK_ACCEPTANCE.md
```

Nine actual PostgreSQL authorization cases are prepared in
`scripts/fixtures/private-artwork-correction.test.mjs`: owner/list success,
foreign list, wrong owner segment, missing list, title-shadowing regression,
malformed paths, avatar compatibility, actual PostgreSQL-deparsed expressions
and real RLS insert/update/read/delete restrictions. That suite is local-only,
does not install migrations, and requires an explicitly enabled local test DB
with the correction already installed. It was disabled during Codex's run; no
runtime PostgreSQL authorization pass is claimed. Future runtime acceptance
must not use the controlled live calendar fixture or Production.

## Change inventory

```text
E:\watchflow\app\(app)\actions\artwork.ts
E:\watchflow\app\(app)\layout.tsx
E:\watchflow\app\(app)\lists\[listId]\page.tsx
E:\watchflow\app\(app)\settings\actions.ts
E:\watchflow\app\(app)\settings\profile\page.tsx
E:\watchflow\app\api\artwork\[...path]\route.ts
E:\watchflow\components\app-shell.tsx
E:\watchflow\components\artwork\artwork-editor.tsx
E:\watchflow\components\artwork\artwork-image.tsx
E:\watchflow\components\artwork\user-avatar.tsx
E:\watchflow\components\lists\list-artwork-dialog.tsx (removed in cover-dialog UX)
E:\watchflow\components\lists\list-artwork.tsx
E:\watchflow\components\lists\list-card.tsx
E:\watchflow\components\mobile-app-navigation.tsx
E:\watchflow\docs\PRIVATE_ARTWORK_ACCEPTANCE.md
E:\watchflow\docs\PROJECT_CONTEXT.md
E:\watchflow\lib\artwork\images.test.ts
E:\watchflow\lib\artwork\images.ts
E:\watchflow\lib\artwork\list-reads.test.ts
E:\watchflow\lib\artwork\migration-ui.test.ts
E:\watchflow\lib\artwork\paths.test.ts
E:\watchflow\lib\artwork\paths.ts
E:\watchflow\lib\artwork\route-actions.test.ts
E:\watchflow\lib\artwork\server.test.ts
E:\watchflow\lib\artwork\server.ts
E:\watchflow\lib\lists\supabase-lists.ts
E:\watchflow\lib\lists\types.ts
E:\watchflow\lib\lists\ui.test.ts
E:\watchflow\lib\settings\actions.test.ts
E:\watchflow\package-lock.json
E:\watchflow\package.json
E:\watchflow\scripts\apply-dev-private-artwork-migration.mjs
E:\watchflow\scripts\apply-dev-list-artwork-policy-fix.mjs
E:\watchflow\scripts\fixtures\private-artwork-migration.test.mjs
E:\watchflow\scripts\fixtures\private-artwork-correction.test.mjs
E:\watchflow\scripts\fixtures\apply-dev-list-artwork-policy-fix.test.mjs
E:\watchflow\supabase\migrations\202611020001_private_profile_and_list_artwork.sql
E:\watchflow\supabase\migrations\202611020002_fix_private_list_artwork_policies.sql
```
