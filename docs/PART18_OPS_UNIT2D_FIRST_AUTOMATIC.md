# Unit 2D first automatic calendar execution

The human reports the first real automatic execution completed: job succeeded,
attempt_count=1, lease cleared, mapping present, calendar pause verified and no
unrelated actionable work. Finalization failed QSTASH_EVENT_SHAPE_MISMATCH;
Google fixture validation and automatic provenance still need read-only recovery.
Never run normal A2 or --first-run again. Never resume either real schedule.

## Read-only recovery of the already-completed run

The decoder formerly required an exact per-state key count, rejecting additional
metadata. It now requires typed time/messageId/state/url/scheduleId/method/labels
and DELIVERED responseStatus; actual DELIVERED must be 2xx. Known optional metadata
is checked when present; opaque additional metadata is discarded, never trusted
or printed. Exact provenance, one correlated message and CREATED -> ACTIVE ->
DELIVERED ordering remain mandatory. No actual extra real-calendar key names were
provided; the optional-metadata fixture is explicitly representative/synthetic.

Only this separately approved operator mode may finalize the existing result:

```powershell
node scripts/part18-ops-unit2d-first-automatic.mjs --recover
```

This command was not run from Codex. It returns through a separate path before
the original resume/pause engine. There is no mutation, prompt, watchdog, cleanup
pause or compensating action, including on failure. The CLI explicitly rejects
--first-run with FIRST_EXECUTION_ALREADY_OCCURRED_USE_RECOVERY.

Recovery requires the exact connected/sync=true QA connection, one credential,
the succeeded controlled upsert with one attempt and cleared lease, exact source
identifiers, exactly one primary mapping in repository state synced, matching
completion/sync times and expected deterministic event ID. Existing reviewed
function/security/target checks remain. Both schedules must be paused, calendar
on its exact acceptance configuration, and both GitHub gates false.

Retained QStash GET is pinned to schedule watchflow-dev-part18-ops-unit2d-calendar
and fromDate=2026-10-29T21:58:30.000Z / toDate=2026-10-29T22:00:30.000Z.
Creation must belong to the first 21:59 occurrence; ACTIVE must precede the
22:00:15 pause cutoff and DELIVERED must be within the query window. No row from
the second 22:04 occurrence can pass. Empty/expired history, incomplete pagination,
multiple messages, missing lifecycle states or non-2xx delivery cannot finalize.

Refresh the existing Google credential in memory only, rejecting any replacement
refresh token. Only GET primary/events/a2ab6758f9fedbb0344d416ac00f2ca7d is permitted;
require presence and the repository-built title/times/timezone/source IDs/etag.
No listing or Calendar mutation occurs. Token refresh is not persisted.

There was no durable pre-run inventory snapshot. Recovery does not fabricate one:
it requires complete current inventories, no unrelated actionable/cleanup work,
no unrelated retained job/mapping timestamps since incident start, and unchanged
full application snapshots across its reads. Missing timestamp evidence fails
closed. Output labels isolation_scope=current_inventory_and_retained_timestamps
and historical_baseline_available=false; deleted history cannot be reconstructed.

Only all successful reads produce FIRST_AUTOMATIC_RECOVERED_PASS. Missing proof
leaves all state intact and reports FIRST_AUTOMATIC_RECOVERY_STOP with a safe code.
The original canary evidence and reviewed supplement remain untouched.

## Historical first-run implementation notes (not instructions to rerun)

## Targets and precheck

The shared target guards require repository E:\watchflow, branch
codex/part-18-production-operations, project ckwadpmvxieekjlsfcks, exact dev URL,
development environment, both correct link markers, and the exact localhost
Google callback. PostgreSQL uses the pinned existing session pooler with verified
TLS and SUPABASE_DB_PASSWORD in memory. No Management API or DB URL with password
is used. Every data query is SELECT-only inside a READ ONLY transaction and
rolled back. No claim/finalize RPC or row-lock statement is executed.

Starting assertions pin connection e652e5c8-f08c-4736-88d8-073bce772ccc to
Google/primary, connected, sync=true, one credential; controlled job
b9eb8a77-0723-675b-3f2b-8503a0781ab8 to pending/attempt zero/null token and expiry/
upsert and the exact reviewed source identifiers. It must be due, below its
attempt limit, source-current, and claim-selection eligible. No controlled
mapping, additional connection job, unrelated actionable job, or actionable
cleanup is allowed. The exact primary event GET must be 404 after successful
refresh; stale grants and replacement refresh tokens are rejected.

Calendar schedule watchflow-dev-part18-ops-unit2d-calendar must already be paused,
GET, cron `4-59/5 * * * *`, retries=0, timeout=55000, exact development calendar
destination and labels, with scheduler-secret-derived redacted auth evidence and
only optional Content-Type. Reminder schedule watchflow-dev-part18-ops-unit2d-
reminders must be paused at its pinned destination. Both development GitHub
scheduler gates must be false. All four hold reads are attempted independently.
Live claim/helper/owner-RPC contracts are checked; the exact deployed finalizer
body/signature/security/grants are also pinned to the current migration.

## One cron occurrence and pause safeguard

