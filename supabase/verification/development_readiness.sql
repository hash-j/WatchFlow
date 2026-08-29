-- WatchFlow development/Preview database readiness verification.
-- Read-only: this file inspects catalogs and reports data-backfill counts.
-- Migration history is intentionally not used as the source of truth.

-- 1. Required tables.
with expected(table_name) as (
  values
    ('profiles'),
    ('movies'),
    ('user_movies'),
    ('user_preferences'),
    ('lists'),
    ('list_movies'),
    ('watchflow_tmdb_rate_limits')
)
select
  expected.table_name as object_name,
  case
    when pg_catalog.to_regclass(
      format('public.%I', expected.table_name)
    ) is null then 'MISSING'
    else 'INSTALLED'
  end as status
from expected
order by expected.table_name;

-- 2. Required columns. Actual types are returned for manual parity review.
with expected(table_name, column_name) as (
  values
    ('profiles', 'id'),
    ('profiles', 'full_name'),
    ('profiles', 'avatar_url'),
    ('profiles', 'country'),
    ('profiles', 'timezone'),
    ('profiles', 'subscription_plan'),
    ('profiles', 'created_at'),
    ('profiles', 'updated_at'),
    ('profiles', 'onboarding_completed_at'),
    ('movies', 'id'),
    ('movies', 'tmdb_id'),
    ('movies', 'title'),
    ('movies', 'original_title'),
    ('movies', 'overview'),
    ('movies', 'poster_path'),
    ('movies', 'backdrop_path'),
    ('movies', 'release_date'),
    ('movies', 'release_year'),
    ('movies', 'runtime_minutes'),
    ('movies', 'genres'),
    ('movies', 'director'),
    ('movies', 'main_cast'),
    ('movies', 'original_language'),
    ('movies', 'production_countries'),
    ('movies', 'public_rating'),
    ('movies', 'trailer_key'),
    ('movies', 'metadata_updated_at'),
    ('movies', 'tmdb_adult'),
    ('movies', 'metadata_language'),
    ('user_movies', 'id'),
    ('user_movies', 'user_id'),
    ('user_movies', 'movie_id'),
    ('user_movies', 'status'),
    ('user_movies', 'personal_rating'),
    ('user_movies', 'review'),
    ('user_movies', 'priority'),
    ('user_movies', 'queue_position'),
    ('user_movies', 'scheduled_for'),
    ('user_movies', 'schedule_timezone'),
    ('user_movies', 'schedule_note'),
    ('user_movies', 'watched_at'),
    ('user_movies', 'would_watch_again'),
    ('user_movies', 'favourite'),
    ('user_movies', 'created_at'),
    ('user_movies', 'updated_at'),
    ('user_preferences', 'user_id'),
    ('user_preferences', 'default_movie_status'),
    ('user_preferences', 'default_priority'),
    ('user_preferences', 'default_library_view'),
    ('user_preferences', 'date_format'),
    ('user_preferences', 'time_format'),
    ('user_preferences', 'show_adult_results'),
    ('user_preferences', 'include_unreleased_movies'),
    ('user_preferences', 'preferred_language'),
    ('user_preferences', 'movies_per_page'),
    ('user_preferences', 'email_notifications_enabled'),
    ('user_preferences', 'schedule_reminders_enabled'),
    ('user_preferences', 'reminder_offset_minutes'),
    ('user_preferences', 'weekly_summary_enabled'),
    ('user_preferences', 'created_at'),
    ('user_preferences', 'updated_at'),
    ('lists', 'id'),
    ('lists', 'user_id'),
    ('lists', 'name'),
    ('lists', 'description'),
    ('lists', 'visibility'),
    ('lists', 'created_at'),
    ('lists', 'updated_at'),
    ('list_movies', 'id'),
    ('list_movies', 'list_id'),
    ('list_movies', 'user_movie_id'),
    ('list_movies', 'position'),
    ('list_movies', 'created_at'),
    ('list_movies', 'updated_at'),
    ('watchflow_tmdb_rate_limits', 'user_id'),
    ('watchflow_tmdb_rate_limits', 'operation'),
    ('watchflow_tmdb_rate_limits', 'window_started_at'),
    ('watchflow_tmdb_rate_limits', 'request_count'),
    ('watchflow_tmdb_rate_limits', 'updated_at')
)
select
  expected.table_name || '.' || expected.column_name as object_name,
  case when columns.column_name is null then 'MISSING' else 'INSTALLED' end
    as status,
  columns.data_type,
  columns.udt_name,
  columns.is_nullable,
  columns.column_default
