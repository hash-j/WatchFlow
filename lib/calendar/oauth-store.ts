import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { EncryptedCalendarToken } from "./token-encryption";

export class CalendarOAuthStoreError extends Error {
  constructor() {
    super("Calendar connection state could not be saved.");
    this.name = "CalendarOAuthStoreError";
  }
}

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new CalendarOAuthStoreError();
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function bytea(value: Buffer) {
  return `\\x${value.toString("hex")}`;
}

function buffer(value: unknown) {
  if (typeof value !== "string" || !/^\\x[0-9a-f]+$/i.test(value)) {
    throw new CalendarOAuthStoreError();
  }
  return Buffer.from(value.slice(2), "hex");
}

async function rpc<T>(name: string, args: Record<string, unknown>) {
  const result = await client().rpc(name, args);
  if (result.error) throw new CalendarOAuthStoreError();
  return result.data as T;
}

export async function createCalendarOAuthState(input: {
  userId: string;
  stateHash: Buffer;
  bindingHash: Buffer;
  expiresAt: Date;
}) {
  await rpc("watchflow_create_calendar_oauth_state", {
    p_user_id: input.userId,
    p_state_hash: bytea(input.stateHash),
    p_binding_hash: bytea(input.bindingHash),
    p_expires_at: input.expiresAt.toISOString(),
  });
}

export async function consumeCalendarOAuthState(input: {
  userId: string;
  stateHash: Buffer;
  bindingHash: Buffer;
}) {
  return rpc<boolean>("watchflow_consume_calendar_oauth_state", {
    p_user_id: input.userId,
    p_state_hash: bytea(input.stateHash),
    p_binding_hash: bytea(input.bindingHash),
  });
}

export async function saveGoogleCalendarConnection(input: {
  userId: string;
  providerSubject: string;
  displayEmail: string;
  grantedScopes: string[];
  encrypted: EncryptedCalendarToken;
}) {
  return rpc<string>("watchflow_upsert_google_calendar_connection", {
    p_user_id: input.userId,
    p_provider_subject: input.providerSubject,
    p_display_email: input.displayEmail,
    p_granted_scopes: input.grantedScopes,
    p_refresh_token_ciphertext: bytea(input.encrypted.ciphertext),
    p_refresh_token_nonce: bytea(input.encrypted.nonce),
    p_refresh_token_auth_tag: bytea(input.encrypted.authTag),
    p_encryption_key_version: input.encrypted.keyVersion,
  });
}

export async function readGoogleCalendarCredential(userId: string) {
  const rows = await rpc<Array<Record<string, unknown>>>(
    "watchflow_read_google_calendar_credential",
    { p_user_id: userId },
  );
  const row = rows?.[0];
  if (!row) return null;
  return {
    connectionId: String(row.connection_id),
    ciphertext: buffer(row.refresh_token_ciphertext),
    nonce: buffer(row.refresh_token_nonce),
    authTag: buffer(row.refresh_token_auth_tag),
    keyVersion: Number(row.encryption_key_version),
  };
}

export async function deleteGoogleCalendarConnection(userId: string) {
  return rpc<boolean>("watchflow_disconnect_google_calendar_connection", {
    p_user_id: userId,
  });
}

