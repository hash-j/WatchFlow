# WatchFlow Background Executor Operations

Part 18 uses two deliberately separate, bounded server-side executors:

- `POST /api/internal/notifications/scheduled-reminders`
- `POST /api/internal/calendar/sync`

Both require `Authorization: Bearer <WATCHFLOW_SCHEDULER_SECRET>`. The secret
must contain at least 32 characters and must be stored only in the deployment
and scheduler secret stores. Missing, malformed, weak, or incorrect
authorization fails before either privileged database client is constructed.

## External scheduler contract

The repository does not select or configure a Production scheduler provider.
For a deployed non-Production WatchFlow target, configure two independent HTTP
jobs rather than a combined orchestration request:

1. Invoke the scheduled-reminder endpoint every minute.
2. Invoke the calendar-sync endpoint every minute.
3. Use `POST`, the exact deployment HTTPS origin, the Bearer authorization
   header, and no request body.
4. Disable redirects and treat non-2xx responses as invocation failures.
5. Never place the scheduler secret in a URL, workflow output, or browser
   configuration.

Each invocation claims at most ten jobs with a 120-second lease. Database
claim/finalize RPCs, not the scheduler provider, own concurrency,
idempotency, retry limits, and terminal state. Concurrent or repeated calls
are therefore safe, while separate schedules preserve failure isolation.

Before enabling a schedule, pin and verify the deployment's Supabase project
reference. The guarded development target is `ckwadpmvxieekjlsfcks`. A
development scheduler must not be pointed at a Production deployment, and
Production activation requires a separate explicit release approval.

## Secret-free results

Successful responses contain aggregate counters only. Failure responses use a
fixed safe message. Responses and logs must never include scheduler,
Supabase, VAPID, OAuth, access-token, refresh-token, or encryption values.

Reminder jobs expose delivery counts. Calendar jobs expose claimed,
succeeded, retryable, failed, authorization-required, and stale-finalization
counts. Owner-visible job metadata remains the durable source for retry and
terminal-state inspection; no admin dashboard is introduced.

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
