# v1 development reminder diagnosis and approval plan

Prepared 2026-11-04. **READ-ONLY DIAGNOSIS COMPLETE; ACCEPTANCE NOT RUN.**
No scheduler resume, executor invocation with authorization, fixture write,
notification insert, preference/timezone edit, Google request, Production action,
commit, push or deployment is authorized by this document. Human approval and
the remaining preflight checks below are required before execution.

## Current evidence

| Item | Read-only observation |
| --- | --- |
| QStash region | EU, existing signed-in Upstash console |
| Exact schedule | `watchflow-dev-part18-ops-unit2d-reminders` |
| Pause | `isPaused: true`; EU shows Active 0 / Paused 2, including the separate paused calendar schedule |
| Destination | `https://watchflow-dev-ops.vercel.app/api/internal/notifications/scheduled-reminders` |
| Method / cron | GET / `2-57/5 * * * *`, default UTC; minute 2, 7, 12, …, 57 each hour |
| Provider retries / timeout | 0 / 55,000 ms |
| Header boundary | Authorization present and redacted; its secret value was not revealed, copied or compared |
| GitHub reminder gate | Read via `gh api`: `WATCHFLOW_DEV_REMINDER_SCHEDULER_ENABLED` is false; no workflow was dispatched |
| Deployment read | Unauthenticated GET to the reminder route returned 401 and no-store; no privileged claim path ran. Development signup returned 200 and its CSP names the expected development Supabase origin |
| Live example job | Scheduled `2026-11-04T01:53:00Z`, zone UTC, lead 15, due `2026-11-04T01:38:00Z`, state pending, attempts 0 |
| Matching owner preferences | Reminders enabled, lead 15, push enabled; matched to the example job owner without printing its identifier |
| Stored subscription | One subscription total, belonging to that owner; unexpired by stored expiry. Endpoint/auth keys were not printed or persisted |
| Profile timezone | The matching owner's profile is UTC; all 10 visible development profiles are UTC |
| Current reminder inventory | Complete two-row grid: the example pending job above and one old skipped/reminders-disabled job. This is a point-in-time observation, not a future activation guarantee |

All database observations were reads in the existing watchflow-dev console,
identified by its repository-pinned project identity, not the generic main-branch
"PRODUCTION" badge shown within a development Supabase project. No database
record was edited. The original profile view was restored afterward.

The QStash console's formatted last/next time labels can use the browser's
timezone; they are not a substitute for the stored UTC cron/instants. No
credential was extracted from the browser. The process has no QStash API token,
so the existing signed-in console supplied schedule metadata only.