from expected
left join information_schema.columns as columns
  on columns.table_schema = 'public'
 and columns.table_name = expected.table_name
 and columns.column_name = expected.column_name
order by expected.table_name, expected.column_name;

-- Cache-safety fields must remain nullable and have no default. Existing
-- shared rows are unsafe to reuse until both values are populated by refresh.
with expected(column_name) as (
  values ('tmdb_adult'), ('metadata_language')
)
select
  'movies.' || expected.column_name as object_name,
  case
    when columns.column_name is not null
      and columns.is_nullable = 'YES'
      and columns.column_default is null
      then 'INSTALLED'
    else 'MISSING'
  end as status,
  columns.is_nullable,
  columns.column_default
from expected
left join information_schema.columns as columns
  on columns.table_schema = 'public'
 and columns.table_name = 'movies'
 and columns.column_name = expected.column_name
order by expected.column_name;

-- 3. RLS state for every application table.
with expected(table_name) as (
  values
    ('profiles'),
    ('movies'),
    ('user_movies'),
    ('user_preferences'),
    ('lists'),
    ('list_movies'),
    ('watchflow_tmdb_rate_limits')
)
select
  expected.table_name as object_name,
  case
    when tables.oid is null then 'MISSING'
    when not tables.relrowsecurity then 'MISSING'
    else 'INSTALLED'
  end as status,
  coalesce(tables.relrowsecurity, false) as rls_enabled,
  coalesce(tables.relforcerowsecurity, false) as rls_forced
from expected
left join (
  select classes.oid, classes.relname, classes.relrowsecurity,
    classes.relforcerowsecurity
  from pg_catalog.pg_class as classes
  inner join pg_catalog.pg_namespace as namespaces
    on namespaces.oid = classes.relnamespace
  where namespaces.nspname = 'public'
    and classes.relkind in ('r', 'p')
) as tables on tables.relname = expected.table_name
order by expected.table_name;

-- 4. Required RLS policy operations. The internal limiter deliberately has
-- zero policies and is checked separately.
with required(table_name, command_name, ownership_required) as (
  values
    ('profiles', 'SELECT', true),
    ('profiles', 'UPDATE', true),
    ('movies', 'SELECT', false),
    ('user_movies', 'SELECT', true),
    ('user_movies', 'INSERT', true),
    ('user_movies', 'UPDATE', true),
    ('user_movies', 'DELETE', true),
    ('user_preferences', 'SELECT', true),
    ('user_preferences', 'INSERT', true),
    ('user_preferences', 'UPDATE', true),
    ('lists', 'SELECT', true),
    ('lists', 'INSERT', true),
    ('lists', 'UPDATE', true),
    ('lists', 'DELETE', true),
    ('list_movies', 'SELECT', true),
    ('list_movies', 'INSERT', true),
    ('list_movies', 'UPDATE', true),
    ('list_movies', 'DELETE', true)
)
select
  required.table_name || '.' || required.command_name as object_name,
  case when exists (
    select 1
    from pg_catalog.pg_policies as policies
    where policies.schemaname = 'public'
      and policies.tablename = required.table_name
      and policies.cmd in (required.command_name, 'ALL')
      and (
        not required.ownership_required
        or case required.command_name
          when 'INSERT' then
            position('auth.uid()' in coalesce(policies.with_check, '')) > 0
          when 'UPDATE' then
            position('auth.uid()' in coalesce(policies.qual, '')) > 0
            and position(
              'auth.uid()' in coalesce(policies.with_check, '')
            ) > 0
          else
            position('auth.uid()' in coalesce(policies.qual, '')) > 0
        end
      )
  ) then 'INSTALLED' else 'MISSING' end as status
