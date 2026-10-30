# Part 18J QA User A same-subject Google reauthorization

Prepared only. The human operator reported that the Part 18J migration and
nine guarded integration tests passed on watchflow-dev. This checkpoint has
not been run live during preparation. Reauthorization requires separate human
approval after a fresh passing precheck.

## Fixed target and prerequisites

Use `E:\watchflow` on `codex/part-18-production-operations`, with the existing
Supabase link to `ckwadpmvxieekjlsfcks`. The operator uses the installed `pg`
client and the existing passwordless session-pooler marker, with the database
password supplied only in memory from `SUPABASE_DB_PASSWORD`. TLS certificate
and hostname verification are mandatory; `SUPABASE_DB_CA_CERT_PATH` can point
to the trusted Supabase CA certificate when needed. The Management API and
migration CLI are not used by this checkpoint.

The operator loads the existing ignored local environment without overwriting
explicit shell variables. Required configuration includes the pinned QA
development target and QA User A email, Supabase service credential for the
existing read-only credential RPC, Google OAuth client configuration, calendar
encryption key/version, QStash EU token, scheduler secret, and GitHub token.
Do not print values or edit environment files as part of this procedure.

The Google callback must be exactly
`http://localhost:3000/api/calendar/google/callback`. The existing localhost
WatchFlow server must run the reviewed repository source with that same
watchflow-dev environment. Before OAuth, the human must verify the server's
launch environment and browser QA User A session. The checkpoint does not
authenticate or automate a browser.

## 1. Read-only pre-reauthorization checkpoint

After separate approval to run this checkpoint:

```powershell
node scripts/part18j-google-reauth-checkpoint.mjs --pre
```

The script verifies the applied migration, exact deployed function signature,
service-only execution, empty search path, and exact function body from the
pinned Part 18J migration. It also verifies the two connection/credential
triggers perform only their existing timestamp updates. The connected branch
therefore rejects null/empty or different subjects before updates, preserves
the same ID/status/sync flag, and touches only legitimate connection metadata
and the encrypted credential. Cleanup reconciliation remains confined to the
existing disconnect-pending branch, which this fixture cannot enter.

The checkpoint requires the exact connected Google connection with sync off,
one valid encrypted credential, the exact pending/unattempted/unleased upsert,
no mappings for this connection, no additional jobs for this connection, no
unrelated actionable calendar work, and no actionable cleanup anywhere. It
checks the calendar schedule remains paused on its holding cron, with its
pinned destination/method/retries/timeout/labels and valid redacted forwarded
authorization. The reminder must remain paused at its pinned destination, and
both GitHub scheduler variables must remain `false`.

It uses `readGoogleCalendarCredential`, `decryptCalendarRefreshToken`, and
`refreshGoogleCalendarAccessToken`. Refresh and access tokens stay in memory;
a replacement refresh token fails closed. Exactly two precheck outcomes are
accepted:

- Successful refresh followed by the exact primary-calendar event GET for
  `a2ab6758f9fedbb0344d416ac00f2ca7d`, which must return 404.
- The already-confirmed refresh failure `invalid_grant`, classified as
  `EXPECTED_STALE_GOOGLE_GRANT`. This is the reason for reauthorization, so
  the precheck accepts it and does not request the Calendar event.

Every other refresh, decryption, credential, or event-check failure still
fails closed. Database state and scheduler holds are re-read after either
accepted outcome. The stale-grant exception changes no target, deployed
contract, fixture, fingerprint, isolation, scheduler, or approval guard.
Pre-reauth event absence is not asserted when the expired grant prevents that
GET. This exception is authorized only before reauthorization, with sync off,
both schedules paused, both GitHub gates false, no mapping, and no executor
invocation in the pinned OAuth flow.

On success only, the script writes an exclusively created, signed local
baseline in the ignored `supabase/.temp/part18j-google-reauth-baseline.json`
and prints `PRE_REAUTH_PASS` (or
`PRE_REAUTH_PASS google_credential=EXPECTED_STALE_GOOGLE_GRANT` for the expired
grant). The signed baseline also records the accepted Google-check outcome,
so that the exception cannot be confused with verified event absence. It
stores keyed subject identity and
safe connection/credential/job/function/hold fingerprints, plus a global job-ID
inventory hash. It contains no raw subject, email, encrypted credential
material, token, database password, or encryption key. The full job hash
includes timestamps and all fields, so preservation is stricter than just
checking attempts and lease.

