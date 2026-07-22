# WatchFlow Database

## Scope and source of truth

The deployed Supabase database already contains `profiles`, `movies`, and
`user_movies`, with RLS enabled. The repository does not contain the original
base-schema migration, schema dump, or generated database types. It does contain
reviewed Phase 3 and Part 10B incremental migrations, so this document combines
the previously verified deployed contract with those version-controlled
changes.

The live Supabase schema remains authoritative. A read-only OpenAPI inspection
before Phase 3 confirmed the base columns documented below. Incremental
migrations add schedule/queue fixes and Part 10B settings without recreating the
base tables.

## Relationship model

```text
auth.users
    1
    |
    1
profiles
    1
    |
    many
user_movies
    many
    |
    1
movies
```

## Tables

### `profiles`

Purpose: application-owned member information that complements the identity in
Supabase Auth.

Phase 1 application contract:

- A profile is addressed by the authenticated Auth user UUID through `id`.
- A signed-in member can read their own profile under the existing RLS policy.
- The dashboard tolerates a missing profile row and reports it as not yet
  created.
- Common optional presentation fields such as `display_name`, `full_name`,
  `username`, or `name` are used only when present; the authenticated email
  continues to come from verified Auth claims.

The deployed table also contains required `timezone` (default `UTC`) and
`subscription_plan` fields. Phase 3 updates `timezone` through an authenticated,
security-invoker scheduling function scoped to `auth.uid()`.

Migration `202607220003_user_settings.sql` ensures optional `full_name`,
`avatar_url`, and `country` plus `timezone`, `created_at`, and `updated_at` are
available without removing any existing profile column. Authenticated profile
UPDATE privileges are restricted to `full_name`, `avatar_url`, `country`, and
`timezone`; RLS still decides which row may be updated. Application forms expose
only full name, country, and timezone in this milestone.

### `user_preferences`

Purpose: one private settings row per Auth user. `user_id` is the primary key
and references `auth.users(id) on delete cascade`.

Application fields are `default_movie_status`, `default_priority`,
`default_library_view`, `date_format`, `time_format`, `show_adult_results`,
`include_unreleased_movies`, `preferred_language`, `movies_per_page`,
`email_notifications_enabled`, `schedule_reminders_enabled`,
`reminder_offset_minutes`, and `weekly_summary_enabled`. Audit fields are
`created_at` and trigger-maintained `updated_at`.

Check constraints enforce the seven library statuses, priorities 0 through 5,
grid/list views, the three supported date formats, 12h/24h time formats,
reasonable language codes, page sizes 12/24/48/96, and reminder offsets
15/30/60/180/1440 minutes. Adult results default off and unreleased movies
default on.

RLS policies permit authenticated SELECT, INSERT, and UPDATE only when
`(select auth.uid()) = user_id`. The authenticated role has no DELETE grant or
policy. Column grants prevent direct changes to `user_id`, `created_at`, or
`updated_at`. Account deletion removes the row through its Auth foreign-key
cascade, not a normal member delete operation.

`watchflow_auth_user_preferences_created` is a preferences-only Auth trigger.
It supplements, and does not replace, the deployed profile-creation trigger.
The migration backfills every existing Auth user with `ON CONFLICT DO NOTHING`.

### `movies`

Purpose: the shared movie catalog used by all members. It should hold canonical
movie metadata once Phase 2 begins.

Phase 2 upserts shared metadata on the unique `tmdb_id` key. Live schema
inspection confirmed the application columns are `title`, `original_title`,
`overview`, `poster_path`, `backdrop_path`, `release_date`, `release_year`,
`runtime_minutes`, `genres`, `director`, `main_cast`, `original_language`,
`production_countries`, `public_rating`, `trailer_key`, and
`metadata_updated_at`.

`genres`, `main_cast`, and `production_countries` are JSONB and required.
`metadata_updated_at` is also required and defaults to `now()`. A conflict-target
diagnostic reached PostgreSQL constraint execution rather than returning
`42P10`, confirming `tmdb_id` has the unique constraint required by the upsert.

### `user_movies`

Purpose: the association between a member and a shared movie. It is the natural
location for user-specific state such as library membership, status, priority,
rating, notes, or scheduling references where those columns exist.

The verified deployed columns are:

- `id` UUID primary key
- `user_id` UUID owner reference
- `movie_id` bigint shared-movie reference
- `status` text (default `want_to_watch`)
- `personal_rating` numeric
- `review` text
- `priority` smallint (default `0`)
- `queue_position` integer
- `scheduled_for` timestamptz
- `watched_at` timestamptz
- `would_watch_again` boolean
- `created_at` and `updated_at` timestamptz

