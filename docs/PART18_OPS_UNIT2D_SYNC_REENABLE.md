# Unit 2D QA User A sync re-enable checkpoint

Prepared only. Do not execute the live re-enable until separately approved.
The operator confirmed `SCRIPT_A2_RECOVERED_PASS`, application_safe=true, and
both mutation-attempt flags false for recovery. The calendar schedule is now
on acceptance cron and paused. Never run normal A2 again.

## Commands and approval

The dedicated script requires exactly one explicit mode. No arguments abort.

```powershell
node scripts/part18-ops-unit2d-sync-reenable.mjs --precheck-only
```

This optional mode checks application data read-only and never requests approval
or arms the application-data write. It authenticates as QA User A, which creates
an Auth session and may update normal Auth sign-in metadata. The session is held
only in memory; no local snapshot/session file is written.

After separate human approval, the mutation mode is:

```powershell
node scripts/part18-ops-unit2d-sync-reenable.mjs --reenable
```

Its exact typed phrase is:

```text
APPROVE_QA_USER_A_CALENDAR_SYNC_REENABLE
```

Any other answer, including extra spaces, aborts. All starting-state checks
repeat after the prompt. Neither command has been run live during preparation.

## Single application-data change

The only permitted application-data write is QA User A's authenticated
`watchflow_set_calendar_sync_enabled({p_enabled:true})`. The RPC derives the
owner from `auth.uid()`, preserves the connection ID, and changes sync_enabled
and the ordinary updated_at timestamp. It does not enqueue, claim, or finalize
jobs. It does not write credentials, subjects, mappings, or calendar events.

The QA client's transport permits only password sign-in, verified Auth user
reads, and one correctly armed RPC request with exactly that payload. Direct
connection updates, false payloads, claim RPCs, other RPCs, and requests to
other origins are rejected. The service-role key is used only by the existing
read-only encrypted-credential RPC, never for the sync-enable write.

## Targets and prerequisites

- Repository `E:\watchflow`, branch `codex/part-18-production-operations`, exact
  Supabase URL/ref `ckwadpmvxieekjlsfcks`, development environment, and both
  existing local link markers must match. No link or configuration is changed.
- Direct PostgreSQL reads use the existing pinned development session pooler
  at port 5432, database postgres, project-qualified username, and strict TLS
  hostname/certificate verification. SUPABASE_DB_PASSWORD remains in memory;
  it is never put in a URL or command argument. An existing trusted CA file
  may be supplied through SUPABASE_DB_CA_CERT_PATH. No Management API is used.
- Use the existing local environment files and operator-shell secrets. The
  script requires QA credentials/public key, service-role credential-read key,
  DB password, QSTASH_TOKEN_EU, GH_TOKEN, WATCHFLOW_SCHEDULER_SECRET, and the
  existing Google client/encryption configuration. Never paste their values.
  The Google callback remains the exact localhost:3000 callback.
- Live PostgreSQL fixture identity must match the freshly verified QA user ID
  and QA email, with exactly one owner Google connection. Host/link metadata
  alone is insufficient.

## Precheck and boundary assertions

- Connection `e652e5c8-f08c-4736-88d8-073bce772ccc` is Google/primary, connected,
  sync_enabled=false, with a nonempty provider subject and exactly one credential.
- Job `b9eb8a77-0723-675b-3f2b-8503a0781ab8` is the exact owner/connection/movie
  upsert, pending, attempt_count=0, lease_token=null, lease_expires_at=null,
  source_key=`589038a338f409210b819e6a7e0e871c`, and
  source_version=`8ca7b4e9cabaac13bdda45d0089f3169`.
- No connection mapping, additional connection job, unrelated actionable job,
  or actionable connection_cleanup work exists. Full job and global job-ID
  inventory fingerprints must remain unchanged.
- Calendar QStash `watchflow-dev-part18-ops-unit2d-calendar` is already paused
  on `4-59/5 * * * *`, exact development calendar executor destination, GET,
  retries=0, timeout=55000, exact three labels, and valid redacted authorization
  hash evidence (only optional Content-Type in addition).
- Reminder QStash `watchflow-dev-part18-ops-unit2d-reminders` is paused at its
  pinned development destination. Both development GitHub scheduler gates are
  false. All four independent hold reads are attempted.
- Approved credential read/decrypt/refresh succeeds without replacement refresh
  token or persistence. Only exact event GET in primary is allowed, requiring
  404 for `a2ab6758f9fedbb0344d416ac00f2ca7d`. No list/create/update/delete occurs.
- Read-only SELECTs verify exact live owner-RPC and claim/helper definitions,
  signatures, security modes, empty search paths, RPC execution boundaries,
  and the connection's sole timestamp trigger. Source bodies are pinned to
  reviewed repository definitions and normalized only for CRLF and edge space.
  Function bodies, subjects, credentials, hashes, and private movie data are
  never printed.

## Claimability without claiming

Each database snapshot is obtained in a repeatable-read READ ONLY transaction
and rolled back. The actual claim RPC is never called. SELECT reproduces the
deployed claim selection predicate and checks the upsert's current source
version against the owner movie's scheduled instant, timezone, movie title,
and runtime fallback. It also verifies the deterministic provider event ID.

The job must already be due and below its attempt limit before enablement.
Its source must still match and its encrypted credential must exist. Before
enablement, selection_eligible must be false solely because sync is disabled.
After enablement, selection_eligible and source_matches must be true while the
job remains pending, attempt zero, and unleased. No locks, leases, attempt
increments, or job writes are used to demonstrate this.

Eligibility is an observation, not a lock reservation. Sync=true means a
separately authorized executor could claim the job. Both schedules must remain
paused, both GitHub gates false, and no actor may invoke the executor or
workflow_dispatch during this checkpoint. Paused schedules are not proof that
all historical HTTP transports were impossible; no zero-transport claim is made.

## Postchecks and failure policy

After the one RPC attempt, even if its response is lost, independently inspect
database/fixture preservation, Google event absence, and every external hold.
Then repeat the database and hold reads. Preserve the complete controlled job,
credential row, subject, connection metadata except sync_enabled/updated_at,
global job inventory, and live contracts. Require connected/sync=true and all
isolation and hold assertions.

Output contains sanitized state booleans, allowlisted connection/job statuses,
attempt count, lease absence, source-match result, claim-selection eligibility,
hold status, and fixed failure codes. A failed read is reported as unknown.
Raw exceptions, tokens, provider response bodies, and connection strings are
never printed. Unknown/error responses cannot count as success.

There is no automatic retry, sync rollback, scheduler repair/resume, executor
call, OAuth action, GitHub write, migration, or Production access. If the RPC
committed but a postcheck fails, sync may remain true; report the observed state
and stop for human review. Do not rerun this command blindly: its starting-state
guard requires sync=false. Successful output is `SYNC_REENABLE_PASS` and leaves
both schedules paused. Scheduler activation needs a separate approved checkpoint.

## Local validation

Seventeen new offline tests passed, including the real QA-client RPC request
shape, read-only PostgreSQL query transport, source/security pins, exact approval,
changed holds, lost responses, credential/subject/job preservation, strict Google
refresh/event checks, and sanitized reporting. Together with the unchanged A2
recovery tests, 37 tests passed. Script syntax, repository ESLint, TypeScript,
and tracked/new-file whitespace checks passed. The production build failed
fetching Geist from Google Fonts. No live precheck or re-enable was executed.