[QStash cron uses UTC by default](https://upstash.com/docs/qstash/features/schedules).
The exact cron triggers at minutes 4,9,...,59 each hour. The planner selects an
occurrence at least 90 seconds ahead, prepares 75 seconds before it, and aborts
if the repeated prechecks finish less than 10 seconds before it. Resume occurs
only in that controlled pre-occurrence window. No schedule is created/replaced,
and no cron/configuration is changed. The only POSTs are the existing calendar's
[resume](https://upstash.com/docs/qstash/api-reference/schedules/resume-a-schedule)
and pause endpoints.

The next occurrence is exactly 300 seconds later. A separate timer starts before
the resume request, forcing pause at first occurrence +75 seconds, 225 seconds
before the second occurrence. UTC clock agreement with QStash is checked and
wall/monotonic clock drift is guarded. Database and log probes run concurrently;
each calls the same pause promise immediately on relevant activity or error,
without waiting for the other probe. Polls never directly invoke the executor.

The finally path awaits that same memoized pause request and verifies paused=true
even if the POST response was lost. It never retries resume or pause POSTs.
SIGINT/SIGTERM request pause and stop. After pause, only reads continue for a
bounded completion window ending at first occurrence +150 seconds. The active
cutoff timer is cancelled only after pause is verified. Database/GitHub/reminder
or configuration ambiguity stops acceptance. A failed pause GET is explicitly
unverified, never a claimed safe state.

This is a local fail-safe, not a durable provider-side stop time. Keep the
operator running and the machine awake/network-connected. Abrupt termination,
machine sleep, or unavailable QStash can defeat a local timer or prevent pause
verification; these cannot be solved by claiming a guarantee the API does not
provide. Already-published messages may still deliver after pause. The program
does not claim absolute zero HTTP transport or at-most-once delivery.

## Success semantics and isolation

The reviewed claim function increments attempt_count once and grants a lease.
The reviewed finalizer requires the exact live lease/source version, then sets
the job to `succeeded`, clears token and expiry, records completion/provider
status, and inserts or updates the mapping to `sync_state='synced'`. First-run
success requires exactly one attempt, no error, no active lease, successful
provider status, and timestamps within the controlled occurrence window. An
observed lease must keep its token and obey the 120-second lifecycle. Fast
finalization may occur between polls; output distinguishes a directly observed
lease from an unobserved lease. Pinned finalizer semantics supply the latter
case's lease-validation basis, not a fabricated observation.

One exact mapping must bind owner, connection, controlled source key/version,
user movie, primary calendar, and event a2ab6758f9fedbb0344d416ac00f2ca7d. Every
other job's full row and every unrelated mapping must match the baseline,
including cross-user and historical cleanup rows. Source data must remain
unchanged. Inventories are complete and capped at 2,000 rows; larger/ambiguous
inventories fail before resume. Connection ID, subject, sync=true, status and
other stable fields remain unchanged. Normal executor success/error timestamps
and legitimate credential rotation are not direct operator writes.

Post-success Google verification reads the stored credential, decrypts/refreshes
only in memory, rejects replacement refresh tokens, and makes exactly one
primary-calendar event GET requiring 200. The payload is derived with the
repository's pure buildGoogleCalendarEvent helper: deterministic ID, movie title,
scheduled start, runtime-derived end, timezone, and private source key/version
must match. Etag must match the mapping when recorded. The description allows
the repository's relative movie link or exact development-ops movie link;
another origin fails closed. No listing/create/update/delete API is called by
this operator. Those writes may occur only naturally in the scheduled executor.

Even correct job/mapping/event data cannot pass without independently verified
QStash automatic-delivery provenance: one correlated message for this exact
schedule/destination/GET and first occurrence, with successful delivery evidence.
The shared nonempty-row decoder and normalized proof validator are implemented
and tested. The local readiness gate combines the immutable capture with the
exact pinned human-reviewed retained-history supplement. Synthetic fixtures
cannot satisfy this production evidence binding.

## Logs, output, and failures

The current production reader supports the verified `events` envelope and empty
cursorless terminal page. Body cursors are followed with loop/page limits; any
pagination header, unknown envelope, or ambiguous continuation fails closed.
The [documented logs API](https://upstash.com/docs/qstash/api-reference/logs/list-logs)
shows a different `logs` envelope, so it is not silently substituted for this
operator's observed response. A zero retained result is not a count of actual
incident transports. Observed CREATED/ACTIVE/DELIVERED rows are decoded with
strict types and per-state fields. Nonempty pagination and full cursorless pages
remain unverified and fail closed. No values, headers, response
bodies, tokens, credentials, subject, movie data, or message IDs are printed.

On any attempt, final output records sanitized connection/job state, lease
observation, pause verification, provenance status, and safe failure codes.
The database and external holds are reread after the finally pause. Preserve the
job/mapping/provider state even on application failure. No repair, reset, requeue,
manual executor/claim/lease/attempt, workflow_dispatch, GitHub write, reminder
resume, schedule replacement, or Production operation is performed.

No live precheck or first-run command was executed during this preparation.

## Local validation

The operator suites plus shared-decoder/recovery regressions passed 117 offline tests.
Coverage includes exact approval,
post-approval/final boundary failures, cron boundaries, clock drift, interruption,
watchdog cutoff, simultaneous DB/log detection, one shared pause, lost responses,
unknown nonempty events, incomplete pagination, unrelated/cross-user/cleanup
changes, lease lifecycle, terminal mapping/event checks, and final-snapshot
validation. The captured three-row fixture verifies the observed schema and
message count. Supplement regressions verify the retained-history status binding,
reject arbitrary values/correlation changes and preserve the original record.

Syntax, repository ESLint, TypeScript, and tracked/new-file whitespace checks
passed. The production build was attempted and failed fetching Geist from Google
Fonts. No live operator command or external mutation was performed.
