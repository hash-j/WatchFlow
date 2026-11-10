# WatchFlow Background Executor Operations

Part 18 uses two deliberately separate, bounded server-side executors:

- `GET /api/internal/notifications/scheduled-reminders` (Vercel Cron)
- `POST /api/internal/notifications/scheduled-reminders`
- `GET /api/internal/calendar/sync` (Vercel Cron)
- `POST /api/internal/calendar/sync`

Both require `Authorization: Bearer <WATCHFLOW_SCHEDULER_SECRET>`. The secret
must contain at least 32 characters and must be stored only in the deployment
and scheduler secret stores. Missing, malformed, weak, or incorrect
authorization fails before either privileged database client is constructed.
Every invocation also requires
`WATCHFLOW_EXPECTED_SUPABASE_PROJECT_REF` to match the project ref extracted
from the configured HTTPS `NEXT_PUBLIC_SUPABASE_URL`. Missing, malformed, or
mismatched target configuration returns a fixed failure before privileged
execution begins.

## External scheduler contract

The repository declares two independent HTTP jobs as one-minute Vercel Cron
entries in
`vercel.json`, but no Vercel project or Production schedule has been deployed
or activated. Vercel invokes cron routes with `GET`; manual and guarded
acceptance may continue to use `POST`. Both methods delegate to the same
authenticated, target-pinned implementation.

1. Invoke the scheduled-reminder endpoint every minute.
2. Invoke the calendar-sync endpoint every minute.
3. Use the exact deployment HTTPS origin, the Bearer authorization header, and
   no request body or query-string credential.
4. Disable redirects and treat non-2xx responses as invocation failures.
5. Never place the scheduler secret in a URL, workflow output, or browser
   configuration.

Vercel supplies its `CRON_SECRET` as the bearer value. In each Vercel project,
configure `CRON_SECRET` and `WATCHFLOW_SCHEDULER_SECRET` with the same strong,
environment-specific value. Keep the names separate: the application
continues to authorize only through `WATCHFLOW_SCHEDULER_SECRET`, while
`CRON_SECRET` is Vercel's delivery mechanism. Neither may be shared between
watchflow-dev, Preview, and Production.

Each invocation claims at most ten jobs with a 120-second lease. Database
claim/finalize RPCs, not the scheduler provider, own concurrency,
idempotency, retry limits, and terminal state. Concurrent or repeated calls
are therefore safe, while separate schedules preserve failure isolation.

Before enabling a schedule, set and verify the deployment's server-only
`WATCHFLOW_EXPECTED_SUPABASE_PROJECT_REF`. The guarded development target is
`ckwadpmvxieekjlsfcks`. A development scheduler must not be pointed at a
Production deployment. Production activation requires a separate explicit release approval.
Ephemeral Preview deployments must not receive a scheduler.

## Non-Production GitHub scheduler acceptance

The dedicated `watchflow-dev-ops` Vercel project uses the Hobby plan. Hobby
does not accept the repository's intended one-minute cron declarations, so
GitHub Actions provides the scheduler only for guarded non-Production
acceptance. This does not change the Production design: `vercel.json` retains
the two independent one-minute Vercel Cron entries for eventual Pro/Production
activation.

Deploy the dedicated Hobby project with the explicitly selected
`vercel.watchflow-dev.json` local configuration. That configuration deliberately
contains no cron declarations and otherwise leaves Vercel's normal framework,
install, build, output, and runtime detection unchanged. Never rename it to
`vercel.json` or use it for Production. The explicit development deployment
command is:

```text
vercel deploy --prod --local-config vercel.watchflow-dev.json --project watchflow-dev-ops
```

Here, `--prod` promotes only within the dedicated non-Production Vercel project;
it does not authorize a WatchFlow Production deployment.

**Verified working method (2026-11-11, Vercel CLI 65.4.0).** The command above
is now rejected with "Hobby accounts are limited to daily cron jobs". The CLI
still uploads the root `vercel.json`, and the build validates its one-minute crons,
even with `--local-config`. Deploy an exact Git export of the reviewed commit
that omits `vercel.json`, pinned to the dev project by ID. From Git Bash, with
`<dir>` an empty scratch folder outside the repository:

```bash
git archive HEAD | tar -x -C <dir>
rm <dir>/vercel.json
cd <dir>
VERCEL_ORG_ID=team_dpsZ4OsXuH0ZALzmHsiefYS7 \
VERCEL_PROJECT_ID=prj_1hR9C2zlQ75RQOz46grBtkZCYFZh \
npx --yes vercel@65.4.0 deploy --prod --local-config vercel.watchflow-dev.json
```

