begin;

create or replace function public.watchflow_calendar_provider_event_id(
  p_connection_id uuid,
  p_source_key text
)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select 'a' || pg_catalog.md5(
    'watchflow:calendar-provider-event:'
    || p_connection_id::text || ':' || p_source_key
  )
$$;

-- Part 18J-A had no provider transport, so any old-prefix mappings can only be
-- pre-transport fixtures. Preserve their hash identity under Google's valid
-- base32hex alphabet before Part 18J-C can create a real provider event.
update public.calendar_event_mappings as mapping
set provider_event_id = 'a' || pg_catalog.substr(mapping.provider_event_id, 3),
    updated_at = pg_catalog.now()
where mapping.provider_event_id ~ '^wf[0-9a-f]{32}$';

revoke execute on function public.watchflow_calendar_provider_event_id(uuid, text)
  from public, anon, authenticated, service_role;

commit;
