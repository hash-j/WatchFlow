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