Existing checkpoint files are never overwritten. Preserve them for review;
do not delete or recreate a baseline after reauthorization to make a postcheck
pass. Signed records are bound to this development target and encryption key.

## 2. Typed approval, then manual WatchFlow OAuth

Only after `PRE_REAUTH_PASS` and human approval to reauthorize:

```powershell
node scripts/part18j-google-reauth-checkpoint.mjs --approve-manual-reauth
```

The mode compares fresh state against the unchanged baseline, then requires
this exact typed phrase in an interactive terminal:

```text
APPROVE_QA_USER_A_SAME_SUBJECT_GOOGLE_REAUTH
```

Any other input aborts. After confirmation it repeats the database, baseline,
configuration, scheduler, and isolation assertions. This mode makes no Google
requests: it does not refresh the old credential or repeat the event GET, so
it cannot recreate the expired-grant circular gate. It writes only a signed
local approval record and prints the manual localhost URL. It does not open a
browser or request either OAuth route. Approval must be recorded within 30 minutes of
the baseline; postcheck requires a baseline no older than 60 minutes and an
approval no older than 30 minutes.

The human then performs this sequence:

1. Open `http://localhost:3000/settings/calendar` in the verified QA User A
   browser session. Inspect the existing Google account displayed there.
2. Leave **Enable calendar sync** and **Disconnect** untouched. Choose
   **Reconnect account**, which follows the normal owner-bound
   `/api/calendar/google/start` route.
3. Select the exact same Google account shown on the existing connection.
   Cancel if uncertain. A different Google subject must fail closed; it must
   never be accepted as a replacement account for this controlled connection.
4. Complete Google's normal consent flow and return to localhost. Confirm
   status remains connected and sync remains paused. Do not toggle sync.
5. Run the postcheck immediately. A success message in the UI alone does not
   establish preservation of the controlled state.

Normal OAuth creates a private OAuth-state row and binding/PKCE cookie; the
callback consumes that state once and clears the cookie. Successful same-
subject callback may update display email, granted scopes, connected/updated
timestamps, cleared error metadata, and the existing encrypted credential
row. Its credential timestamp can change. These are the expected application
mutations, and the human browser performs them through the normal flow.

## 3. Separate read-only postcheck and fresh-token verification

After the manually approved OAuth flow:

```powershell
node scripts/part18j-google-reauth-checkpoint.mjs --post
```

The script requires the signed baseline and matching signed approval. It
checks the same provider subject by keyed comparison of its exact bytes, same
connection ID, connected status, disabled sync, and exactly one credential.
Both the encrypted envelope fingerprint and full credential-row fingerprint
must change; the credential's identity/creation metadata must remain stable.
All connection fields outside permitted reconnection metadata, every field of
the controlled job, the global job-ID inventory, deployed function, schedule
holds, and OAuth configuration must match the baseline. No connection mapping
may appear, and no new connection job or actionable unrelated/cleanup work
may exist. Both GitHub gates must still be false.

Only after those assertions does the postcheck read/decrypt the new stored
credential in memory and exercise the approved refresh helper. It never
persists or rotates tokens. Refresh must succeed: `invalid_grant` is rejected
in `--post`, including when the signed baseline records an expected stale
grant. A replacement refresh token or any refresh failure stops with a fixed
safe classification. It then makes only the same exact
primary-calendar event GET, requires 404, and repeats the full state checks to
prove the verification did not change the credential or controlled state.
It writes no checkpoint files or remote data and prints `POST_REAUTH_PASS`
only after all guards pass.

The evidence combines the pinned OAuth code's lack of Calendar mutation calls,
the deployed connected-branch contract, unchanged jobs/attempts/leases/mappings,
and the exact event's absence after the flow (also before it when the old grant
could refresh). A stale-grant baseline never claims a successful pre-event
GET. GET-only checks do not
provide a historical audit of transient actions by other actors or unrelated
Google events; no listing or broader provider access is attempted.

On any stop, preserve the sanitized code and local records. Keep sync off,
both schedules paused, and both GitHub gates false. The checkpoint has no
database-write, scheduler-mutation, executor, workflow-dispatch, browser-
automation, migration-application, or A1/A2 execution path. Production is
rejected by the exact target pins. Any later A2 work requires separate review.
