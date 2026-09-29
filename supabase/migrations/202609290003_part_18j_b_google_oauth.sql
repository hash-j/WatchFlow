begin;

create table public.calendar_oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state_hash bytea not null unique,
  binding_hash bytea not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint calendar_oauth_states_state_hash_check check (octet_length(state_hash) = 32),
  constraint calendar_oauth_states_binding_hash_check check (octet_length(binding_hash) = 32),
  constraint calendar_oauth_states_expiry_check check (expires_at > created_at)
);

comment on table public.calendar_oauth_states is
  'Short-lived, one-time, server-only Google OAuth state bindings. Raw state and PKCE values are never stored.';

create index calendar_oauth_states_owner_expiry_idx
  on public.calendar_oauth_states (user_id, expires_at desc);

alter table public.calendar_oauth_states enable row level security;
revoke all on table public.calendar_oauth_states from public, anon, authenticated;

create or replace function public.watchflow_create_calendar_oauth_state(
  p_user_id uuid,
  p_state_hash bytea,
  p_binding_hash bytea,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_user_id is null
     or pg_catalog.octet_length(p_state_hash) <> 32
     or pg_catalog.octet_length(p_binding_hash) <> 32
     or p_expires_at <= pg_catalog.now()
     or p_expires_at > pg_catalog.now() + interval '15 minutes' then
    raise exception 'invalid calendar oauth state';
  end if;

  delete from public.calendar_oauth_states s
   where s.user_id = p_user_id
     and (s.consumed_at is not null or s.expires_at <= pg_catalog.now());

  insert into public.calendar_oauth_states (
    user_id, state_hash, binding_hash, expires_at
  ) values (
    p_user_id, p_state_hash, p_binding_hash, p_expires_at
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.watchflow_consume_calendar_oauth_state(
  p_user_id uuid,
  p_state_hash bytea,
  p_binding_hash bytea
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.calendar_oauth_states s
     set consumed_at = pg_catalog.now()
   where s.user_id = p_user_id
     and s.state_hash = p_state_hash
     and s.binding_hash = p_binding_hash
     and s.consumed_at is null
     and s.expires_at > pg_catalog.now()
  returning s.id into v_id;

  return v_id is not null;
end;
$$;

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
  v_connection_id uuid;
begin
  insert into public.calendar_connections (
    user_id, provider, provider_subject, display_email,
    provider_calendar_id, sync_enabled, status, granted_scopes,
    connected_at, updated_at, last_error_code, last_error_at
  ) values (
    p_user_id, 'google', p_provider_subject, p_display_email,
    'primary', true, 'connected', p_granted_scopes,
    pg_catalog.now(), pg_catalog.now(), null, null
  )
  on conflict (user_id, provider) do update set
    provider_subject = excluded.provider_subject,
    display_email = excluded.display_email,
    provider_calendar_id = 'primary',
    sync_enabled = true,
    status = 'connected',
    granted_scopes = excluded.granted_scopes,
    connected_at = pg_catalog.now(),
    updated_at = pg_catalog.now(),
    last_error_code = null,
    last_error_at = null
  returning id into v_connection_id;

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

create or replace function public.watchflow_read_google_calendar_credential(
  p_user_id uuid
)
returns table (
  connection_id uuid,
  refresh_token_ciphertext bytea,
  refresh_token_nonce bytea,
  refresh_token_auth_tag bytea,
  encryption_key_version smallint
)
language sql
security definer
stable
set search_path = ''
as $$
  select c.id, k.refresh_token_ciphertext, k.refresh_token_nonce,
         k.refresh_token_auth_tag, k.encryption_key_version
    from public.calendar_connections c
    join public.calendar_credentials k on k.connection_id = c.id
   where c.user_id = p_user_id and c.provider = 'google'
   limit 1
$$;

create or replace function public.watchflow_disconnect_google_calendar_connection(
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection_id uuid;
begin
  delete from public.calendar_connections c
   where c.user_id = p_user_id and c.provider = 'google'
  returning c.id into v_connection_id;
  return v_connection_id is not null;
end;
$$;

create or replace function public.watchflow_set_calendar_sync_enabled(
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update public.calendar_connections c
     set sync_enabled = p_enabled,
         updated_at = pg_catalog.now()
   where c.user_id = v_user_id and c.provider = 'google';
  return found;
end;
$$;

revoke execute on function public.watchflow_create_calendar_oauth_state(uuid, bytea, bytea, timestamptz)
  from public, anon, authenticated, service_role;
revoke execute on function public.watchflow_consume_calendar_oauth_state(uuid, bytea, bytea)
  from public, anon, authenticated, service_role;
revoke execute on function public.watchflow_upsert_google_calendar_connection(uuid, text, text, text[], bytea, bytea, bytea, smallint)
  from public, anon, authenticated, service_role;
revoke execute on function public.watchflow_read_google_calendar_credential(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.watchflow_disconnect_google_calendar_connection(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.watchflow_create_calendar_oauth_state(uuid, bytea, bytea, timestamptz)
  to service_role;
grant execute on function public.watchflow_consume_calendar_oauth_state(uuid, bytea, bytea)
  to service_role;
grant execute on function public.watchflow_upsert_google_calendar_connection(uuid, text, text, text[], bytea, bytea, bytea, smallint)
  to service_role;
grant execute on function public.watchflow_read_google_calendar_credential(uuid)
  to service_role;
grant execute on function public.watchflow_disconnect_google_calendar_connection(uuid)
  to service_role;

revoke execute on function public.watchflow_set_calendar_sync_enabled(boolean)
  from public, anon, service_role;
grant execute on function public.watchflow_set_calendar_sync_enabled(boolean)
  to authenticated;

commit;
