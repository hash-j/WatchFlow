-- WatchFlow Part 15 production security audit.
-- Read-only: this file performs catalog inspection only.
-- Run with a role that can inspect pg_catalog and the Supabase API roles.

-- 1. Required application tables and RLS state.
with expected_tables(table_name, data_scope) as (
  values
    ('profiles', 'user_owned'),
    ('movies', 'shared_read_only'),
    ('user_movies', 'user_owned'),
    ('user_preferences', 'user_owned'),
    ('lists', 'user_owned'),
    ('list_movies', 'user_owned'),
    ('watchflow_tmdb_rate_limits', 'internal_no_direct_access')
)
select
  expected.table_name,
  expected.data_scope,
  case when tables.oid is null then 'MISSING' else 'INSTALLED' end
    as table_status,
  coalesce(tables.relrowsecurity, false) as rls_enabled,
  coalesce(tables.relforcerowsecurity, false) as rls_forced,
  case
    when tables.oid is null then 'MISSING'
    when not tables.relrowsecurity then 'MISSING'
    else 'INSTALLED'
  end as protection_status
from expected_tables as expected
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

-- 2. Every actual policy on the expected tables. The internal limiter should
-- have no rows in this result other than the LEFT JOIN placeholder.
with expected_tables(table_name, data_scope) as (
  values
    ('profiles', 'user_owned'),
    ('movies', 'shared_read_only'),
    ('user_movies', 'user_owned'),
    ('user_preferences', 'user_owned'),
    ('lists', 'user_owned'),
    ('list_movies', 'user_owned'),
    ('watchflow_tmdb_rate_limits', 'internal_no_direct_access')
)
select
  expected.table_name,
  expected.data_scope,
  policies.policyname,
  policies.roles,
  policies.cmd,
  policies.permissive,
  policies.qual,
  policies.with_check,
  case
    when policies.policyname is null then 'NO_POLICY'
    when expected.data_scope = 'user_owned'
      and (
        position('auth.uid()' in coalesce(policies.qual, '')) = 0
        and position('auth.uid()' in coalesce(policies.with_check, '')) = 0
      )
      then 'REVIEW_OWNERSHIP'
    when expected.data_scope = 'user_owned'
      and (
        lower(regexp_replace(coalesce(policies.qual, ''), '\s', '', 'g'))
          in ('true', '(true)')
        or lower(
          regexp_replace(coalesce(policies.with_check, ''), '\s', '', 'g')
        ) in ('true', '(true)')
      )
      then 'UNSAFE_TRUE_POLICY'
    else 'INSTALLED'
  end as policy_status
from expected_tables as expected
left join pg_catalog.pg_policies as policies
  on policies.schemaname = 'public'
 and policies.tablename = expected.table_name
order by expected.table_name, policies.cmd, policies.policyname;