from required
order by required.table_name, required.command_name;

select
  'watchflow_tmdb_rate_limits.no_policies' as object_name,
  case when count(*) = 0 then 'INSTALLED' else 'MISSING' end as status,
  count(*) as actual_policy_count
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename = 'watchflow_tmdb_rate_limits';

-- 5. Required application RPCs.
with expected(signature) as (
  values
    ('public.watchflow_normalize_queue()'),
    (
      'public.watchflow_update_library_movie(uuid,text,numeric,text,smallint,boolean,timestamptz,timestamptz,text,text)'
    ),
    ('public.watchflow_schedule_movie(uuid,timestamptz,text,text)'),
    ('public.move_watch_queue_item(uuid,text)'),
    ('public.watchflow_add_user_movie(bigint)'),
    (
      'public.watchflow_library_rows(text,text,boolean,boolean,text,text,integer,integer,integer,numeric,numeric)'
    ),
    ('public.watchflow_library_filter_options()'),
    ('public.watchflow_bulk_update_library_status(uuid[],text)'),
    ('public.watchflow_bulk_remove_library_movies(uuid[])'),
    ('public.watchflow_normalize_list_positions(uuid)'),
    ('public.watchflow_move_list_item(uuid,text)'),
    ('public.watchflow_add_movies_to_list(uuid,uuid[])'),
    ('public.watchflow_remove_movie_from_list(uuid)'),
    ('public.watchflow_set_movie_list_memberships(uuid,uuid[])'),
    ('public.watchflow_list_summaries()'),
    ('public.watchflow_take_tmdb_rate_limit(text,integer)')
),
resolved as (
  select signature, pg_catalog.to_regprocedure(signature) as function_oid
  from expected
)
select
  signature as object_name,
  case
    when function_oid is null then 'MISSING'
    when not pg_catalog.has_function_privilege(
      'authenticated',
      function_oid,
      'EXECUTE'
    ) then 'MISSING'
    when pg_catalog.has_function_privilege(
      'anon',
      function_oid,
      'EXECUTE'
    ) then 'MISSING'
    else 'INSTALLED'
  end as status,
  function_oid as resolved_function,
  case
    when function_oid is null then false
    else pg_catalog.has_function_privilege(
      'authenticated',
      function_oid,
      'EXECUTE'
    )
  end as authenticated_execute,
  case
    when function_oid is null then false
    else pg_catalog.has_function_privilege('anon', function_oid, 'EXECUTE')
  end as anon_execute
from resolved
order by signature;

-- Trigger helpers must resolve even though normal clients do not call them.
with expected(signature) as (
  values
    ('public.watchflow_set_updated_at()'),
    ('public.watchflow_create_user_preferences()'),
    ('public.watchflow_compact_lists_after_membership_delete()')
)
select
  signature as object_name,
  case
    when pg_catalog.to_regprocedure(signature) is null then 'MISSING'
    else 'INSTALLED'
  end as status,
  pg_catalog.to_regprocedure(signature) as resolved_function
from expected
order by signature;

-- The only SECURITY DEFINER application RPC must have an empty fixed
-- search_path. All identity still comes from auth.uid().
with limiter as (
  select procedures.oid, procedures.prosecdef, procedures.proconfig
  from pg_catalog.pg_proc as procedures
  where procedures.oid = pg_catalog.to_regprocedure(
    'public.watchflow_take_tmdb_rate_limit(text,integer)'
  )
)
select
  'watchflow_take_tmdb_rate_limit.hardening' as object_name,
  case
    when limiter.oid is null then 'MISSING'
    when not limiter.prosecdef then 'MISSING'
    when not (
      coalesce(limiter.proconfig, array[]::text[])
        @> array['search_path=""']::text[]
      or coalesce(limiter.proconfig, array[]::text[])
        @> array['search_path=']::text[]
    ) then 'MISSING'
    else 'INSTALLED'
  end as status,
  limiter.prosecdef as security_definer,
  limiter.proconfig as function_configuration