Provider semantics checked against the official
[schedule documentation](https://upstash.com/docs/qstash/features/schedules)
and [pause contract](https://upstash.com/docs/qstash/api-reference/schedules/pause-a-schedule):
cron defaults to UTC; paused schedules ignore cron ticks. Resume was not called.

## Root cause and timezone

The paused trigger is a confirmed automatic-delivery blocker. GitHub's gate is
also false, so that alternate GitHub trigger is disabled. Enabling a user
preference or subscribing a browser does not start either external trigger.

The example also was **not due at inspection**: the clock read
2026-11-03 20:51:34 UTC, which is 4 November 01:51:34 in Asia/Karachi. The stored
reminder is due on 4 November at 01:38 UTC, which is **06:38 in Karachi**, and
the movie instant is 06:53 Karachi. A local 01:53 entered with the form still
set to UTC is not local 01:53 in Karachi. Do not reinterpret or silently change
the existing record to compensate.

Storage and calculation:

- Date/time are local form inputs. `zonedDateTimeToIso` validates the chosen
  IANA zone and converts them to a normalized UTC instant.
- `user_movies.scheduled_for` is timestamptz; `schedule_timezone` preserves the
  selected zone. A separate naive local date/time is not stored as the instant.
- The reminder sync function reads `schedule_reminders_enabled` and
  `reminder_offset_minutes` from the owner's preferences and stores
  `reminder_at = scheduled_for - make_interval(mins => reminder_offset_minutes)`.
- The exact example evaluates to `2026-11-04T01:38:00Z`, as observed in the live
  row and reproduced offline using the current timezone conversion source.
- New forms prefer a valid profile timezone. UTC is valid, so a UTC profile
  prevents the browser-timezone fallback. A profile set to Asia/Karachi would
  default new forms to that zone. Existing movie rows retain their own instant
  and schedule_timezone; profile edits update profiles, not old schedules.
- Offline examples: 4 November 06:53 Asia/Karachi converts to 01:53Z; 4 November
  01:53 Asia/Karachi converts to `2026-11-03T20:53:00Z`. No profile/schedule was
  edited to prove this. Existing timezone, schedule, management, settings and
  reminder contracts passed 75 tests across 10 files.

The five-minute cron means an unaligned 01:38Z due time is normally picked up
at 01:42Z, around 11 minutes before a 01:53Z movie, plus network/processing
delay. Fifteen minutes is the logical eligibility lead, not a promise of an
exact-minute notification with this cron. Do not change the cadence as part of
a blind resume. If exact-minute delivery becomes a release requirement, seek
separate approval for that operational change.

## Delivery architecture and existing safety

Relevant source: reminder route, `lib/notifications/scheduled-reminders.ts`,
`lib/notifications/scheduler-auth.ts`, `scheduler-target.ts`, the Part 18I
migration and its subscription-constraint correction, `lib/push/web-push-adapter.ts`
and `public/sw.js`.

1. QStash makes the authenticated GET to the development Vercel endpoint. The
   endpoint checks the strong scheduler bearer and pinned Supabase target before
   constructing its narrow background client. GitHub is not in this request path.
2. The claim RPC scans eligible jobs globally in bounded batches of 10. Row
   locks/SKIP LOCKED, leases and deterministic identities prevent competing
   cron ticks from creating duplicate logical reminder records.
3. Claims recheck the owner, existing Auth user, scheduled status, exact instant
   and zone, reminder preference, and that the movie is still in the future.
   Past movies are skipped, not backfilled with late notifications. Late ticks
   can still process due reminders for future movies: audit the backlog first.
4. One deterministic in-app notification is inserted with conflict-do-nothing.
   Push-disabled or no-subscription cases can finish in-app-only and return zero
   TypeScript push counters; aggregate zero alone does not prove no in-app work.
5. For enabled push, one deterministic ledger entry per schedule version and
   subscription is claimed. The same HTTP invocation sends Web Push and finalizes
   that lease; no separate worker process, calendar executor or Upstash Workflow
   is required. It does require valid deployed VAPID configuration.
6. Known 429/5xx responses or missing configuration have bounded retries; ordinary
   unknown outcomes are terminal. Expired ambiguous sending leases are failed
   rather than automatically resent. Successfully delivered ledger entries are
   excluded from later sends. Job attempts are bounded at five; subscription
   delivery attempts at three. Invalid 404/410 subscriptions are cleaned up.
7. The worker uses the notification ID as a browser notification tag. Push-service
   acceptance is not proof of actual OS display. This architecture provides
   idempotent database records and bounded delivery, not a universal exactly-once
   guarantee across a network crash. Acceptance must distinguish those results.

GitHub's `WATCHFLOW_DEV_REMINDER_SCHEDULER_ENABLED` gates its scheduled workflow,
not QStash. Leave it false to avoid a second trigger. The checked-in Vercel cron
file contains both reminder and calendar entries; do not deploy/activate it as a
shortcut, and verify no additional deployed trigger can race the controlled test.

## Minimal proposed operational change — not approved to execute

No application code change or schema change is identified. The minimal trigger
change is to resume **only the exact existing reminder QStash schedule** after
all checks and explicit approval. Preserve its destination, method, cron,
retries, timeout, labels and redaction. Do not recreate it or save an editor's
redacted bearer placeholder. Keep calendar paused and GitHub gates unchanged.

The current paused state and correct timing are proven. It is **not yet proven**
that resume is the only missing runtime ingredient. The following remain hard
preconditions immediately before any approved activation:

- Reconfirm development project/deployment identity, exact schedule configuration,
  pause state, independent calendar hold and absence of alternative triggers.
- Confirm the stored forwarded bearer matches the deployed scheduler credential
  without revealing/replacing either. A redacted header and unauthenticated 401
  prove presence/rejection, not that authorized delivery currently succeeds.
- Confirm effective live claim/finalize signatures, permissions, correction,
  ownership checks and triggers through approved read-only metadata inspection;
  do not test a claim RPC as a "read-only preflight" because it writes.
- Confirm deployment VAPID configuration is valid and matches the selected
  browser subscription/application-server key. A stored subscription and UI
  "subscribed" do not establish key-pair match or endpoint deliverability.
- Pin exactly one approved QA identity/browser and verify its current profile,
  preferences and subscription. Verify that account has no Google connection
  so normal scheduling cannot create calendar work; otherwise select another
  approved unconnected QA user. Do not disconnect or edit Google for this test.
- Take two consistent read-only inventories of global actionable reminders and
  in-flight/retry QStash messages. Through the full test window there must be
  no due/eligible unrelated job. Abort on backlog/race; do not disable other
  users' preferences, delete jobs or manually insert notifications to manufacture
  isolation. Record calendar/ineligible-job baselines without mutating them.

The observation above is not an approval to resume, and the old calendar
acceptance/recovery operators must not be reused as reminder activation tools.

## One controlled future acceptance — prepare now, run only after approval

1. After the preflight passes, choose one unconnected QA account and one new,
   disposable owned relationship using an existing shared catalogue movie through
   normal authenticated app actions. Do not reschedule the existing example or
   modify any other existing schedule. Retain exact fixture identifiers in memory
   for observation/cleanup; do not publish user IDs, keys, movie notes or tokens.
2. Use that account's 15-minute reminder and enabled push preferences. If the
   approved account differs and needs settings changed, capture and authorize
   only those QA changes and their eventual restoration. Do not change unrelated
   users. Prefer explicit Asia/Karachi in the new schedule form without changing
   the profile. Existing schedules' instant/zone baselines must remain unchanged.
3. Choose a future UTC cron tick T with at least ten minutes for setup. Schedule
   the fixture at T + 15 minutes, entering the equivalent Asia/Karachi wall time.
   Verify stored instant, selected zone, offset 15, reminder_at T, pending/zero
   attempts, and zero matching reminder notification/delivery rows. Abort if
   setup finishes too late; do not alter the fixture after activation.
4. Recheck isolation and calendar holds at the approval boundary. Explicit human
   approval must cover fixture/setup, temporary resume of the named reminder
   schedule, observation of two automatic ticks, re-pause, and exact fixture-only
   cleanup/restoration. No manual endpoint request or workflow dispatch counts
   as automatic execution evidence. No approval has been given in this task.
5. Resume only that schedule after approval; allow its own cron to trigger.
   Record QStash schedule/message correlation, GET destination, timestamp and
   actual HTTP success, plus deployed aggregate logs without credentials or
   private payloads. Respect provider activation delay. Do not invoke either
   executor manually, insert a notification, or call claim/finalize by hand.
6. At the first healthy tick prove exactly one matching deterministic notification
   and job version for the fixture. With the single approved subscription, expect
   one ledger row/attempt, delivered state, and the same notification ID in the
   in-app notification UI. Separate any setup-generated notifications by source.
7. Prove push attempted from the exact ledger/executor evidence. A successful
   send means the push service accepted it; separately observe worker/browser
   notification display with the user if available. Report blocked permissions,
   OS settings, missing configuration or delivery failure honestly. On a failed
   first attempt, do not hide retries or label it a one-attempt delivery success.
8. Observe the next automatic tick at T + five minutes, still before the movie.
   Assert notification count remains one, successful delivery count/attempts
   and completion timestamps stay unchanged, and no unrelated owner's reminder
   or delivery state changes. A repeated cron tick must not re-deliver success.
9. Re-pause the exact reminder schedule after that second tick, or immediately
   on any anomaly, under the approved stop plan. Wait for in-flight messages to
   settle before checking final state. Pause does not cancel already-created
   messages. Keep calendar and alternative triggers untouched. Cleanup only the
   exact disposable fixture and restore only approved QA settings after human
   authorization; never delete shared catalogue data or unrelated jobs.

Any failed precondition or unexpected user/job/Google activity stops execution.
Do not compensate with broad cleanup, a generic reset, another user's preference
change, an executor invocation or an unapproved scheduler mutation. Continuous
development operation after acceptance requires a separate explicit decision;
do not leave the reminder schedule active by default after a controlled test.

**SAFE TO RUN NOW: NO.** Plan prepared; human approval and the listed fresh
runtime/isolation preconditions remain outstanding. **LIVE STATE CHANGED: NO.**
