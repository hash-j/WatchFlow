# Unit 2D isolated QStash log canary

The human completed the canary and verified its deletion and application-data
isolation. Do not run it again or delete/overwrite the saved evidence. Both real
schedules must remain paused. Retained live history now supplies the previously
lost HTTP status through an exact reviewed supplement. Decoder readiness does
not authorize a first real execution here. Normal A2 is complete.

## 2026-10-30 offline evidence review

The existing ignored evidence file contains three events for one anonymous
message: CREATED, ACTIVE and DELIVERED. The former decoder rejected additional
observed metadata before counting IDs, explaining its zero count. Shared decoding
now establishes one message, pinned schedule/destination/GET provenance and an
ACTIVE delivery attempt. Header contents are never provenance.

The old sanitizer replaced responseStatus (and duration) with 0. The original
review correctly failed because no actual HTTP success status survived in this
capture. The human subsequently recovered the same retained three-row lifecycle,
with DELIVERED responseStatus=200. This fact is recorded separately in
`scripts/fixtures/part18-ops-unit2d-canary-reviewed-status.json`.

The supplement is pinned to the exact immutable original SHA-256, canary ID,
DELIVERED state, status 200 and a fingerprint of the sole captured anonymous
message alias plus schedule/destination/timeline. The raw live ID was not retained;
the supplement relies on the human's retained-history correlation review. It
cannot be supplied through CLI/env or applied to another record/message/status.
Unknown fields and altered bindings fail closed. The original and derived fixture
retain their zero placeholder; only a normalized in-memory review row receives
the reviewed status. No original bytes are rewritten.

The only authorized execution in this review is strictly local:

```powershell
node scripts/part18-ops-unit2d-log-canary.mjs --review-evidence
```

Expected result: CANARY_EVIDENCE_REVIEW_PASS, unique_message_count=1,
automatic_schedule_provenance=true, delivery_attempt_verified=true,
successful_delivery_verified=true and real_first_run_decoder_ready=true.
Without the supplement, the original still fails EVIDENCE_RESPONSE_STATUS_REDACTED.
This mode returns before environment
loading, network, timers, prompts, cleanup or file writes. The first-run operator
uses the same evidence gate before any live operation. Future sanitizer code
preserves safe numeric HTTP status values; it does not rewrite this capture.

The preparation procedure below is historical and does not authorize another run.

The human subsequently ran the real calendar occurrence. Its separate --recover
path now uses required provenance fields rather than an exact row key count.
Additional opaque metadata is ignored without printing or trusting it; required
field types, exact schedule/destination/GET/labels, correlation and 2xx remain
strict. Canary-specific no-forwarded-auth/body/callback/retry checks remain.
Do not rerun the canary or alter its original evidence/review supplement.

## Verified harmless destination

The pinned destination is:

```text
https://watchflow-dev-ops.vercel.app/icons/watchflow-icon.svg
```

This path comes from the actual `public/icons/watchflow-icon.svg` file. It is a
passive SVG with rect/path graphics, no script, external resource, action, or
calendar/notification code. `proxy.ts` excludes `/icons/` from Supabase session
middleware. The reviewed Next.js configuration contains security headers without
an asset rewrite; the development Vercel configuration is also pinned.

During preparation, exactly one ordinary unauthenticated GET was performed:
200, image/svg+xml, no Set-Cookie, and normalized bytes identical to the local
asset. Its public normalized SHA-256 is
`0a992986fdfe218c7d568de85d5d9028a7e8b1ca064d06f3fff8787909ef954d`.
No QStash request or scheduled canary execution was made during preparation.
An ordinary CDN access log may be recorded; no page/client analytics or
application handler is involved. Future operator runs reverify this asset and
source pins; a redirect, auth page, cookie, changed asset, or different MIME fails.

## Commands and typed boundary

```powershell
node scripts/part18-ops-unit2d-log-canary.mjs --precheck-only
node scripts/part18-ops-unit2d-log-canary.mjs --canary
```

