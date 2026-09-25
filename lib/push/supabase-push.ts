import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logSupabaseError } from "@/lib/supabase/error-logging";
import type { PushSubscriptionInput } from "./types";

export class PushSubscriptionPersistenceError extends Error {
  constructor(message = "Push notification settings could not be saved.") {
    super(message);
    this.name = "PushSubscriptionPersistenceError";
  }
}

export async function savePushSubscription(
  client: SupabaseClient,
  input: PushSubscriptionInput,
  userAgent: string | null,
) {
  const { data, error } = await client.rpc("watchflow_save_push_subscription", {
    p_endpoint: input.endpoint,
    p_p256dh: input.keys.p256dh,
    p_auth_key: input.keys.auth,
    p_expiration_time: input.expirationTime,
    p_user_agent: userAgent,
  });

  if (error || typeof data !== "string") {
    if (error) logSupabaseError("push subscription save failed", error);
    throw new PushSubscriptionPersistenceError();
  }

  return data;
}

export async function disablePushNotifications(client: SupabaseClient) {
  const { data, error } = await client.rpc(
    "watchflow_disable_push_notifications",
  );

  if (error || typeof data !== "number") {
    if (error) logSupabaseError("push notification disable failed", error);
    throw new PushSubscriptionPersistenceError();
  }

  return data;
}