from (select 1) as required
left join limiter on true;

-- 6. Required named constraints.
with expected(table_name, constraint_name) as (
  values
    ('movies', 'movies_metadata_language_check'),
    ('user_movies', 'user_movies_schedule_note_length'),
    ('user_movies', 'user_movies_queue_position_positive'),
    (
      'user_preferences',
      'user_preferences_default_movie_status_check'
    ),
    ('user_preferences', 'user_preferences_default_priority_check'),
    (
      'user_preferences',
      'user_preferences_default_library_view_check'
    ),
    ('user_preferences', 'user_preferences_date_format_check'),
    ('user_preferences', 'user_preferences_time_format_check'),
    (
      'user_preferences',
      'user_preferences_preferred_language_check'
    ),
    ('user_preferences', 'user_preferences_movies_per_page_check'),
    ('user_preferences', 'user_preferences_reminder_offset_check'),
    ('lists', 'lists_name_not_blank'),
    ('lists', 'lists_description_length'),
    ('lists', 'lists_private_visibility'),
    ('list_movies', 'list_movies_position_positive'),
    ('list_movies', 'list_movies_list_user_movie_key'),
    ('list_movies', 'list_movies_list_position_key'),
    (
      'watchflow_tmdb_rate_limits',
      'watchflow_tmdb_rate_limits_pkey'
    ),
    (
      'watchflow_tmdb_rate_limits',
      'watchflow_tmdb_rate_limits_operation_check'
    ),
    (
      'watchflow_tmdb_rate_limits',
      'watchflow_tmdb_rate_limits_request_count_check'
    )
)
select
  expected.table_name || '.' || expected.constraint_name as object_name,
  case when constraints.oid is null then 'MISSING' else 'INSTALLED' end
    as status,
  case
    when constraints.oid is null then null
    else pg_catalog.pg_get_constraintdef(constraints.oid)
  end as definition
from expected
left join pg_catalog.pg_constraint as constraints
  on constraints.conrelid = pg_catalog.to_regclass(
    format('public.%I', expected.table_name)
  )
 and constraints.conname = expected.constraint_name
order by expected.table_name, expected.constraint_name;

-- The default-status check must specifically exclude scheduled because an
-- automatic add has no schedule instant or timezone to persist.
select
  'user_preferences.default_status_schedule_safety' as object_name,
  case when exists (
    select 1
    from pg_catalog.pg_constraint as constraints
    where constraints.conrelid = pg_catalog.to_regclass(
      'public.user_preferences'
    )
      and constraints.conname =
        'user_preferences_default_movie_status_check'
      and position(
        '''scheduled''' in pg_catalog.pg_get_constraintdef(constraints.oid)
      ) = 0
      and position(
        '''want_to_watch''' in
          pg_catalog.pg_get_constraintdef(constraints.oid)
      ) > 0
      and position(
        '''watch_next''' in pg_catalog.pg_get_constraintdef(constraints.oid)
      ) > 0
      and position(
        '''currently_watching''' in
          pg_catalog.pg_get_constraintdef(constraints.oid)
      ) > 0
      and position(
        '''watched''' in pg_catalog.pg_get_constraintdef(constraints.oid)
      ) > 0
      and position(
        '''on_hold''' in pg_catalog.pg_get_constraintdef(constraints.oid)
      ) > 0
      and position(
        '''dropped''' in pg_catalog.pg_get_constraintdef(constraints.oid)
      ) > 0
  ) then 'INSTALLED' else 'MISSING' end as status;