Neither command was run here. No arguments/unknown modes abort. Precheck makes
read-only isolation/Google/asset checks and requires the canary ID absent. It
does not create a schedule, write evidence, or prompt for approval. The real
canary mode requires exactly:

```text
APPROVE_QSTASH_LOG_CANARY
```

An incorrect answer causes zero mutation. After approval, all application/hold
checks and the public asset GET repeat, and canary absence is reread immediately
before creation. An existing canary is never replaced, resumed, or deleted.
Reserve this ID for one operator at a time; creation supports an explicit ID
but does not provide a transactional absent-then-create lock against another
concurrent operator.

## Complete canary isolation

Schedule ID: `watchflow-dev-part18-ops-unit2d-log-canary`.
Labels exactly: watchflow-dev, part18-ops-unit2d, log-canary.
Only the EU QStash API is used. Destination is the exact verified static URL;
method GET; retries=0; timeout=10000. No request body, forwarded Authorization,
scheduler secret, application credential, callback, failure callback, URL group,
or named queue is configured. Optional provider-generated Content-Type is
permitted. QStash API Authorization authenticates management requests only; it
is never configured as a forwarded message header. Normal provider signature
headers are not application credentials and their values are never displayed.

The only mutations are create/pause/resume/delete of that pinned canary. Its
transport cannot select a real schedule ID or a different destination. No direct
publish endpoint, application HTTP endpoint, workflow_dispatch, executor,
claim/finalize RPC, table write, OAuth reauthorization, GitHub variable write,
real schedule action, Google Calendar mutation, or Production operation exists
in this flow. Application/Google secrets remain confined to the existing
read-only fixture/credential verification paths and never enter canary headers.

## Starting and final application assertions

Existing target guards pin E:\watchflow, codex/part-18-production-operations,
ckwadpmvxieekjlsfcks, exact dev URL/environment/link markers, and localhost
Google callback. PostgreSQL uses the existing pinned development pooler, secure
TLS, in-memory password, and READ ONLY transactions. The QA owner is read through
the exact connection and checked against the live QA identity. No Auth sign-in
is performed. No dependency, environment, or database change is needed.

Reuse the reviewed first-run pending fixture assertions: connected/sync=true,
one credential, exact job pending/attempt zero/null lease/upsert/source key and
version/current source/claimable, no mapping or unrelated actionable/cleanup
work. Complete calendar job/mapping inventories, connection, credential and
source state are fingerprinted in memory and compared with the baseline.
Sync remains true; it is never toggled by the canary.

Both real schedules must remain paused on their exact configurations, including
the calendar's acceptance cron/redacted authorization guard, and both GitHub
gates must remain false. The real schedule helpers perform GETs only. The
existing credential read/decrypt/refresh path rejects rotation and persists
nothing. The exact primary event GET must be 404 before and after the canary.
Those observations prove the pinned event remains absent; no event listing or
provider mutation is attempted. During observation, database/hold checks repeat
at bounded intervals; full Google/isolation checks repeat at cleanup. Any change
deletes only the canary and fails; no application state is repaired or reset.

## One annual occurrence and cleanup

