# WatchFlow Database

## Scope and source of truth

The deployed Supabase database already contains `profiles`, `movies`, and
`user_movies`, with RLS enabled. The repository does not contain the original
base-schema migration, schema dump, or generated database types. It does contain
reviewed Phase 3, Part 10B, Part 12, Part 13, and Part 15 incremental
migrations, so this document combines the previously verified deployed
contract with those version-controlled changes.

The live Supabase schema remains authoritative. A read-only OpenAPI inspection
before Phase 3 confirmed the base columns documented below. Incremental
migrations add schedule/queue fixes and Part 10B settings without recreating the
base tables.

## Relationship model

```text
auth.users
  |-- 1:1 profiles
  |-- 1:many user_movies -- many:1 movies
  `-- 1:many lists -- 1:many list_movies -- many:1 user_movies
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
security-invoker scheduling function scoped to `auth.uid()`. That function also
sets the profile `updated_at` audit timestamp.

Migration `202607220003_user_settings.sql` ensures optional `full_name`,
`avatar_url`, and `country` plus `timezone`, `created_at`, and `updated_at` are
available without removing any existing profile column. Authenticated profile
UPDATE privileges were restricted to `full_name`, `avatar_url`, `country`, and
`timezone`; the missing `updated_at` privilege caused the confirmed scheduling
failure because the RPC is `SECURITY INVOKER`. Patch migration
`202608030001_schedule_profile_permissions.sql` grants only
`UPDATE (timezone, updated_at)` to `authenticated`. It does not grant table-level
UPDATE or access to `PUBLIC`/`anon`. RLS still decides which owned row may be
updated. Application forms expose only full name, country, and timezone in this
milestone.

### `user_preferences`

Purpose: one private settings row per Auth user. `user_id` is the primary key
and references `auth.users(id) on delete cascade`.

Application fields are `default_movie_status`, `default_priority`,
`default_library_view`, `date_format`, `time_format`, `show_adult_results`,
`include_unreleased_movies`, `preferred_language`, `movies_per_page`,
`email_notifications_enabled`, `schedule_reminders_enabled`,
`reminder_offset_minutes`, and `weekly_summary_enabled`. Audit fields are
`created_at` and trigger-maintained `updated_at`.

After the Part 15 patch, the default-status check permits the six statuses that
can be created without extra required scheduling input: `want_to_watch`,
`watch_next`, `currently_watching`, `watched`, `on_hold`, and `dropped`.
`scheduled` remains a valid `user_movies` status, but cannot be a preference
default because that path has no instant/timezone. The migration repairs any
existing scheduled default to `want_to_watch`. Other checks enforce priorities
0 through 5, grid/list views, the three supported date formats, 12h/24h time
formats, reasonable language codes, page sizes 12/24/48/96, and reminder
offsets 15/30/60/180/1440 minutes. Adult results default off and unreleased
movies default on.

RLS policies permit authenticated SELECT, INSERT, and UPDATE only when
`(select auth.uid()) = user_id`. The authenticated role has no DELETE grant or
policy. The later privilege repair grants table-level SELECT/INSERT/UPDATE;
therefore older statements that audit columns are protected by column grants
are no longer accurate. Ownership RLS and server validation remain the row and
field boundaries, while the update trigger controls `updated_at`. Account
deletion removes the row through its Auth foreign-key cascade, not a normal
member delete operation.

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

Part 15 adds nullable `tmdb_adult` and `metadata_language`. Existing rows remain
null and are therefore ineligible for safe cache reuse until authenticated
server logic refreshes them. `metadata_language` accepts a two-letter lowercase
language with an optional uppercase region; current detail ingestion always
stores canonical `en`, so this shared field never reflects a member's preferred
search language. These markers complement `metadata_updated_at`; they do not
contain member preferences or private data.

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
- `favourite` boolean (Part 12 migration: `not null default false`)
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

Favourite is personal relationship state. It belongs only on `user_movies` and
must never be added to shared `movies` or inferred from a rating.

### `lists`

Purpose: one private, named custom collection owned by an Auth user. Part 13
creates this table in
`202607290001_part_13_private_custom_lists.sql`.