-- Base duplicate guards do not have version-controlled names, so verify their
-- definitions structurally.
with required(table_name, columns_pattern) as (
  values
    ('movies', 'UNIQUE \(tmdb_id\)'),
    ('user_movies', 'UNIQUE \(user_id, movie_id\)')
)
select
  required.table_name || '.duplicate_guard' as object_name,
  case when exists (
    select 1
    from pg_catalog.pg_constraint as constraints
    where constraints.conrelid = pg_catalog.to_regclass(
      format('public.%I', required.table_name)
    )
      and constraints.contype in ('p', 'u')
      and pg_catalog.pg_get_constraintdef(constraints.oid)
        ~ required.columns_pattern
  ) then 'INSTALLED' else 'MISSING' end as status
from required
order by required.table_name;

-- Required Auth ownership cascades, including the new limiter.
with required(table_name, owner_column) as (
  values
    ('profiles', 'id'),
    ('user_movies', 'user_id'),
    ('user_preferences', 'user_id'),
    ('lists', 'user_id'),
    ('watchflow_tmdb_rate_limits', 'user_id')
)
select
  required.table_name || '.' || required.owner_column
    || '_auth_cascade' as object_name,
  case when exists (
    select 1
    from pg_catalog.pg_constraint as constraints
    where constraints.conrelid = pg_catalog.to_regclass(
      format('public.%I', required.table_name)
    )
      and constraints.contype = 'f'
      and constraints.confrelid = 'auth.users'::regclass
      and constraints.confdeltype = 'c'
      and pg_catalog.pg_get_constraintdef(constraints.oid)
        like 'FOREIGN KEY (' || required.owner_column
          || ') REFERENCES auth.users(id) ON DELETE CASCADE%'
  ) then 'INSTALLED' else 'MISSING' end as status
from required
order by required.table_name;

-- 7. Required named indexes, including constraint-backed list/limiter indexes.
with expected(index_name) as (
  values
    ('user_movies_watch_next_queue_idx'),
    ('user_movies_unique_watch_queue_position'),
    ('user_movies_schedule_idx'),
    ('user_movies_library_created_at_idx'),
    ('user_movies_library_status_created_at_idx'),
    ('user_movies_library_favourite_created_at_idx'),
    ('user_movies_library_personal_rating_idx'),
    ('user_movies_library_watched_at_idx'),
    ('lists_user_normalized_name_key'),
    ('lists_user_updated_at_idx'),
    ('list_movies_list_user_movie_key'),
    ('list_movies_list_position_key'),
    ('list_movies_user_movie_id_idx'),
    ('watchflow_tmdb_rate_limits_pkey')
)
select
  expected.index_name as object_name,
  case
    when pg_catalog.to_regclass(
      format('public.%I', expected.index_name)
    ) is null then 'MISSING'
    else 'INSTALLED'
  end as status,
  indexes.indexdef
from expected
left join pg_catalog.pg_indexes as indexes
  on indexes.schemaname = 'public'
 and indexes.indexname = expected.index_name
order by expected.index_name;

-- 8. Required triggers.
with expected(table_schema, table_name, trigger_name) as (
  values
    (
      'public',
      'user_preferences',
      'watchflow_user_preferences_updated_at'
    ),
    ('auth', 'users', 'watchflow_auth_user_preferences_created'),
    ('public', 'lists', 'watchflow_lists_updated_at'),
    ('public', 'list_movies', 'watchflow_list_movies_updated_at'),
    (
      'public',
      'list_movies',
      'watchflow_list_movies_compact_after_delete'
    )
)
select
  expected.table_schema || '.' || expected.table_name || '.'
    || expected.trigger_name as object_name,
  case when triggers.oid is null then 'MISSING' else 'INSTALLED' end
    as status,
  case
    when triggers.oid is null then null
    else pg_catalog.pg_get_triggerdef(triggers.oid)
  end as definition
from expected
left join (
  select
    triggers.oid,
    namespaces.nspname,
    tables.relname,
    triggers.tgname
  from pg_catalog.pg_trigger as triggers
  inner join pg_catalog.pg_class as tables on tables.oid = triggers.tgrelid
  inner join pg_catalog.pg_namespace as namespaces
    on namespaces.oid = tables.relnamespace
  where not triggers.tgisinternal
) as triggers
  on triggers.nspname = expected.table_schema
 and triggers.relname = expected.table_name
 and triggers.tgname = expected.trigger_name