`git archive` exports only tracked files, so no `.env*` secrets (other than
`.env.example`) or uncommitted edits are uploaded. The committed `vercel.json` is
unchanged. The IDs are watchflow-dev-ops identifiers, not secrets. Never use them for the
`watchflow` Production project. Do not push this branch as a deployment
shortcut: watchflow-dev-ops tracks it, but the `watchflow` project would also
build a protected Preview whose variables point at the Production backend.
Afterwards, verify `/about` 200, reminder route 401 `no-store`, and that the CSP origin is
watchflow-dev. Required watchflow-dev-ops Production variables: the Supabase
URL, publishable key and secret key, `TMDB_READ_ACCESS_TOKEN`, `WATCHFLOW_SCHEDULER_SECRET`,
`WATCHFLOW_EXPECTED_SUPABASE_PROJECT_REF`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`.

QStash (EU) is the accepted development reminder trigger; see
[V1_REMINDER_RELEASE_ACCEPTANCE.md](V1_REMINDER_RELEASE_ACCEPTANCE.md). The
watchflow-dev Supabase project is on the Free plan and pauses after inactivity.
A paused project blocks every executor until it is resumed.

The repository has separate reminder and calendar workflows. Each uses a fixed
`https://watchflow-dev-ops.vercel.app` origin, one fixed executor path, GET,
the existing bearer contract, no redirects, bounded request time, and exact
aggregate-only response validation. Both use the `watchflow-dev-scheduler`
GitHub Environment with only this required secret:

- `WATCHFLOW_DEV_SCHEDULER_SECRET`

The value must equal that deployment's `WATCHFLOW_SCHEDULER_SECRET`. GitHub
does not need `CRON_SECRET`, Supabase credentials, Google credentials, VAPID
keys, encryption keys, or service-role credentials to invoke these routes.

Scheduled execution is fail-closed behind independent repository variables:

- `WATCHFLOW_DEV_REMINDER_SCHEDULER_ENABLED=false`
- `WATCHFLOW_DEV_CALENDAR_SCHEDULER_ENABLED=false`

Only the exact string `true` enables the corresponding scheduled job. Manual
`workflow_dispatch` runs instead require the explicit
`confirm_watchflow_dev=true` input. Reminder and calendar schedules have
separate concurrency groups and never cancel an in-progress invocation.

GitHub Actions supports a minimum five-minute scheduled interval, not the
intended one-minute Production cadence. The acceptance schedules are staggered
at minutes `2-57/5` and `4-59/5`. Scheduled workflows run from the default
branch and may be delayed or dropped under platform load, so this path verifies
automatic invocation, durable idempotency, retries, isolation, and cleanup; it
is not evidence of one-minute delivery precision or a Production scheduler
SLA.

Keep both variables false until the deployment passes missing/wrong-auth,
authorized zero-work, target-pin, no-redirect, no-store, and aggregate-schema
preflight. Calendar fixture execution and any real Google mutation still
require a later exact-fixture human checkpoint. No Production scheduler is
activated by these files.

## Secret-free results

Successful responses contain aggregate counters only. Failure responses use a
fixed safe message. Responses and logs must never include scheduler,
Supabase, VAPID, OAuth, access-token, refresh-token, or encryption values.

Reminder jobs expose delivery counts. Calendar jobs expose claimed,
succeeded, retryable, failed, authorization-required, and stale-finalization
counts. Owner-visible job metadata remains the durable source for retry and
terminal-state inspection; no admin dashboard is introduced.

Each successful route execution writes one structured operational record. Its
fixed label identifies the executor and its structured object contains only
the same aggregate counters returned by that executor. Errors remain fixed HTTP
responses; logs never include raw errors, users, movies, provider payloads,
subscription endpoints, credentials, or secret values.

## Disable and rollback

Disable the affected cron first. Queue, lease, retry, mapping, notification,
connection, and credential state must be preserved; do not delete queued work
as a rollback mechanism. If scheduler authentication may be compromised,
disable both crons, rotate the environment's matching `CRON_SECRET` and
`WATCHFLOW_SCHEDULER_SECRET`, redeploy, verify the old value is rejected, and
only then re-enable schedules.

## Calendar disconnect lifecycle

A disconnect request changes the Google connection to `disconnect_pending`
and disables ordinary sync. It coalesces one deterministic
`connection_cleanup` job for every known WatchFlow calendar source, including
an in-flight source that has not produced a mapping yet. Cleanup addresses
only the deterministic WatchFlow provider event ID. It never lists a calendar
or touches unrelated events.

Provider `404` and `410` responses are successful absence. Each successful
cleanup removes its exact mapping. The final cleanup removes the local
connection and encrypted credential through the existing cascade only after
Google refresh-grant revocation succeeds. An unconfirmed revocation remains
retryable and preserves the credential needed for another bounded attempt. Retryable
and terminal failures remain visible in sanitized job and connection metadata.

If Google authorization is revoked, cleanup remains `disconnect_pending` and
does not claim success. Reauthorizing the same Google subject replaces the
encrypted credential and resumes cleanup without re-enabling sync. A different
Google subject is rejected, preventing stale cleanup from crossing accounts.

## Guarded acceptance

Real Google mutations require a human checkpoint. Acceptance must identify the
exact disposable QA mappings and deterministic event IDs, confirm the
watchflow-dev project guard, and obtain explicit approval before invoking the
calendar executor. Cleanup must remove only those controlled events and restore
the QA connection/preferences without enumerating the calendar.