| Column | Contract |
|---|---|
| `id` | UUID primary key, default `gen_random_uuid()` |
| `user_id` | Required UUID foreign key to `auth.users(id)` with `on delete cascade` |
| `name` | Required text; its trimmed length must be 1 through 80 |
| `description` | Nullable text; at most 500 characters |
| `visibility` | Required text, default `private`; a check currently permits only `private` |
| `created_at` | Required `timestamptz`, default `now()` |
| `updated_at` | Required `timestamptz`, default `now()`, maintained by the reusable `watchflow_set_updated_at()` trigger function |

`lists_user_normalized_name_key` is a per-owner expression unique index on
`(user_id, lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')))`.
It treats differences in case, outer whitespace, and repeated internal
whitespace as the same list name for one owner. Different owners may use the
same normalized name.

### `list_movies`

Purpose: an ordered membership between one private list and one personal
library relationship.

| Column | Contract |
|---|---|
| `id` | UUID primary key, default `gen_random_uuid()` |
| `list_id` | Required UUID foreign key to `lists(id)` with `on delete cascade` |
| `user_movie_id` | Required UUID foreign key to `user_movies(id)` with `on delete cascade` |
| `position` | Required integer with `position >= 1` |
| `created_at` | Required `timestamptz`, default `now()` |
| `updated_at` | Required `timestamptz`, default `now()`, maintained by `watchflow_set_updated_at()` |

`user_movie_id` is deliberately the UUID `public.user_movies.id`. It is never
`movies.id`, `user_movies.movie_id`, a TMDB ID, a card position, or a
browser-provided user ID. This makes custom-list membership dependent on a
personal-library relationship and lets deleting that relationship cascade only
its list memberships.

`list_movies_list_user_movie_key` makes `(list_id, user_movie_id)` unique, so a
personal movie appears once in one list while remaining eligible for any number
of other lists. `list_movies_list_position_key` makes `(list_id, position)`
unique and is `deferrable initially immediate`; ordering RPCs defer it only
inside their transaction while they use conflict-safe temporary positions.
Deleting a list cascades only its `list_movies` rows. It cannot delete
`user_movies`, personal metadata, schedules, queue state, or shared `movies`.

### `watchflow_tmdb_rate_limits`

Purpose: an internal, durable fixed-window counter for authenticated
TMDB-backed operations. Part 15 creates it in
`202607300001_part_15_tmdb_rate_limits.sql`.

| Column | Contract |
|---|---|
| `user_id` | Auth UUID with `on delete cascade`; supplied only by the limiter function through `auth.uid()` |
| `operation` | One of `search`, `details`, `import_search`, or `import_details` |
| `window_started_at` | Absolute start of the current fixed window |
| `request_count` | Nonnegative consumed cost in the window |
| `updated_at` | Last successful counter mutation |

The primary key `(user_id, operation)` is both the uniqueness guard and exact
lookup index. RLS is enabled, no RLS policy exposes a row, and all table
privileges are revoked from `PUBLIC`, `anon`, and `authenticated`. Browser
roles access only `watchflow_take_tmdb_rate_limit(text, integer)`.

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

The confirmed target already has
`watchflow_schedule_movie(uuid,timestamptz,text,text)`, authenticated EXECUTE,
the invoker queue-normalization function, the required `user_movies` privileges
and ownership policies, profile SELECT, and ownership-based profile UPDATE RLS.
The scheduling RPC is `SECURITY INVOKER` and explicitly updates both
`profiles.timezone` and `profiles.updated_at`. Authenticated could update the
first column but not the second, so PostgreSQL rejected the profile update
before the owned movie schedule could commit.

Migration `202608030001_schedule_profile_permissions.sql` is the focused fix:

```sql
grant update (timezone, updated_at)
  on table public.profiles
  to authenticated;
```

The patch leaves profile and `user_movies` RLS enabled, preserves the existing
ownership policies, does not recreate either Part 15 scheduling function, and
does not grant unrestricted profile UPDATE or anything to `PUBLIC`/`anon`.
It was created locally on 2026-08-03 but was not applied to Supabase by this
task. Consequently, post-patch owner/cross-user scheduling, timezone
persistence, and queue-normalization retesting was not run against the live
database and remains pending after manual application.

The duplicate ownership-equivalent `user_movies` SELECT and UPDATE policies
were reviewed and retained. The repository lacks the original base policy
migration, and current regression coverage does not prove that removing either
deployed policy set is safe.

## RLS expectations

RLS is already configured and must not be disabled or bypassed. The intended
security properties are:

- Members can access only their own `profiles` row.
- Members can access only their own associations in `user_movies`.
- Members can select, create, update, and delete only their own `lists`.
- A `list_movies` row is accessible only when both its parent list and its
  referenced `user_movies` row belong to the current `auth.uid()`.
- Access to shared `movies` rows follows the deployed read policies; the
  server-only secret-key client is used only for authenticated TMDB metadata
  upserts into this shared table.
- All `profiles`, `user_movies`, `lists`, and `list_movies` operations use the
  member's cookie-bound client and JWT. Security-invoker functions remain
  subject to RLS.
- Neither `anon` nor `authenticated` can read or write the internal limiter
  table directly. The limiter RPC derives the authenticated owner.

These are security expectations, not a replacement for reviewing the deployed
policy SQL before Phase 2 writes are introduced.

Part 10B also adds `watchflow_add_user_movie(bigint)`. The security-invoker
function derives its owner from `auth.uid()`, reads that owner's default status
and priority, assigns a serialized Watch Next position when needed, and returns
`added` or `duplicate`. Only `authenticated` can execute it.

## Part 12 library query and bulk contract

Migration `202607280001_part_12_library_improvements.sql` adds `favourite`,
narrow authenticated column privileges, and five focused indexes:

| Index | Query supported |
|---|---|
| `user_movies_library_created_at_idx` | Owner-scoped added-newest/oldest pagination with stable ID |
| `user_movies_library_status_created_at_idx` | Exact status/watched filtering plus default order |
| `user_movies_library_favourite_created_at_idx` | Favourite filtering and favourites-first order |
| `user_movies_library_personal_rating_idx` | Non-null personal-rating ranges and rated-first sorts |
| `user_movies_library_watched_at_idx` | Non-null recently-watched ordering |

Existing unique movie, Watch Next, and schedule indexes are not duplicated.
Shared title/director/genre or trigram indexes are deferred: the current target
is an owner-scoped join of several hundred to about 1,000 relationships.

`watchflow_library_rows(...)` is a flat, stable, security-invoker relation.
It derives the owner from `auth.uid()`, filters before PostgREST applies exact
count/order/range, and accepts no user ID. Literal substring search covers
title, original title, director, JSONB cast names, and JSONB genre labels.
`watchflow_library_filter_options()` returns only that owner's normalized
genres, directors, release years, and All/Watched/Unwatched/Favourites counts.

`watchflow_bulk_update_library_status(uuid[], text)` and
`watchflow_bulk_remove_library_movies(uuid[])` validate at most 100 unique IDs,
take the existing per-user advisory queue lock, reject a mixed stale or foreign
selection before mutation, and normalize the queue transactionally. Bulk
`scheduled` is excluded because a valid date/time cannot be invented. Entering
Watch Next appends new rows in submitted order; leaving it compacts the queue.
Status changes preserve `watched_at` and latent schedule fields. Bulk deletion
touches only owned `user_movies`, never shared `movies`.

All Part 12 functions are `security invoker`, revoke execution from
`public`/`anon`, and grant execution only to `authenticated`. Existing RLS and
table privileges still apply. The repository cannot prove the base
INSERT/DELETE policies or grants, so inspect them on the target project and
exercise all functions with two users after applying the migration.

The 2026-07-28 logged-out Playwright pass does not establish that this migration
is applied. It never invokes these authenticated functions and therefore does
not verify grants, RLS, result counts, mixed-owner rejection, queue compaction,
or index behavior.

## Part 13 private custom-list contract

Migration `202607290001_part_13_private_custom_lists.sql` creates the private
custom-list schema and ordering architecture. It is version controlled but is
**manual and not known to be applied** to the target Supabase project. Do not
run it remotely automatically or infer deployment from source-level tests.

### Indexes and query justification

| Index or constraint-backed index | Columns/expression | Query supported and justification |
|---|---|---|
| `lists_user_normalized_name_key` | `user_id`, normalized lowercase/trimmed/collapsed-whitespace name | Enforces case-insensitive duplicate-name prevention per owner and supports an owner/name conflict lookup |
| `lists_user_updated_at_idx` | `user_id, updated_at desc` | Supports `/lists` owner filtering and most-recently-updated ordering |
| `list_movies_list_user_movie_key` | Unique `(list_id, user_movie_id)` | Prevents duplicate membership and supports already-in-list checks; a separate index with the same leading columns would be redundant |
| `list_movies_list_position_key` | Deferrable unique `(list_id, position)` | Supports ordered list-detail reads and guarantees one saved position per list; a separate `(list_id, position)` index would be redundant |
| `list_movies_user_movie_id_idx` | `user_movie_id` | Supports reverse membership reads on movie detail and the `user_movies` delete cascade |