-- 3. Required ownership-policy operations. ALL policies may satisfy an
-- operation, but user-owned policies must still derive ownership from
-- auth.uid(). Shared movies need only their intended SELECT policy.
with required_policies(table_name, command_name, ownership_required) as (
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
  required.table_name,
  required.command_name,
  required.ownership_required,
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
from required_policies as required
order by required.table_name, required.command_name;

-- 4. Effective table/column privileges for authenticated and anon. An anon
-- result of true also catches a privilege inherited through PUBLIC.
with expected_privileges(
  table_name,
  privilege_type,
  authenticated_should_have
) as (
  values
    ('profiles', 'SELECT', true),
    ('profiles', 'INSERT', false),
    ('profiles', 'UPDATE', true),
    ('profiles', 'DELETE', false),
    ('movies', 'SELECT', true),
    ('movies', 'INSERT', false),
    ('movies', 'UPDATE', false),
    ('movies', 'DELETE', false),
    ('user_movies', 'SELECT', true),
    ('user_movies', 'INSERT', true),
    ('user_movies', 'UPDATE', true),
    ('user_movies', 'DELETE', true),
    ('user_preferences', 'SELECT', true),
    ('user_preferences', 'INSERT', true),
    ('user_preferences', 'UPDATE', true),
    ('user_preferences', 'DELETE', false),
    ('lists', 'SELECT', true),
    ('lists', 'INSERT', true),
    ('lists', 'UPDATE', true),
    ('lists', 'DELETE', true),
    ('list_movies', 'SELECT', true),
    ('list_movies', 'INSERT', true),
    ('list_movies', 'UPDATE', true),
    ('list_movies', 'DELETE', true),
    ('watchflow_tmdb_rate_limits', 'SELECT', false),
    ('watchflow_tmdb_rate_limits', 'INSERT', false),
    ('watchflow_tmdb_rate_limits', 'UPDATE', false),
    ('watchflow_tmdb_rate_limits', 'DELETE', false)
),
tables as (
  select classes.oid, classes.relname
  from pg_catalog.pg_class as classes
  inner join pg_catalog.pg_namespace as namespaces
    on namespaces.oid = classes.relnamespace
  where namespaces.nspname = 'public'
    and classes.relkind in ('r', 'p')
),
effective as (
  select
    expected.*,
    tables.oid,
    case
      when tables.oid is null then false
      when expected.privilege_type in ('SELECT', 'INSERT', 'UPDATE') then
        pg_catalog.has_table_privilege(
          'authenticated',
          tables.oid,
          expected.privilege_type
        )
        or pg_catalog.has_any_column_privilege(
          'authenticated',
          tables.oid,
          expected.privilege_type
        )
      else pg_catalog.has_table_privilege(
        'authenticated',
        tables.oid,
        expected.privilege_type
      )
    end as authenticated_has,
    case
      when tables.oid is null then false
      when expected.privilege_type in ('SELECT', 'INSERT', 'UPDATE') then
        pg_catalog.has_table_privilege(
          'anon',
          tables.oid,
          expected.privilege_type
        )
        or pg_catalog.has_any_column_privilege(
          'anon',
          tables.oid,
          expected.privilege_type
        )
      else pg_catalog.has_table_privilege(
        'anon',
        tables.oid,
        expected.privilege_type
      )
    end as anon_has
  from expected_privileges as expected
  left join tables on tables.relname = expected.table_name
)
select
  table_name,
  privilege_type,
  authenticated_should_have,
  authenticated_has,
  anon_has,
  case
    when oid is null then 'MISSING_TABLE'
    when authenticated_has is distinct from authenticated_should_have
      then 'MISSING'
    when anon_has then 'MISSING'
    else 'INSTALLED'
  end as status
from effective
order by table_name, privilege_type;

-- 5. Raw table and column ACL entries for browser/API roles.
select
  table_name,
  grantee,
  privilege_type,
  is_grantable
from information_schema.table_privileges
where table_schema = 'public'
  and table_name in (
    'profiles',
    'movies',
    'user_movies',
    'user_preferences',
    'lists',
    'list_movies',
    'watchflow_tmdb_rate_limits'
  )
  and grantee in ('authenticated', 'anon', 'PUBLIC')
order by table_name, grantee, privilege_type;

select
  table_name,
  column_name,
  grantee,
  privilege_type,
  is_grantable
from information_schema.column_privileges
where table_schema = 'public'
  and table_name in (
    'profiles',
    'movies',
    'user_movies',
    'user_preferences',
    'lists',
    'list_movies',
    'watchflow_tmdb_rate_limits'
  )
  and grantee in ('authenticated', 'anon', 'PUBLIC')
order by table_name, column_name, grantee, privilege_type;

-- 6. Limiter RPC hardening and direct-access isolation.
with limiter as (
  select
    procedures.oid,
    procedures.prosecdef,
    procedures.proconfig,
    procedures.proacl,
    procedures.proowner
  from pg_catalog.pg_proc as procedures
  where procedures.oid = pg_catalog.to_regprocedure(
    'public.watchflow_take_tmdb_rate_limit(text,integer)'
  )
)
select
  case when limiter.oid is null then 'MISSING' else 'INSTALLED' end
    as function_status,
  coalesce(limiter.prosecdef, false) as security_definer,
  limiter.proconfig as function_configuration,
  case
    when limiter.oid is null then false
    else pg_catalog.has_function_privilege(
      'authenticated',
      limiter.oid,
      'EXECUTE'
    )
  end as authenticated_execute,
  case
    when limiter.oid is null then false
    else pg_catalog.has_function_privilege('anon', limiter.oid, 'EXECUTE')
  end as anon_execute,
  case
    when limiter.oid is null then false
    else exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(
          limiter.proacl,
          pg_catalog.acldefault('f', limiter.proowner)
        )
      ) as acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    )
  end as public_execute,
  (
    select count(*) = 0
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'watchflow_tmdb_rate_limits'
  ) as limiter_has_no_policies