The [schedule API](https://upstash.com/docs/qstash/api-reference/schedules/create-a-schedule)
supports an explicit schedule ID and cron. The planner chooses a minute at least
five minutes ahead and encodes exact UTC minute/hour/day/month with weekday `*`.
This yields one near-future annual occurrence, rather than a repeating
every-minute canary. The next matching occurrence is a year later (or the next
valid leap year), outside the observation window.

Creation can initially make a schedule active. Its first selected occurrence is
still several minutes away; immediately pause and GET-verify its exact settings.
Repeat all mutable isolation checks, wait while paused, then repeat them again
before resuming. Resume must be 180..65 seconds before the selected occurrence.
This allows the documented initial schedule-loading interval of up to 60 seconds.
Cron is [UTC by default](https://upstash.com/docs/qstash/features/schedules).
No configuration replacement is performed.

Pause the canary immediately on the first nonempty event page, before analyzing
unknown row values. Keep observing the already-created message only if its core
provenance can be validated. A watchdog imposes cutoff at occurrence +90 seconds
and deletes the canary on timeout, interruption, or failure. Finally always
deletes after any create attempt and requires GET 404; a lost DELETE response is
still checked by GET and reported unconfirmed without blindly retrying.
Cleanup waits for any in-flight create/resume and prevents any later activation,
avoiding a late successful request recreating a schedule after cleanup.

The one occurrence and one correlated message are acceptance assertions;
retries=0 does not constitute an absolute transport-level exactly-once guarantee.
Unexpected additional IDs/attempt evidence fails. Keep the local operator awake,
running and network-connected: abrupt termination or unavailable management API
can prevent cleanup verification. Never interpret an unverified DELETE as a
confirmed disabled schedule. Annual timing still prevents a second near-term
cron occurrence; it is not a substitute for verified cleanup.

## Actual nonempty capture and subsequent parser review

The logs GET is scoped to the exact canary ID and creation-to-current time.
`events: []` is a retained query result, not provenance or proof of zero HTTP
transport. Record actual top-level property names/types, row-array name/count,
first-row property names/types, body-cursor presence, and pagination-header
presence. Sensitive property names are omitted/count-reported; nested headers
and body/response values are never printed or traversed for display.

Only after observing a nonempty row does the program check candidate fields
from the public schema: scheduleId, url, method, messageId, state, time and
optional retries/timeout/labels. Exact canary ID + static destination + GET +
cron-window time + one correlated message establish candidate schedule origin
under the operator's schedule-only control path. DELIVERED is required for the
canary success result. The private message ID stays in memory. Repeated retained
rows are deduplicated; distinct ACTIVE/DELIVERED attempts or another message ID
fail. Missing required fields, missing/ambiguous provenance, wrong destination/time,
credential forwarding, body/callback, error/retry, or inconsistent HTTP status
pauses/deletes and fails closed. Live structure is retained for review; it is
never silently coerced into the documented row schema.

Only the actually verified cursorless/empty-cursor response without pagination
headers is accepted. Any nonempty cursor or pagination header is captured as
structure and fails until explicitly reviewed, without printing cursor values
or claiming complete pagination. A full 100-row page also fails as potentially
truncated, even if its continuation indicator is missing.

After cleanup, observed structure and sanitized rows are written once to the
ignored local file:

```text
supabase/.temp/part18-unit2d-log-canary-evidence.json
```

The file is exclusively created and never overwritten. Headers are replaced
with empty objects; body/response/unknown strings are replaced. Message IDs use
stable anonymous labels; timestamps shift to a fixed fixture epoch while
preserving relative ordering. Public pins and allowed state/configuration
constants remain. Cleanup/isolation outcome and explicit review-required flags
are included. An existing evidence file prevents another run until human review;
preserve it rather than deleting it blindly.

The 2026-10-30 review derives an offline fixture from the existing capture and
shares its exact observed contract with A2 and the first-run reader. Positive
HTTP-status cases are explicitly synthetic. The real automatic executor remains
subject to fresh runtime guards and explicit approval; CANARY_CAPTURE_PASS never
authorizes it.

## Local evidence

The canary, first-run/recovery, A2, sync-enable and shared-decoder suites passed 117 offline
tests. Coverage includes one occurrence, reserved ID, exact approval,
public asset checks, no forwarded credentials, cleanup races, lost responses,
timeouts, unknown structures/pagination, duplicate messages/attempts, redaction,
and application isolation. The human performed the reported live canary run.
This review made no provider request and did not run the canary again.

Syntax, repository ESLint, TypeScript, and tracked/new-file whitespace checks
passed. The production build failed fetching Geist from Google Fonts. This
failure does not change the verified existing static asset or permit a canary
run during preparation.