Primary keys supply their normal UUID indexes. No direct `movies` or TMDB index
is needed because membership intentionally starts from `user_movies`.

### RLS and scoped privileges

RLS is enabled on both new tables. The migration creates exactly eight
authenticated policies:

| Policy | Operation | Ownership rule |
|---|---|---|
| `watchflow_lists_select_own` | SELECT | Parent `lists.user_id = auth.uid()` |
| `watchflow_lists_insert_own` | INSERT | New `lists.user_id = auth.uid()` |
| `watchflow_lists_update_own` | UPDATE | Both old and new list rows belong to `auth.uid()` |
| `watchflow_lists_delete_own` | DELETE | Parent `lists.user_id = auth.uid()` |
| `watchflow_list_movies_select_own` | SELECT | Both the parent list and referenced `user_movies` row belong to `auth.uid()` |
| `watchflow_list_movies_insert_own` | INSERT | Both the proposed parent list and proposed `user_movies` row belong to `auth.uid()` |
| `watchflow_list_movies_update_own` | UPDATE | Both ownership checks apply to the old and new membership |
| `watchflow_list_movies_delete_own` | DELETE | Both the parent list and referenced `user_movies` row belong to `auth.uid()` |

All table privileges are revoked from `PUBLIC`, `anon`, and `authenticated`
before the following narrow authenticated grants are applied:

- `lists`: table-level SELECT and DELETE; column INSERT for `user_id`, `name`,
  and `description`; column UPDATE for `name`, `description`, and
  trigger-controlled `updated_at`.
- `list_movies`: table-level SELECT and DELETE; column INSERT for `list_id`,
  `user_movie_id`, and `position`; column UPDATE for `position`.
- `anon` receives no list table or function privilege.

These grants keep IDs, visibility, ownership references, and creation audit
fields outside normal direct updates. `visibility` also has a database check
that restricts it to `private`.

### Atomic RPC contract

All six application RPCs are `security invoker`, use
`search_path = public, pg_temp`, derive identity from `auth.uid()`, remain
subject to RLS and scoped table privileges, revoke execution from `PUBLIC` and
`anon`, and grant execution only to `authenticated`. None accepts `user_id`.

| Signature | Result and behavior |
|---|---|
| `watchflow_normalize_list_positions(uuid)` | JSONB `{ success, normalized, item_count }`, or a nonrevealing `reason: "not_found"` result. Locks the owned list and its items, orders damaged values by position with nulls last then creation/UUID ties, and restores `1..N`. |
| `watchflow_move_list_item(uuid, text)` | JSONB `{ success, moved, list_id, final_position }`. Accepts `up` or `down`; first-up and last-down are successful no-ops. |
| `watchflow_add_movies_to_list(uuid, uuid[])` | JSONB `{ success, list_id, requested, matched, added_count, skipped_count, reason? }`. Accepts 1 through 100 unique, non-null `user_movies.id` values, rejects a mixed stale/foreign selection without partial mutation, skips existing memberships, and appends new rows in submitted ordinality. |
| `watchflow_remove_movie_from_list(uuid)` | JSONB `{ success, removed, list_id, final_count, reason? }`. Deletes one owned `list_movies` row only; the delete trigger compacts the list before the statement returns. |
| `watchflow_set_movie_list_memberships(uuid, uuid[])` | JSONB `{ success, requested, added_count, removed_count, unchanged_count, reason? }`. Accepts an empty desired set and up to 500 unique list IDs, preserves existing order, removes deselected memberships, and appends newly selected memberships. |
| `watchflow_list_summaries()` | A private rowset containing `list_id`, name, description, visibility, timestamps, `movie_count`, and up to four ordered non-null poster paths. It returns all owner summaries in one query and avoids one request per list/poster. |

The global mutation lock order is deliberate: membership changes first take
the same per-user advisory lock as Part 12, then lock owned `user_movies` rows
in Part 12's queue-position/creation-time/UUID order, followed by affected
per-list advisory locks in stable UUID order, parent `lists` rows, and ordered
`list_movies` rows. This matches Part 12 bulk relationship deletion, whose
foreign-key cascade reaches list compaction while its `user_movies` rows are
already locked, and avoids the opposite-order deadlock between bulk library
deletion and list additions. Concurrent full-library account-control deletion
still requires live stress verification because its legacy direct DELETE does
not participate in the shared advisory lock.