from (select 1) as required
left join limiter on true;

-- 7. Concise findings. A healthy result is an empty set.
with expected_tables(table_name, data_scope) as (
  values
    ('profiles', 'user_owned'),
    ('movies', 'shared_read_only'),
    ('user_movies', 'user_owned'),
    ('user_preferences', 'user_owned'),
    ('lists', 'user_owned'),
    ('list_movies', 'user_owned'),
    ('watchflow_tmdb_rate_limits', 'internal_no_direct_access')
),
required_policies(table_name, command_name, ownership_required) as (
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
),
expected_privileges(
  table_name,
  privilege_type,
  authenticated_should_have
) as (
  values
    ('profiles', 'SELECT', true),
    ('profiles', 'INSERT', false),
    ('profiles', 'UPDATE', true),
    ('profiles', 'DELETE', false),
    ('movies', 'SELECT', true),
    ('movies', 'INSERT', false),
    ('movies', 'UPDATE', false),
    ('movies', 'DELETE', false),
    ('user_movies', 'SELECT', true),
    ('user_movies', 'INSERT', true),
    ('user_movies', 'UPDATE', true),
    ('user_movies', 'DELETE', true),
    ('user_preferences', 'SELECT', true),
    ('user_preferences', 'INSERT', true),
    ('user_preferences', 'UPDATE', true),
    ('user_preferences', 'DELETE', false),
    ('lists', 'SELECT', true),
    ('lists', 'INSERT', true),
    ('lists', 'UPDATE', true),
    ('lists', 'DELETE', true),
    ('list_movies', 'SELECT', true),
    ('list_movies', 'INSERT', true),
    ('list_movies', 'UPDATE', true),
    ('list_movies', 'DELETE', true),
    ('watchflow_tmdb_rate_limits', 'SELECT', false),
    ('watchflow_tmdb_rate_limits', 'INSERT', false),
    ('watchflow_tmdb_rate_limits', 'UPDATE', false),
    ('watchflow_tmdb_rate_limits', 'DELETE', false)
),
tables as (
  select classes.oid, classes.relname, classes.relrowsecurity
  from pg_catalog.pg_class as classes
  inner join pg_catalog.pg_namespace as namespaces
    on namespaces.oid = classes.relnamespace
  where namespaces.nspname = 'public'
    and classes.relkind in ('r', 'p')
),
effective_privileges as (
  select
    expected.table_name,
    expected.privilege_type,
    expected.authenticated_should_have,
    tables.oid,
    case
      when tables.oid is null then false
      when expected.privilege_type in ('SELECT', 'INSERT', 'UPDATE') then
        pg_catalog.has_table_privilege(
          'authenticated',
          tables.oid,
          expected.privilege_type
        )
        or pg_catalog.has_any_column_privilege(
          'authenticated',
          tables.oid,
          expected.privilege_type
        )
      else pg_catalog.has_table_privilege(
        'authenticated',
        tables.oid,
        expected.privilege_type
      )
    end as authenticated_has,
    case
      when tables.oid is null then false
      when expected.privilege_type in ('SELECT', 'INSERT', 'UPDATE') then
        pg_catalog.has_table_privilege(
          'anon',
          tables.oid,
          expected.privilege_type
        )
        or pg_catalog.has_any_column_privilege(
          'anon',
          tables.oid,
          expected.privilege_type
        )
      else pg_catalog.has_table_privilege(
        'anon',
        tables.oid,
        expected.privilege_type
      )
    end as anon_has
  from expected_privileges as expected
  left join tables on tables.relname = expected.table_name
),
findings as (
  select
    expected.table_name as object_name,
    'TABLE_OR_RLS'::text as category,
    case
      when tables.oid is null then 'Table is missing'
      else 'RLS is disabled'
    end as finding
  from expected_tables as expected
  left join tables on tables.relname = expected.table_name
  where tables.oid is null or not tables.relrowsecurity

  union all

  select
    required.table_name || '.' || required.command_name,
    'MISSING_POLICY',
    'Required ownership-scoped policy operation is missing'
  from required_policies as required
  where not exists (
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
  )

  union all

  select
    policies.tablename,
    'POLICY',
    'User-owned policy does not visibly derive ownership from auth.uid()'
  from pg_catalog.pg_policies as policies
  where policies.schemaname = 'public'
    and policies.tablename in (
      'profiles',
      'user_movies',
      'user_preferences',
      'lists',
      'list_movies'
    )
    and position(
      'auth.uid()' in coalesce(policies.qual, '')
        || coalesce(policies.with_check, '')
    ) = 0

  union all

  select
    policies.tablename,
    'POLICY',
    'User-owned policy contains an unrestricted true predicate'
  from pg_catalog.pg_policies as policies
  where policies.schemaname = 'public'
    and policies.tablename in (
      'profiles',
      'user_movies',
      'user_preferences',
      'lists',
      'list_movies'
    )
    and (
      lower(regexp_replace(coalesce(policies.qual, ''), '\s', '', 'g'))
        in ('true', '(true)')
      or lower(
        regexp_replace(coalesce(policies.with_check, ''), '\s', '', 'g')
      ) in ('true', '(true)')
    )

  union all

  select
    'watchflow_tmdb_rate_limits',
    'POLICY',
    'Internal limiter table unexpectedly has an RLS policy'
  where exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'watchflow_tmdb_rate_limits'
  )

  union all

  select
    effective.table_name || '.' || effective.privilege_type,
    'AUTHENTICATED_PRIVILEGE',
    case
      when effective.authenticated_should_have
        then 'Authenticated role is missing a required effective privilege'
      else 'Authenticated role has an unintended effective privilege'
    end
  from effective_privileges as effective
  where effective.oid is not null
    and effective.authenticated_has is distinct from
      effective.authenticated_should_have

  union all

  select
    effective.table_name || '.' || effective.privilege_type,
    'ANON_PRIVILEGE',
    'Anonymous role has an unintended effective table or column privilege'
  from effective_privileges as effective
  where effective.oid is not null
    and effective.anon_has

  union all

  select
    tables.relname,
    'ANON_PRIVILEGE',
    'Anonymous role has an effective table privilege'
  from tables
  cross join (
    values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
  ) as operations(privilege_type)
  where tables.relname in (select table_name from expected_tables)
    and pg_catalog.has_table_privilege(
      'anon',
      tables.oid,
      operations.privilege_type
    )

  union all

  select
    'movies',
    'AUTHENTICATED_PRIVILEGE',
    'Authenticated role can directly write shared movie metadata'
  where exists (
    select 1
    from tables
    cross join (
      values ('INSERT'), ('UPDATE'), ('DELETE')
    ) as operations(privilege_type)
    where tables.relname = 'movies'
      and pg_catalog.has_table_privilege(
        'authenticated',
        tables.oid,
        operations.privilege_type
      )
  )

  union all

  select
    'watchflow_tmdb_rate_limits',
    'AUTHENTICATED_PRIVILEGE',
    'Authenticated role has direct limiter-table access'
  where exists (
    select 1
    from tables
    cross join (
      values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
    ) as operations(privilege_type)
    where tables.relname = 'watchflow_tmdb_rate_limits'
      and pg_catalog.has_table_privilege(
        'authenticated',
        tables.oid,
        operations.privilege_type
      )
  )
)
select object_name, category, finding
from findings
order by object_name, category, finding;
