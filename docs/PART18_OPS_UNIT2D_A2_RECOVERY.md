# Part 18 Unit 2D A2 read-only recovery

Human-reported live completion: `SCRIPT_A2_RECOVERED_PASS`, application_safe=true,
replacement_attempted=false, pause_attempted=false. Retained-query counters were
zero and paginationComplete=true. Incident-window transport count remains
UNKNOWN. The next sync re-enable checkpoint is prepared separately in
`PART18_OPS_UNIT2D_SYNC_REENABLE.md`; it has not been executed here. The following
sections retain the original preparation contract and evidence.

Preparation status: the explicit recovery path is implemented and tested offline.
The operator-confirmed empty `events` envelope is supported. Execution requires
separate human approval. Never run normal A2 again for the already-replaced
schedule.

The operator reported that calendar schedule replacement and pause both occurred.
The reported acceptance cron is `4-59/5 * * * *`, with the exact development
destination and a paused calendar schedule. The original final-result failure was
`LOGS_QSTASH_LOG_PAGE_INVALID`. The operator subsequently confirmed a JSON object
containing only `events: []`, without a `logs` field, body cursor, or pagination
response header. This array-name mismatch caused the old parser failure. A
PowerShell `@($page.logs).Count` result from a null property is not a log count.
An explicit empty `events` array is valid; an object lacking both supported
array properties remains invalid.

## Explicit recovery boundary

After human approval, the prepared read-only command is:

```powershell
node scripts/part18-ops-unit2d-script-a2.mjs --postcheck-only
```

This branch never calls normal A2, prompts for replacement approval, signs in a
Supabase user, replaces/pauses/resumes QStash, writes application data, invokes
an executor/workflow, or changes a GitHub variable. The development admin client
permits only GET/HEAD requests to the pinned Supabase origin. Its owner identity
is read through the exact connection and Auth admin GET, matched to QA User A.
The existing credential-read RPC is read-only. Google access refresh uses the
approved path in memory, rejects replacement refresh tokens, and persists nothing.
The only Calendar operation is an exact-ID GET in `primary`, requiring 404.

Required local secrets remain in the operator environment; never paste them into
chat or put them in command arguments. The local Google callback stays exactly
`http://localhost:3000/api/calendar/google/callback`. The QStash destination stays
exactly `https://watchflow-dev-ops.vercel.app/api/internal/calendar/sync`.

## Assertions

- Exact repository, branch, development URL/project ref `ckwadpmvxieekjlsfcks`,
  and both existing local project markers must match.
- Connection `e652e5c8-f08c-4736-88d8-073bce772ccc` must belong to QA User A,
  use Google/primary, remain connected with sync disabled, and have a nonempty
  provider subject.
- Job `b9eb8a77-0723-675b-3f2b-8503a0781ab8` must remain pending, attempt zero,
  unleased (token and expiry null), and upsert, with source key
  `589038a338f409210b819e6a7e0e871c` and source version
  `8ca7b4e9cabaac13bdda45d0089f3169`. No other connection job, exact mapping,
  actionable cleanup work, or unrelated actionable job may exist.
- Calendar schedule `watchflow-dev-part18-ops-unit2d-calendar` must already
  have acceptance cron, exact development destination, GET, retries zero,
  timeout 55000, the exact three labels, and paused=true. Its redacted
  authorization must match the scheduler-secret-derived hash; only the
  optional Content-Type header is permitted in addition.
- Reminder schedule `watchflow-dev-part18-ops-unit2d-reminders` must remain
  paused at the pinned reminder destination. Both development GitHub scheduler
  gates must remain false.
- Credential read/decrypt/refresh must succeed without rotation. Exact event
  `a2ab6758f9fedbb0344d416ac00f2ca7d` must return 404 from primary. No listing,
  create, update, or delete is performed.
- After logs inspection, repeat independent fixture, credential, exact-event,
  schedule, reminder, and GitHub assertions. The full controlled job, subject,
  and encrypted credential fingerprint must remain unchanged during recovery.

## Log scope and result

Original replacement-to-pause UTC bounds are unavailable. The default recovery
command inspects retained history for the exact schedule, explicitly reporting
`scope=retained_schedule_history incident_window_known=false`. It does not
fabricate an incident window or claim retained history is complete historical
evidence beyond API retention. Output also explicitly includes
`incident_window_transport_count=UNKNOWN retention_scope_only=true`. Zero returned
events means only that the current query returned no retained events. It is not
evidence of zero deliveries during replacement-to-pause. Even operator-supplied
bounds cannot establish historical completeness beyond retention, so the
incident transport count remains UNKNOWN.

If reliable bounds later become available, both may be provided as exact epoch
milliseconds using `--logs-from-ms=... --logs-to-ms=...` after `--postcheck-only`.
They must be ordered, nonnegative, and no later than the current time. Without
reliable bounds, omit both.

Only safe counters are reported: matchingRows, deliveryAttemptRows,
successfulDeliveryRows, paginationComplete. The existing `logs` envelope remains
supported with its strict row schema. The newly confirmed `events` envelope is
accepted only with an empty array: no nonempty event row shape was available,
so such a response fails closed with `QSTASH_EVENTS_ROW_SHAPE_UNVERIFIED`.
Both array names together or unknown `events` envelope properties are rejected.
An absent/empty cursor terminates the current query; a valid nonempty body cursor
is followed with loop and page-limit checks. The observed empty events response
without a cursor is a valid terminal query page. Unknown/malformed pages, missing
both array properties, invalid rows/cursors, cursor loops, and pagination limits
fail closed. `paginationComplete` concerns only the current retained query,
never historical incident-window coverage.
Headers, message contents, response bodies, tokens, and provider subjects are
never printed. A parser failure still runs independent final safety rechecks.

Transport/log rows alone do not fail application safety. Attempts/leases,
mappings, event presence, sync state, and other isolation guards determine that
result. Recovered success additionally requires complete validated pagination.
An exact-event GET proves absence at observation time; it cannot establish that
no other actor ever created and deleted an event between observations.

Normal A2 retains its holding-cron precondition and typed mutation approval.
Recovery never automatically pauses or repairs a mismatch. Any failed guard
requires stopping for human review.

## Evidence from preparation

The authorized standalone read-only audit verified sync disabled, the expected
controlled job, no mapping/unrelated actionable work/actionable cleanup, and exact
Google event 404. The job and connection were rechecked after that GET. This
Codex shell has neither QSTASH_TOKEN_EU nor GH_TOKEN, so it could not independently
verify live schedules, gates, or logs. The calendar acceptance/pause observation
is operator-provided. No live recovery command or normal A2 was run here.

The focused offline suite now includes the exact operator-confirmed
`scripts/fixtures/part18-ops-unit2d-qstash-empty-events.json` through the production
parser, query-pagination helper, and recovery path. Twenty tests passed, including
zero retained events with UNKNOWN incident count, ambiguous/nonempty alternate
envelopes, cursor loops, and independent safety failures. No live recovery or
normal A2 was run to validate this patch.

Script syntax, repository ESLint, TypeScript, git diff whitespace checking, and
whitespace checks of the new files passed. The production build was attempted
and failed fetching Geist from Google Fonts. No live operation was run during
the completed parser patch.
