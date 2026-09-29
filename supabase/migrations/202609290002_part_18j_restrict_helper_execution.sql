begin;

-- Part 18J-A internal helpers execute only through their SECURITY DEFINER
-- callers and triggers. Supabase may retain an explicit/default service_role
-- EXECUTE grant even after PUBLIC is revoked, so revoke every role explicitly.
revoke execute on function public.watchflow_part18j_uuid(text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.watchflow_calendar_source_key(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.watchflow_calendar_upsert_version(
  text, timestamptz, text, text, integer
)
  from public, anon, authenticated, service_role;
revoke execute on function public.watchflow_calendar_delete_version(text)
  from public, anon, authenticated, service_role;
revoke execute on function public.watchflow_calendar_provider_event_id(uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.watchflow_enqueue_calendar_sync(
  uuid, uuid, boolean, boolean
)
  from public, anon, authenticated, service_role;
revoke execute on function public.watchflow_sync_calendar_job_trigger()
  from public, anon, authenticated, service_role;

-- Reassert the complete public boundary: only these two service-role RPCs are
-- externally executable. Their SECURITY DEFINER owner retains internal helper
-- access without granting those helpers to service_role itself.
revoke execute on function public.watchflow_claim_calendar_sync_jobs(
  integer, integer
)
  from public, anon, authenticated, service_role;
revoke execute on function public.watchflow_finalize_calendar_sync_job(
  uuid, uuid, text, text, text, text, integer, text
)
  from public, anon, authenticated, service_role;

grant execute on function public.watchflow_claim_calendar_sync_jobs(
  integer, integer
)
  to service_role;
grant execute on function public.watchflow_finalize_calendar_sync_job(
  uuid, uuid, text, text, text, text, integer, text
)
  to service_role;

commit;