order by expected.table_schema, expected.table_name, expected.trigger_name;

-- The legacy development project predates version-controlled migrations, so
-- its profile trigger name is not authoritative. Verify behavior without
-- inventing a legacy object name; the reconstructed FROM-ZERO baseline uses a
-- stable WatchFlow-owned name.
with profile_triggers as (
  select
    triggers.tgname,
    procedures.proname,
    pg_catalog.pg_get_functiondef(procedures.oid) as function_definition
  from pg_catalog.pg_trigger as triggers
  inner join pg_catalog.pg_class as tables on tables.oid = triggers.tgrelid
  inner join pg_catalog.pg_namespace as namespaces
    on namespaces.oid = tables.relnamespace
  inner join pg_catalog.pg_proc as procedures
    on procedures.oid = triggers.tgfoid
  where namespaces.nspname = 'auth'
    and tables.relname = 'users'
    and not triggers.tgisinternal
)
select
  'auth.users profile creation behavior' as object_name,
  case
    when exists (
      select 1
      from profile_triggers
      where function_definition ilike '%insert%'
        and function_definition ilike '%public.profiles%'
    ) then 'INSTALLED'
    else 'MISSING'
  end as status;

-- 9. Historical privilege regressions and limiter isolation.
with expected(
  object_name,
  role_name,
  table_name,
  privilege_type,
  should_have
) as (
  values
    (
      'user_preferences.authenticated_select',
      'authenticated',
      'user_preferences',
      'SELECT',
      true
    ),
    (
      'user_preferences.authenticated_insert',
      'authenticated',
      'user_preferences',
      'INSERT',
      true
    ),
    (
      'user_preferences.authenticated_update',
      'authenticated',
      'user_preferences',
      'UPDATE',
      true
    ),
    (
      'user_preferences.authenticated_delete',
      'authenticated',
      'user_preferences',
      'DELETE',
      false
    ),
    (
      'watchflow_tmdb_rate_limits.authenticated_select',
      'authenticated',
      'watchflow_tmdb_rate_limits',
      'SELECT',
      false
    ),
    (
      'watchflow_tmdb_rate_limits.authenticated_insert',
      'authenticated',
      'watchflow_tmdb_rate_limits',
      'INSERT',
      false
    ),
    (
      'watchflow_tmdb_rate_limits.authenticated_update',
      'authenticated',
      'watchflow_tmdb_rate_limits',
      'UPDATE',
      false
    ),
    (
      'watchflow_tmdb_rate_limits.authenticated_delete',
      'authenticated',
      'watchflow_tmdb_rate_limits',
      'DELETE',
      false
    ),
    (
      'watchflow_tmdb_rate_limits.anon_select',
      'anon',
      'watchflow_tmdb_rate_limits',
      'SELECT',
      false
    )
)
select
  expected.object_name,
  case
    when tables.oid is null then 'MISSING'
    when pg_catalog.has_table_privilege(
      expected.role_name,
      tables.oid,
      expected.privilege_type
    ) is distinct from expected.should_have then 'MISSING'
    else 'INSTALLED'
  end as status,
  expected.should_have,
  case
    when tables.oid is null then false
    else pg_catalog.has_table_privilege(
      expected.role_name,
      tables.oid,
      expected.privilege_type
    )
  end as actual
from expected
left join (
  select classes.oid, classes.relname
  from pg_catalog.pg_class as classes
  inner join pg_catalog.pg_namespace as namespaces
    on namespaces.oid = classes.relnamespace
  where namespaces.nspname = 'public'
    and classes.relkind in ('r', 'p')
) as tables on tables.relname = expected.table_name
order by expected.object_name;