Migration `202607210001_phase_3_movie_management.sql` introduced the initial
Phase 3 functions. Migration `202607220002_schedule_queue_fixes.sql` is the
standalone fix for deployed environments that still lack `schedule_timezone`,
`schedule_note`, the conflict-safe queue function, and explicit ownership-only
SELECT/UPDATE policies.

New relationships default to `want_to_watch`. The unique `(user_id, movie_id)`
constraint remains the concurrency guard against duplicate personal-library
rows; PostgreSQL error `23505` is treated as an already-added success state.

Phase 3 status values are `want_to_watch`, `watch_next`, `scheduled`,
`currently_watching`, `watched`, `on_hold`, and `dropped`. Application and
database functions validate ratings from 0 through 10 and integer priorities
from 0 through 5.

### Queue invariant

Only `watch_next` rows receive a queue position. Positions are contiguous and
one-based per user, with a partial unique index on `(user_id, queue_position)`.
Direct status updates and queue normalization filter every row by the verified
user ID and remain subject to RLS. `move_watch_queue_item` derives the owner
from `auth.uid()`, locks and serializes the queue, and performs conflict-safe
atomic swaps. No browser request accepts a user ID.

### Scheduling invariant

`scheduled_for` stores the absolute viewing instant as `timestamptz`.
`schedule_timezone` stores the IANA timezone used for that viewing, while
`schedule_note` stores an optional private note. `profiles.timezone` is the
preferred form default. Schedule grouping uses the per-item timezone with the
profile timezone as fallback.

The schedule/queue fix migration enables RLS and adds authenticated-only
policies equivalent to `auth.uid() = user_id` for SELECT and both UPDATE
expressions. It does not add unrestricted access or grant mutation functions to
`anon`.

## RLS expectations

RLS is already configured and must not be disabled or bypassed. The intended
security properties are:

- Members can access only their own `profiles` row.
- Members can access only their own associations in `user_movies`.
- Access to shared `movies` rows follows the deployed read policies; the
  server-only secret-key client is used only for authenticated TMDB metadata
  upserts into this shared table.
- All `profiles` and `user_movies` operations use the member's cookie-bound
  client and JWT. Security-invoker functions remain subject to RLS.

These are security expectations, not a replacement for reviewing the deployed
policy SQL before Phase 2 writes are introduced.

Part 10B also adds `watchflow_add_user_movie(bigint)`. The security-invoker
function derives its owner from `auth.uid()`, reads that owner's default status
and priority, assigns a serialized Watch Next position when needed, and returns
`added` or `duplicate`. Only `authenticated` can execute it.

## Schema-change policy

Schema changes are represented as reviewable migrations, preserve RLS, include
indexes for common filters, and should be tested as at least two distinct users
to verify tenant isolation. Apply the Phase 3 migration before deploying the
Phase 3 application code.

## Part 10A CSV import data behavior

CSV import requires no schema migration. It writes only the existing shared
`movies` and private `user_movies` tables and retains all existing RLS policies
and constraints.

For a confirmed TMDB selection, the server-only secret-key client upserts the
complete provider metadata into `movies` using the unique `tmdb_id` conflict
target. The member's authenticated SSR client then checks and inserts
`user_movies` with the identity returned by `auth.getUser()`. Browser input does
not contain or control `user_id`.

Valid mapped personal values populate `status`, `personal_rating`, `review`,
`priority`, and `watched_at`. Empty ratings and watched dates become `null`, an
empty review becomes `null`, missing or explicitly accepted unknown status
becomes `want_to_watch`, and priority defaults to `0`. Existing status, rating,
priority, date, review-length, and ownership constraints remain authoritative.

The unique `(user_id, movie_id)` constraint prevents retries or concurrent
imports from duplicating personal library relationships. A constraint-safe
post-insert ownership lookup distinguishes an already-owned movie from other
database conflicts without exposing database details to the browser.

Imported `watch_next` rows start after the authenticated member's current
maximum `queue_position`, preserve CSV order, and use the existing
`watchflow_normalize_queue()` security-invoker function after the batch. The
admin client never reads or mutates queue or personal-library data.

## Part 10B export and deletion behavior

Exports do not create database objects or persisted files. CSV and JSON Route
Handlers select explicit private columns through the authenticated client and
filter `profiles.id`, `user_preferences.user_id`, and `user_movies.user_id` by
the ID returned from `auth.getUser()`.

Deleting a library removes only the current user's `user_movies` rows. It never
deletes `movies`. Complete account deletion calls the Auth admin API only after
server-side identity and confirmation checks; existing foreign-key cascades
remove user-owned profile, preference, and library data while shared movie
metadata remains.
