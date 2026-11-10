# v1 development reminder diagnosis and approval plan

> **Status (2026-11-10): REMINDER RELEASE GATE PASS; END-TO-END REMINDER ACCEPTANCE PASS**,
> approved by Hashim after the controlled automatic run recorded at the end of this
> document. USER_VISIBLE_PUSH_CONFIRMED: YES. IN_APP_NOTIFICATION_VISIBLE_CONFIRMED: YES.
> No further live reminder acceptance is to be run. Sections below are kept as the
> historical record.

Prepared 2026-11-04. **READ-ONLY DIAGNOSIS COMPLETE; ACCEPTANCE NOT RUN.**
No scheduler resume, executor invocation with authorization, fixture write,
notification insert, preference/timezone edit, Google request, Production action,
commit, push or deployment is authorized by this document. Human approval and
the remaining preflight checks below are required before execution.

## 2026-11-10 read-only preflight — HALTED

New blocker: **the watchflow-dev Supabase project is paused** (Free-tier
inactivity pause shown in the dashboard; resumable until 15 Dec 2027). Its
`*.supabase.co` host does not resolve, so the reminder executor cannot claim,
insert or finalize anything. Resuming QStash alone would not deliver reminders.

| Check | Result (2026-11-10 ~16:43–17:00 UTC) |
| --- | --- |
| GitHub gates | Reminder and calendar gates both false; recent scheduled runs all skipped |
| Dev deployment | Reminder route unauthenticated GET 401/no-store; signup 200 |
| QStash EU | Active 0 / Paused 2 (calendar, reminders). Reminder schedule config unchanged: GET, `2-57/5 * * * *`, retries 0, timeout 55000, `isPaused: true`, Authorization redacted. Last schedule time Oct 5; zero reminder-URL messages in the last 15 days |
| Database inventory | Not run: project paused. Prepared aggregate-only SELECT query was not executed |
| Bearer / VAPID match | Not verified; requires owner check without revealing secrets |

Required order before the controlled test: (1) owner-approved resume of the
watchflow-dev Supabase project; (2) re-run deployment/Auth reachability and the
aggregate database inventory; (3) owner bearer/VAPID match; (4) the
controlled acceptance below. No live state was changed by this preflight.

### Continuation after Hashim resumed the Supabase project (~17:01 UTC)

Auth host responds again; dev `/auth/login` 200; reminder route still 401
unauthenticated. Aggregate SELECT-only inventory (no identifiers read or kept):

| Item | Count |
| --- | --- |
| Reminder jobs | 1 total, `skipped`; actionable (pending/retry/processing) 0; due within 2 h 0 |
| Deliveries | 0 rows |
| Push subscriptions | **0** (the 2026-11-04 subscription no longer exists) |
| Users / with preferences | 10 / 10 |
| Reminders enabled / lead 15 | 1 / 1 (same user) |
| Push enabled | **0** |
| Users with a Google calendar connection | 4; without 6 |
| Reminders enabled and no Google connection | **0** |

The 2026-11-04 pending example job is no longer present; its removal was not
investigated further. Isolation is good (no backlog, nothing in flight), but
the "subscription present / push enabled" premise no longer holds, and the
only reminder-enabled account has a Google connection, which this plan
excludes as the QA identity. Before the controlled test the owner must approve:
one unconnected QA account, enabling its reminders (15 min) and push, and a
fresh browser push subscription, all through the normal app UI, plus their
later restoration. Bearer/VAPID match remains owner-pending.

### 2026-11-10 Vercel target inspection (read-only, owner-signed-in dashboard)