Normalization defers `list_movies_list_position_key`, assigns every affected
row a positive temporary position, then writes final sequential positions in a
second stage. Adjacent moves use one temporary `N + 1` slot. The non-deferrable
`list_movies_list_user_movie_key` remains the explicit `ON CONFLICT` arbiter
for duplicate membership; the deferrable position constraint is never used as
an upsert arbiter.

`watchflow_list_movies_compact_after_delete` is an AFTER DELETE,
statement-level transition-table trigger. Its non-public helper,
`watchflow_compact_lists_after_membership_delete()`, collects distinct
surviving affected lists, locks them in stable order, updates their activity
timestamp, and normalizes each once. It covers explicit membership removal and
the `user_movies on delete cascade` path used by individual, bulk, and
full-library deletion. A parent-list cascade finds no surviving list and never
touches `user_movies` or shared `movies`.

The existing `watchflow_set_updated_at()` function is reused by
`watchflow_lists_updated_at` and `watchflow_list_movies_updated_at`; Part 13
does not create a competing timestamp function.

### Manual Part 13 verification SQL

Run this read-only verification after manually applying
`supabase/migrations/202607290001_part_13_private_custom_lists.sql`. Expected
results are two resolved tables with RLS enabled, the documented columns and
constraints, eight policies, all expected indexes/triggers, authenticated-only
execution on the six public RPCs, and the scoped privilege matrix.

