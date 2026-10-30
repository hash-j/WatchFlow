begin;

-- A connected account may refresh its credential only for the same Google
-- subject. In particular, reauthorization must not unpause calendar sync.
create or replace function public.watchflow_upsert_google_calendar_connection(
  p_user_id uuid,
  p_provider_subject text,
  p_display_email text,
  p_granted_scopes text[],
  p_refresh_token_ciphertext bytea,
  p_refresh_token_nonce bytea,
  p_refresh_token_auth_tag bytea,
  p_encryption_key_version smallint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection public.calendar_connections%rowtype;
  v_connection_id uuid;
begin
  -- Google userinfo requires a real subject for every connection state.
  if p_provider_subject is null or p_provider_subject = '' then
    raise exception using errcode = '22023',
      message = 'Google account subject is required';
  end if;

  select connection_row.* into v_connection
  from public.calendar_connections as connection_row
  where connection_row.user_id = p_user_id
    and connection_row.provider = 'google'
  for update;

  if v_connection.id is null then
    insert into public.calendar_connections (
      user_id, provider, provider_subject, display_email,
      provider_calendar_id, sync_enabled, status, granted_scopes,
      connected_at, updated_at, last_error_code, last_error_at
    ) values (
      p_user_id, 'google', p_provider_subject, p_display_email,
      'primary', true, 'connected', p_granted_scopes,
      pg_catalog.now(), pg_catalog.now(), null, null
    )
    on conflict (user_id, provider) do nothing
    returning id into v_connection_id;

    -- A concurrent first connection may have won the unique-key race. Apply
    -- the existing-connection rules to that row instead of overwriting it.
    if v_connection_id is null then
      select connection_row.* into v_connection
      from public.calendar_connections as connection_row
      where connection_row.user_id = p_user_id
        and connection_row.provider = 'google'
      for update;
      if v_connection.id is null then
        raise exception using errcode = '40001',
          message = 'Calendar connection changed during reauthorization';
      end if;
    end if;
  end if;

  if v_connection.id is not null then
    v_connection_id := v_connection.id;

    if v_connection.status = 'disconnect_pending' then
      if v_connection.provider_subject is distinct from p_provider_subject then
        raise exception using errcode = '22023',
          message = 'Calendar cleanup must be reauthorized with the same Google account';
      end if;

      update public.calendar_connections as pending_connection
      set display_email = p_display_email,
          granted_scopes = p_granted_scopes,
          sync_enabled = false,
          status = 'disconnect_pending',
          updated_at = pg_catalog.now(),
          last_error_code = null,
          last_error_at = null
      where pending_connection.id = v_connection_id;

      update public.calendar_sync_jobs as cleanup_job
      set state = 'pending', attempt_count = 0,
          available_at = pg_catalog.now(), lease_token = null,
          lease_expires_at = null, provider_status_code = null,
          error_code = null, completed_at = null
      where cleanup_job.connection_id = v_connection_id
        and cleanup_job.desired_operation = 'connection_cleanup'
        and cleanup_job.state = 'auth_required';
    elsif v_connection.status = 'connected' then
      if v_connection.provider_subject is distinct from p_provider_subject then
        raise exception using errcode = '22023',
          message = 'Calendar reauthorization requires the same Google account';
      end if;

      update public.calendar_connections as connected_connection
      set display_email = p_display_email,
          granted_scopes = p_granted_scopes,
          connected_at = pg_catalog.now(),
          updated_at = pg_catalog.now(),
          last_error_code = null,
          last_error_at = null
      where connected_connection.id = v_connection_id;
      -- provider_subject, status, and sync_enabled are deliberately untouched.
    elsif v_connection.status = 'reconnect_required' then
      -- Preserve the existing reconnect_required recovery contract.
      update public.calendar_connections as reconnect_connection
      set provider_subject = p_provider_subject,
          display_email = p_display_email,
          provider_calendar_id = 'primary',
          sync_enabled = true,
          status = 'connected',
          granted_scopes = p_granted_scopes,
          connected_at = pg_catalog.now(),
          updated_at = pg_catalog.now(),
          last_error_code = null,
          last_error_at = null
      where reconnect_connection.id = v_connection_id;
    else
      raise exception using errcode = '22023',
        message = 'Unsupported calendar connection state';
    end if;
  end if;

  insert into public.calendar_credentials (
    connection_id, refresh_token_ciphertext, refresh_token_nonce,
    refresh_token_auth_tag, encryption_key_version
  ) values (
    v_connection_id, p_refresh_token_ciphertext, p_refresh_token_nonce,
    p_refresh_token_auth_tag, p_encryption_key_version
  )
  on conflict (connection_id) do update set
    refresh_token_ciphertext = excluded.refresh_token_ciphertext,
    refresh_token_nonce = excluded.refresh_token_nonce,
    refresh_token_auth_tag = excluded.refresh_token_auth_tag,
    encryption_key_version = excluded.encryption_key_version,
    updated_at = pg_catalog.now();

  return v_connection_id;
end;
$$;

revoke execute on function public.watchflow_upsert_google_calendar_connection(
  uuid, text, text, text[], bytea, bytea, bytea, smallint
) from public, anon, authenticated, service_role;
grant execute on function public.watchflow_upsert_google_calendar_connection(
  uuid, text, text, text[], bytea, bytea, bytea, smallint
) to service_role;

commit;