| Item | Observation |
| --- | --- |
| Real Production | Vercel project `watchflow`, domain `watchflow-movies.vercel.app`, production branch `production`, backend `pupzjbtj…` (not watchflow-dev). Its Supabase/TMDB variables are scoped **Production and Preview**, so any Git preview of this repo in that project uses the Production backend |
| Dev project | `watchflow-dev-ops` (linked in `.vercel/repo.json`), domain `watchflow-dev-ops.vercel.app`, production branch `codex/part-18-production-operations`, backend `ckwadpmvxieekjlsfcks`. Current deployment: commit `4e66cf7` (Oct 4, redeployed Oct 5); it lacks the v1 public pages (`/about` 404) |
| Dev env vars | All Production-scoped only; **none in Preview**. Present: Supabase URL/publishable/secret, TMDB, scheduler secret, expected project ref, CRON_SECRET, Google calendar values. **Missing: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`**, so push is `not_configured` and the UI cannot subscribe on that deployment |
| Preview protection | Standard Vercel Authentication; preview reminder URLs 302 to Vercel SSO. No automation-bypass secret exists |
| Vercel Cron | No WatchFlow cron jobs registered |
| Branch | Local HEAD is 9 commits after the deployed `4e66cf7` and 4 ahead of `origin`; reminder executor/push source is unchanged since `4e66cf7`. Three later migrations exist: the owner reports the two artwork migrations complete on development; the 2026-10-16 same-subject reauth migration's dev status must be re-verified read-only before deploying |

A Preview deployment is **not** the smallest safe option: watchflow-dev-ops has
no Preview variables, previews are SSO-protected (needs a bypass secret plus a
QStash header and destination change), and the `watchflow` project's previews
use the Production backend.

Smallest option (prepared, NOT approved): redeploy the watchflow-dev-ops
project's own production target, which is the dev backend at the existing
public URL, so the QStash destination stays unchanged:

1. Owner confirms the watchflow-dev-ops "Production" target is a dev
   environment and not the protected real Production (`watchflow`).
2. Owner generates a new VAPID key pair locally and adds the three VAPID
   variables to watchflow-dev-ops **Production scope only** (subject:
   `mailto:` address or `https:` URL). Values never enter chat, docs or Git.
3. Deploy current HEAD to watchflow-dev-ops production with one of:
   a. the Vercel CLI from this linked folder (`vercel deploy --prod`), which needs a
      pinned CLI download and owner login and creates no `watchflow` preview; or
   b. an approved push of the branch, which auto-deploys watchflow-dev-ops but
      also builds a protected `watchflow` Preview against the Production backend.
4. Verify publicly: `/about` 200, `/auth/sign-up` 200, CSP origin is
   watchflow-dev, reminder route 401/no-store, `/sw.js` served.
5. Only then set up the QA account and its subscription on that URL, followed by the
   counts-only verification. QStash stays paused and unchanged throughout.

### 2026-11-10 dev deployment preparation (owner confirmed watchflow-dev-ops is development)

- Local link: the only `.vercel` folder holds `repo.json` with a single project,
  `watchflow-dev-ops` (`prj_1hR9…`), matching the dashboard project ID. There is no
  `project.json` and no `VERCEL_*` shell variables. `.vercel` is git-ignored.
- Ledger (read-only SELECT): watchflow-dev records `202609300005`,
  `202610160001_part_18j_same_subject_reauth`, `202611020001` and `202611020002`,
  which matches every local migration. The live
  `watchflow_upsert_google_calendar_connection` contains the reauth subject guard.
  Nothing was reapplied.
- VAPID: generated by the owner in their own terminal with the installed
  `web-push` 3.6.7 dependency: `npx --no-install web-push generate-vapid-keys`.
  Output format fits `lib/push/config.ts`/`validation.ts`. Subject:
  `mailto:hashim.ghub@gmail.com`. Keys are entered only in watchflow-dev-ops
  Production scope; never in chat, docs or Git.
- `.vercelignore` (CRLF) was checked with the repo's `ignore` package: `.env.local`,
  `.env.test.local`, `supabase/.temp` and QA artifacts are excluded from CLI upload.
- Prepared CLI deploy (pinned `vercel@65.4.0`, published 2026-10-27), to run only after
  approval and after the env check passes:
  `npx --yes vercel@65.4.0 deploy --prod --scope hashim-javeds-projects`.
  The CLI uploads the working tree. Uncommitted doc edits do not affect the app.
- Env check (names and scopes only, after the owner saved them): `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY` (Sensitive) and `VAPID_SUBJECT` were added, all Production-scoped.
  All nine reminder-path variables are present in watchflow-dev-ops Production.
  Values were not read. Format is validated at runtime by `getVapidConfiguration`;
  the post-deploy subscription and first push confirm it. Deployment is still unapproved.
- 2026-11-10: Owner approved the deploy. The CLI logged in as the owner via device authorization.
  `vercel deploy --prod` was **rejected before build**: Hobby plan allows only daily
  crons, and `vercel.json` declares `* * * * *` reminder and calendar crons. Nothing
  was deployed; the existing deployment still serves (`/about` 404). Proposed fix
  (needs approval): deploy with a dev-only `--local-config` file that has no `crons`,
  leaving the committed `vercel.json` unchanged. QStash remains the only intended trigger.
- Owner approved the cron-free deploy. With CLI 65.4.0, `--local-config` (scratch file, then the
  repo's documented `vercel.watchflow-dev.json` with `--project watchflow-dev-ops`)
  still failed on the cron check. The CLI uploads the root `vercel.json` and the build
  reads it. Two failed deployments (Error state) remain in watchflow-dev-ops.
  **Successful deploy:** exact `git archive HEAD` (80754b3; no env files, no uncommitted
  edits) exported to a scratch folder with `vercel.json` removed, deployed with
  `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` pinned to watchflow-dev-ops and
  `--prod --local-config vercel.watchflow-dev.json`. Deployment
  `watchflow-dev-qrehqvc95…` is ready and aliased to `watchflow-dev-ops.vercel.app`.
  No crons, push, Git or `watchflow` project change. Update
  BACKGROUND_EXECUTORS.md's command if this CLI behavior persists.
- Public post-deploy checks: `/about`, `/privacy`, `/auth/sign-up`, `/auth/login`,
  `/sw.js`, manifest all 200. Reminder route 401 `no-store`; calendar sync 401. CSP origin
  is `ckwadpmvxieekjlsfcks`. Real Production `/about` still 404 (unchanged).
  QStash is still paused and unchanged. Next: owner QA account setup and browser subscription
  on this URL, then counts-only verification.

### 2026-11-10 19:14 UTC QA verification (aggregate read-only)

| Check | Result |
| --- | --- |
| Eligible users (reminders + push + lead 15 + no Google) | 1 |
| Push subscriptions total / belonging to that user | 1 / 1 |
| That user's Google connections | 0 |
| That user's profile timezone | Asia/Karachi |
| That user's job | pending, attempts 0, scheduled_for 19:25Z, Asia/Karachi, reminder_at 19:10Z, lead 15 |
| Unrelated actionable jobs | 0 (jobs total 2: this one plus the old skipped one) |
| Deliveries | 0 |
| QStash reminder-URL messages, last 15 days | 0 |
| QStash schedules | Active 0 / Paused 2 |

The existing fixture **cannot** be used as scheduled: at verification its due time
(00:10 Karachi) had already passed and the movie (00:25 Karachi) was about 11 minutes
away. That leaves no room for the approval, activation delay, a pre-due baseline
or the second-tick idempotency check. While paused, it stays pending. On any later
resume after 19:25Z it will be skipped (past movie), not delivered.

Reuse without a new fixture: the owner reschedules this same movie through the normal
app form so that its reminder lands on a future cron tick. Ticks fall at minutes
02, 07, …, 57 UTC, which are the same minutes in Karachi. So the movie minute
must be 17, 22, 27, 32, 37, 42, 47, 52, 57, 02, 07 or 12, at least about 25 minutes
ahead. The job row is keyed by the same `user_movies` ID and is updated in place.
Then re-run this verification and request approval to resume.

### 2026-11-10 controlled automatic run (owner-approved)

Pre-resume check (19:20Z): fixture rescheduled by the owner to movie 19:47Z (00:47 Karachi),
reminder 19:32Z (a cron tick), pending/0 attempts, 0 notifications, 0 deliveries, all
other isolation checks as above.

| Time (UTC) | Event | Evidence |
| --- | --- | --- |
| ~19:22 | Resumed **only** `watchflow-dev-part18-ops-unit2d-reminders` in the console | Active 1 / Paused 1, with calendar still paused; next run shown |
| 19:27 | Pre-due automatic tick | Last Run updated; fixture unchanged (pending, 0 attempts, 0 notifications) |
| 19:32 | **Due tick: automatic delivery** | Job `delivered`, attempts 1, `push_delivered`, completed 19:32:02. Exactly 1 delivery row (`delivered`, attempts 1). Exactly 1 notification, created 19:32:01 |
| 19:36:56 | Fixture rescheduled through the app (user_movies and job updated in the same transaction) to movie 19:59Z, reminder 19:44Z | By design, the new schedule version reset the job to pending and removed the old version's delivery row. The notification from 19:32 remains (count 1) |
| 19:37 | Next automatic tick | No new notification or delivery; new version not yet due |
| ~19:39 | **Re-paused** the reminder schedule after the unexpected change | Active 0 / Paused 2 |

Proven by this run: QStash invokes the deployed endpoint automatically; the stored
bearer matches `WATCHFLOW_SCHEDULER_SECRET`; the deployed VAPID keys are accepted by
the push service; due-time selection is correct (not early at 19:27, delivered at 19:32);
one in-app notification and one delivery per schedule version; no unrelated user was
affected; QStash never had to retry.

Not proven by this run: second-tick idempotency for the *same* delivered version. The
reschedule replaced that version 4 seconds before the 19:37 tick. On-screen OS display
is owner-reported only. The current version (reminder 19:44Z) stays pending while
paused; after 19:59Z it will be skipped on any later resume. Production, Google and
calendar were untouched.

### Gate decision — PASS (Hashim, 2026-11-10)

Hashim confirmed the 19:36:56Z reschedule was his own action and approved the
gate based on: the automatic QStash trigger, due-time behavior, exactly one
reminder, one accepted push delivery, the in-app notification, bearer and VAPID
verification, isolation, the calendar staying paused and the safe re-pause.
Same-version duplicate protection relies on existing automated coverage. The
focused reminder suites (`part18i-migration`, `scheduled-reminders`,
`scheduled-reminder-route`, `scheduler-auth`, `part18i-security-contract`) passed
29/29 on 2026-11-11. Post-decision console check: Active 0 / Paused 2.

Pending cleanup, identified only and **not performed** until approved:

| Item | Current state | Suggested action |
| --- | --- | --- |
| QA fixture schedule | Movie scheduled 19:59Z; job pending (reminder 19:44Z), so it will be marked skipped on any later resume | Unschedule or remove the movie through the app UI if it is disposable |
| Test in-app notification | 1 reminder notification for the QA user | Optional: mark read or delete in the app |
| QA preferences/profile | Reminders on, lead 15, push on, profile Asia/Karachi | Restore to the owner-noted originals through Settings |
| QA browser push subscription | 1 stored subscription | Keep for future checks, or unsubscribe in Settings (removes the row) |
| Failed Vercel deployments | 2 Error-state CLI deployments in watchflow-dev-ops | Optional: delete in the dashboard; harmless |
| Local Vercel CLI login | `vercel@65.4.0` logged in on this machine | Optional: `npx vercel@65.4.0 logout` |
| Scratch deploy export | Git export of 80754b3 in the agent scratchpad (no secrets) | Optional local delete |

Keep: the watchflow-dev-ops VAPID variables and HEAD deployment, the resumed watchflow-dev
Supabase project, and both QStash schedules paused (continuous development operation
needs a separate decision).

### QA cleanup — done by Hashim in the app, verified 2026-11-10 20:27Z (aggregate read-only)

Approved scope: unschedule the test movie, remove the test notification if
appropriate, and restore preferences only where the originals were known with certainty. Hashim acted
through the app UI as the QA user; no SQL writes.

| Item | Verified state |
| --- | --- |
| Test movie | Status `watched`, schedule cleared; job `skipped` / `schedule_changed` (set by the app's normal sync) |
| Test notification | Kept as evidence and marked read. The app has no notification-delete path; users can only update read state |
| Reminders preference | Restored to **off**. The 17:01Z baseline proved no user without Google had reminders on |
| Push preference | Left **on**. The original was off, but the app's disable-push RPC deletes the account's subscriptions, and the subscription is kept by decision |
| Lead / profile timezone | Left at 15 / Asia/Karachi; originals were not known with certainty |
| Push subscription | Kept: exactly 1, belonging to the QA user |
| Other | QA user has 0 Google connections; 0 actionable jobs in total; 2 jobs total, both skipped |

### Final user-visible confirmation (Hashim)

Hashim personally saw the scheduled movie push notification appear through
Chrome/Windows at the expected time. The WatchFlow Notifications page shows the
matching "Scheduled movie reminder" at 12:32 AM Karachi, which is 19:32Z, the
same instant as the recorded delivery. This closes the earlier "push-service acceptance
is not proof of OS display" caveat.

| Result | Value |
| --- | --- |
| USER_VISIBLE_PUSH_CONFIRMED | YES (owner-observed) |
| IN_APP_NOTIFICATION_VISIBLE_CONFIRMED | YES (owner-observed) |
| END_TO_END_REMINDER_ACCEPTANCE | **PASS** |

QStash was last verified Active 0 / Paused 2 after the gate decision. No one resumed
it, and the console was signed out at cleanup verification time. The failed Vercel
deployments, CLI login and scratch export were left as optional.

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