```sql
-- Tables and columns.
select
  to_regclass('public.lists') as lists_table,
  to_regclass('public.list_movies') as list_movies_table;

select
  table_name,
  ordinal_position,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('lists', 'list_movies')
order by table_name, ordinal_position;

-- RLS must be enabled on both tables.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class as c
inner join pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('lists', 'list_movies')
order by c.relname;

-- PK/FK/check/unique definitions, including cascades and deferrability.
select
  conrelid::regclass as table_name,
  conname,
  contype,
  condeferrable,
  condeferred,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in (
  'public.lists'::regclass,
  'public.list_movies'::regclass
)
order by conrelid::regclass::text, conname;

-- Explicit and constraint-backed indexes.
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('lists', 'list_movies')
order by tablename, indexname;

-- Exactly four ownership policies per table.
select
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('lists', 'list_movies')
order by tablename, policyname;

-- Timestamp and cascade-compaction triggers.
select
  c.relname as table_name,
  t.tgname as trigger_name,
  pg_get_triggerdef(t.oid) as definition
from pg_trigger as t
inner join pg_class as c on c.oid = t.tgrelid
inner join pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('lists', 'list_movies')
  and not t.tgisinternal
order by c.relname, t.tgname;

-- All six application RPC signatures must resolve.
with expected(signature) as (
  values
    ('public.watchflow_normalize_list_positions(uuid)'),
    ('public.watchflow_move_list_item(uuid,text)'),
    ('public.watchflow_add_movies_to_list(uuid,uuid[])'),
    ('public.watchflow_remove_movie_from_list(uuid)'),
    ('public.watchflow_set_movie_list_memberships(uuid,uuid[])'),
    ('public.watchflow_list_summaries()')
)
select signature, to_regprocedure(signature) as resolved_function
from expected
order by signature;

-- Authenticated can execute each public RPC; anon and PUBLIC cannot.
with expected(signature) as (
  values
    ('public.watchflow_normalize_list_positions(uuid)'),
    ('public.watchflow_move_list_item(uuid,text)'),
    ('public.watchflow_add_movies_to_list(uuid,uuid[])'),
    ('public.watchflow_remove_movie_from_list(uuid)'),
    ('public.watchflow_set_movie_list_memberships(uuid,uuid[])'),
    ('public.watchflow_list_summaries()')
),
resolved as (
  select signature, to_regprocedure(signature) as function_oid
  from expected
)
select
  resolved.signature,
  has_function_privilege(
    'authenticated',
    resolved.function_oid,
    'EXECUTE'
  ) as authenticated_execute,
  has_function_privilege(
    'anon',
    resolved.function_oid,
    'EXECUTE'
  ) as anon_execute,
  not exists (
    select 1
    from pg_proc as p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) as acl
    where p.oid = resolved.function_oid
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) as public_execute_revoked
from resolved
order by resolved.signature;

-- The trigger helper exists but is not callable by authenticated or anon.
select
  to_regprocedure(
    'public.watchflow_compact_lists_after_membership_delete()'
  ) as compact_trigger_helper,
  has_function_privilege(
    'authenticated',
    'public.watchflow_compact_lists_after_membership_delete()',
    'EXECUTE'
  ) as authenticated_execute,
  has_function_privilege(
    'anon',
    'public.watchflow_compact_lists_after_membership_delete()',
    'EXECUTE'
  ) as anon_execute;

-- Only SELECT/DELETE are table-level authenticated privileges.
with expected(table_name, privilege_type, should_have) as (
  values
    ('lists', 'SELECT', true),
    ('lists', 'DELETE', true),
    ('lists', 'INSERT', false),
    ('lists', 'UPDATE', false),
    ('list_movies', 'SELECT', true),
    ('list_movies', 'DELETE', true),
    ('list_movies', 'INSERT', false),
    ('list_movies', 'UPDATE', false)
)
select
  table_name,
  privilege_type,
  should_have,
  has_table_privilege(
    'authenticated',
    format('public.%I', table_name),
    privilege_type
  ) as authenticated_has_privilege,
  has_table_privilege(
    'anon',
    format('public.%I', table_name),
    privilege_type
  ) as anon_has_privilege
from expected
order by table_name, privilege_type;

-- Allowed and representative denied column privileges must match.
with expected(
  table_name,
  column_name,
  privilege_type,
  should_have
) as (
  values
    ('lists', 'user_id', 'INSERT', true),
    ('lists', 'name', 'INSERT', true),
    ('lists', 'description', 'INSERT', true),
    ('lists', 'name', 'UPDATE', true),
    ('lists', 'description', 'UPDATE', true),
    ('lists', 'updated_at', 'UPDATE', true),
    ('lists', 'id', 'INSERT', false),
    ('lists', 'id', 'UPDATE', false),
    ('lists', 'user_id', 'UPDATE', false),
    ('lists', 'visibility', 'INSERT', false),
    ('lists', 'visibility', 'UPDATE', false),
    ('lists', 'created_at', 'INSERT', false),
    ('lists', 'created_at', 'UPDATE', false),
    ('list_movies', 'list_id', 'INSERT', true),
    ('list_movies', 'user_movie_id', 'INSERT', true),
    ('list_movies', 'position', 'INSERT', true),
    ('list_movies', 'position', 'UPDATE', true),
    ('list_movies', 'id', 'INSERT', false),
    ('list_movies', 'id', 'UPDATE', false),
    ('list_movies', 'list_id', 'UPDATE', false),
    ('list_movies', 'user_movie_id', 'UPDATE', false),
    ('list_movies', 'created_at', 'INSERT', false),
    ('list_movies', 'updated_at', 'UPDATE', false)
)
select
  table_name,
  column_name,
  privilege_type,
  should_have,
  has_column_privilege(
    'authenticated',
    format('public.%I', table_name),
    column_name,
    privilege_type
  ) as authenticated_has_privilege,
  has_column_privilege(
    'anon',
    format('public.%I', table_name),
    column_name,
    privilege_type
  ) as anon_has_privilege
from expected
order by table_name, column_name, privilege_type;
```

After the migration transaction commits and the verification above is
satisfactory, run the PostgREST schema refresh as a **separate manual step**:

```sql
notify pgrst, 'reload schema';
```

Source-level migration, validation, and adapter tests do not prove that the SQL
is applied. Live sign-off still requires two authenticated users to exercise
all eight RLS policies, stale/foreign identifiers, normalized duplicate names,
multi-add order, boundary moves, simultaneous reorders/adds/deletes, the
`user_movies` cascade trigger, and preservation of shared movie metadata.

## Part 14 read-only discovery contract

Part 14 requires **no database migration**. It creates no recommendation or
picker table, feedback table, stored result, index, trigger, policy, grant, or
RPC. Generated picks, recommendation sections, refresh order, and recent-pick
history are not persisted.

`lib/discovery/supabase-discovery.ts` performs one bounded authenticated read
for both `/picker` and `/recommendations`. `getDiscoveryDataset()`:

1. creates the normal cookie-bound Supabase SSR client;
2. calls `supabase.auth.getUser()` and rejects an expired or missing session;
3. queries `public.user_movies` with both RLS and an explicit
   `user_id = authenticatedUser.id` filter;
