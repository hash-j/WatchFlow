begin;

create or replace function public.watchflow_replace_google_calendar_credential(
  p_user_id uuid,
  p_connection_id uuid,
  p_refresh_token_ciphertext bytea,
  p_refresh_token_nonce bytea,
  p_refresh_token_auth_tag bytea,
  p_encryption_key_version smallint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.calendar_credentials as credential
  set refresh_token_ciphertext = p_refresh_token_ciphertext,
      refresh_token_nonce = p_refresh_token_nonce,
      refresh_token_auth_tag = p_refresh_token_auth_tag,
      encryption_key_version = p_encryption_key_version,
      updated_at = pg_catalog.now()
  from public.calendar_connections as connection
  where credential.connection_id = p_connection_id
    and connection.id = credential.connection_id
    and connection.id = p_connection_id
    and connection.user_id = p_user_id
    and connection.provider = 'google';

  return found;
end;
$$;

comment on function public.watchflow_replace_google_calendar_credential(
  uuid, uuid, bytea, bytea, bytea, smallint
) is
  'Service-role-only owner-bound replacement of an encrypted Google refresh credential after provider rotation.';

revoke execute on function public.watchflow_replace_google_calendar_credential(
  uuid, uuid, bytea, bytea, bytea, smallint
)
  from public, anon, authenticated, service_role;

grant execute on function public.watchflow_replace_google_calendar_credential(
  uuid, uuid, bytea, bytea, bytea, smallint
)
  to service_role;

commit;