-- The scheduling RPC is SECURITY INVOKER, so authenticated needs UPDATE on
-- both owned scheduling-related profile columns. The settings columns remain
-- intentionally editable, while identity, subscription, and creation fields
-- (plus any unexpected profile column) must remain denied. A table-level
-- UPDATE would make every column effective and therefore fail this matrix.
with profile_columns as (
  select
    tables.oid as table_oid,
    attributes.attnum,
    attributes.attname as column_name
  from pg_catalog.pg_class as tables
  inner join pg_catalog.pg_namespace as namespaces
    on namespaces.oid = tables.relnamespace
  inner join pg_catalog.pg_attribute as attributes
    on attributes.attrelid = tables.oid
  where namespaces.nspname = 'public'
    and tables.relname = 'profiles'
    and tables.relkind in ('r', 'p')
    and attributes.attnum > 0
    and not attributes.attisdropped
),
evaluated as (
  select
    profile_columns.*,
    profile_columns.column_name in (
      'full_name',
      'avatar_url',
      'country',
      'timezone',
      'updated_at',
      'onboarding_completed_at'
    ) as authenticated_should_have,
    pg_catalog.has_column_privilege(
      'authenticated',
      profile_columns.table_oid,
      profile_columns.attnum,
      'UPDATE'
    ) as authenticated_has,
    pg_catalog.has_column_privilege(
      'anon',
      profile_columns.table_oid,
      profile_columns.attnum,
      'UPDATE'
    ) as anon_has
  from profile_columns
)
select
  'profiles.update.' || evaluated.column_name as object_name,
  case
    when evaluated.authenticated_has is distinct from
      evaluated.authenticated_should_have then 'MISSING'
    when evaluated.anon_has then 'MISSING'
    else 'INSTALLED'
  end as status,
  evaluated.authenticated_should_have,
  evaluated.authenticated_has,
  evaluated.anon_has
from evaluated
order by evaluated.attnum;

select
  'profiles.authenticated_table_update' as object_name,
  case
    when pg_catalog.to_regclass('public.profiles') is null then 'MISSING'
    when pg_catalog.has_table_privilege(
      'authenticated',
      'public.profiles',
      'UPDATE'
    ) then 'MISSING'
    else 'INSTALLED'
  end as status,
  case
    when pg_catalog.to_regclass('public.profiles') is null then false
    else pg_catalog.has_table_privilege(
      'authenticated',
      'public.profiles',
      'UPDATE'
    )
  end as authenticated_table_update;

-- 10. Existing-user backfills. query_to_xml keeps relation lookup dynamic so
-- a missing prerequisite is reported instead of aborting the whole script.
with prerequisites as (
  select
    pg_catalog.to_regclass('auth.users') as users_table,
    pg_catalog.to_regclass('public.profiles') as profiles_table,
    pg_catalog.to_regclass(
      'public.user_preferences'
    ) as preferences_table
),
counts as (
  select
    prerequisites.*,
    case
      when users_table is null or profiles_table is null then null
      else (
        pg_catalog.xpath(
          '//missing_count/text()',
          pg_catalog.query_to_xml(
            'select count(*)::bigint as missing_count
             from auth.users as users
             left join public.profiles as profiles
               on profiles.id = users.id
             where profiles.id is null',
            false,
            true,
            ''
          )
        )
      )[1]::text::bigint
    end as missing_profiles,
    case
      when users_table is null or preferences_table is null then null
      else (
        pg_catalog.xpath(
          '//missing_count/text()',
          pg_catalog.query_to_xml(
            'select count(*)::bigint as missing_count
             from auth.users as users
             left join public.user_preferences as preferences
               on preferences.user_id = users.id
             where preferences.user_id is null',
            false,
            true,
            ''
          )
        )
      )[1]::text::bigint
    end as missing_preferences
  from prerequisites
)
select
  'profiles_backfill' as object_name,
  case
    when users_table is null or profiles_table is null then 'MISSING'
    when missing_profiles = 0 then 'INSTALLED'
    else 'MISSING'
  end as status,
  missing_profiles as missing_row_count
from counts
union all
select
  'user_preferences_backfill',
  case
    when users_table is null or preferences_table is null then 'MISSING'
    when missing_preferences = 0 then 'INSTALLED'
    else 'MISSING'
  end,
  missing_preferences
from counts
order by object_name;