4. inner-joins the existing shared `public.movies` row;
5. orders relationships by `created_at desc, id asc`; and
6. reads rows 0 through 999 while requesting an exact total count.

The application never accepts a discovery `user_id` from search parameters,
FormData, JSON, route parameters, or Client Component state. It does not select
or return `user_id` in the discovery dataset.

### Selected columns

The query intentionally selects only fields used by picker filtering,
recommendation scoring, reasons, and limited result cards:

| Source | Columns |
|---|---|
| `user_movies` | `id`, `status`, `favourite`, `personal_rating` |
| `movies` | `id`, `title`, `original_title`, `poster_path`, `release_year`, `runtime_minutes`, `genres`, `director`, `public_rating` |

`created_at` is used only for query ordering and is not selected.

Reviews, schedule notes, profile data, list names, cast, overview, trailers,
provider credentials, Auth tokens, and other unrelated private fields are not
part of this read.

`movies.genres` remains the existing required JSONB field. Defensive mapping
accepts either string labels or object values with a `name`, normalizes
whitespace, ignores blanks and malformed items, deduplicates labels without
case sensitivity, and sorts them. Invalid runtime, year, rating, status, or
relationship identifiers are safely nulled or omitted rather than trusted.

### Existing indexes and authorization

The current target is several hundred to approximately 1,000 relationships per
member, processed once per private request. The existing `user_movies` owner,
status/created-at, favourite/created-at, personal-rating, and watched-at
indexes from Part 12 already support the relationship side of this workload.
No measured query plan justifies an additional JSONB genre, shared rating,
runtime, release-year, or director index for this bounded MVP query.

Discovery uses the normal authenticated client and existing RLS; it never
constructs the admin client. The adapter logs database failures only through
the existing safe helper and distinguishes expired authentication, missing
schema/columns, relationship/schema-cache failures, permission/RLS denial, and
general database failure.

The optional “Add to Watch Next” control reuses
`watchflow_bulk_update_library_status(uuid[], text)` with one validated
`user_movies.id`, so all existing queue locking and normalization rules remain
authoritative. Custom-list management continues through the Part 13
membership architecture. Merely viewing, picking, or refreshing a
recommendation performs no database mutation.

## Part 15 rate limit, cache, and readiness contract

### Rate-limit migration

`supabase/migrations/202607300001_part_15_tmdb_rate_limits.sql` is the one
focused Part 15 schema patch. It:

1. adds nullable `movies.tmdb_adult` and `movies.metadata_language`;
2. repairs preference rows whose default is `scheduled` and replaces that
   check with the six safe default statuses;
3. revokes table- and column-level browser writes on shared `movies` while
   granting authenticated SELECT;
4. replaces management/scheduling RPCs so mutation and queue compaction are
   transactional;
5. creates the private internal limiter table described above; and
6. creates the authenticated limiter function.

`watchflow_take_tmdb_rate_limit(text, integer)` is `security definer` because
normal roles have no table privilege or policy. It uses an empty search path,
fully qualified object names, `auth.uid()`, hardcoded operation limits,
validated positive cost, a user/operation advisory transaction lock, and a row
lock. It returns only `allowed`, `remaining`, `retry_after_seconds`, `limit`,
and `window_seconds`.

| Operation | Limit | Fixed window |
|---|---:|---:|
| `search` | 30 | 60 seconds |
| `details` | 20 | 60 seconds |
| `import_search` | 120 | 600 seconds |
| `import_details` | 120 | 600 seconds |

Execution is revoked from `PUBLIC` and `anon` and granted to `authenticated`.
No current unauthenticated route calls TMDB.

### Persistent metadata cache

Shared `movies` rows are cacheable; personal relationships are not. An existing
shared row can satisfy a detail request only when:

- `metadata_updated_at` is no more than 30 days old and is not a future value;
- `metadata_language` is the canonical detail locale `en`;
- `tmdb_adult` is non-null; and
- an adult-classified row is not reused for a member who disallows adult
  results.

A stale/missing/incompatible row is refreshed through the authenticated,
rate-limited, server-only provider and upserted on unique `tmdb_id`.
Per-process promise maps deduplicate simultaneous identical requests. They are
not the cross-instance boundary: the PostgreSQL rate counter and existing
unique constraint remain authoritative. Private `user_movies`, lists,
preferences, exports, picker datasets, and recommendations are never stored in
a shared application cache.

### Index audit

Part 15 reviewed existing primary, unique, partial, and query indexes before
adding anything:

- Part 12 owner/status/favourite/rating/watched indexes support the library and
  bounded discovery relationship queries.
- The existing queue/schedule indexes support status, queue position, and
  scheduled instant access.
- Part 13's owner/update, list/position, list/movie, and reverse-membership
  structures support list summaries/details and cascades.
- `movies.tmdb_id` already supplies the metadata upsert/cache lookup.
- The new limiter primary key supports its exact user/operation access.

No speculative title/director/genre/metadata timestamp index was added.
List summaries and legacy dashboard/schedule reads require measured Preview
plans before further indexing or pagination.

### Read-only verification

Use database objects—not migration-history rows—as the source of truth:

- `supabase/verification/development_readiness.sql` reports required tables,
  columns, RLS, policy operations, functions/execute grants, function
  hardening, constraints/cascades, indexes, triggers, profile/preference
  backfill gaps, the exact effective profile UPDATE-column matrix/no table-level
  UPDATE, and historical regression objects as `INSTALLED` or `MISSING`.
- `supabase/verification/production_security_audit.sql` reports table scopes,
  all policies, effective/raw authenticated and anonymous privileges, limiter
  exposure, and findings for missing ownership or unrestricted-true policies.

Both files are catalog/read-only queries and do not depend on Supabase's
migration-history table. Run them manually against the intended development or
Preview database and investigate every missing/review result.

### Part 15 application history and scheduling patch

Part 15 originally recorded its migration as locally created and unapplied.
The current confirmed target inspection now establishes that the scheduling
RPC, its authenticated EXECUTE privilege, `watchflow_normalize_queue()`, the
required `user_movies` privileges and ownership policies, and the relevant
profile access are present. Those selected objects do not independently prove
the complete Part 15 migration ledger or parity for unrelated limiter/cache
objects.

Do not rerun or rewrite
`supabase/migrations/202607300001_part_15_tmdb_rate_limits.sql` on the inspected
target. Apply only the new focused
`supabase/migrations/202608030001_schedule_profile_permissions.sql` after
review, then run the read-only verification scripts and retest with two
disposable authenticated users. The owner test must persist the requested
instant and timezone and preserve queue normalization; the other user's call
must return no success and make no change.

This task created the patch but did not apply it to Supabase, and no post-patch
live scheduling retest was run. Vitest migration contracts prove only the SQL
and application error-handling contracts, not target installation or live RLS
behavior. Fresh targets still require the full ordered migration history
through the normal reviewed deployment process; no migration should be applied
blindly to an unknown or production project.

## Schema-change policy

Schema changes are represented as reviewable migrations, preserve RLS, include
indexes for common filters, and should be tested as at least two distinct users
to verify tenant isolation. Apply the Phase 3 migration before deploying the
Phase 3 application code.

## Part 10A CSV import data behavior

CSV import requires no schema migration. It writes only the existing shared
`movies` and private `user_movies` tables and retains all existing RLS policies
and constraints.

For a confirmed TMDB selection, the authenticated metadata resolver first
checks the shared `movies` cache. A safe fresh row is reused; otherwise the
import-details allowance is consumed, complete provider metadata is fetched,
and the server-only secret-key client upserts by unique `tmdb_id`. The member's
authenticated SSR client then checks and inserts `user_movies` with the identity
returned by `auth.getUser()`. Browser input does not contain or control
`user_id`.

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
`watchflow_normalize_queue()` security-invoker function after the batch. Import
searches and details use their separate durable rate-limit buckets. The admin
client never reads or mutates queue or personal-library data.

## Part 10B export and deletion behavior

Exports do not create database objects or persisted files. CSV and JSON Route
Handlers select explicit private columns through the authenticated client and
filter `profiles.id`, `user_preferences.user_id`, and `user_movies.user_id` by
the ID returned from `auth.getUser()`.

Deleting a library removes only the current user's `user_movies` rows. It never
deletes `movies`. Complete account deletion calls the Auth admin API only after
server-side identity and confirmation checks. The intended target contract is
for Auth foreign-key cascades to remove user-owned profile, preference,
library, list, and membership data while shared movie metadata remains. The
base profile/user-movie foreign keys are not version-controlled here, so that
contract must be confirmed with the readiness script and the dedicated
disposable-account deletion test before release.
