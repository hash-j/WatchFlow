import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  sendWebPush,
  type PushDeliveryPayload,
  type PushDeliveryResult,
} from "@/lib/push/web-push-adapter";
import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/supabase/error-logging";

type StoredSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expirationTime: number | null;
};

export type NotificationDispatchResult = {
  status: "delivered" | "skipped" | "partial";
  attempted: number;
  delivered: number;
  removed: number;
  failed: number;
};

const skippedResult: NotificationDispatchResult = {
  status: "skipped",
  attempted: 0,
  delivered: 0,
  removed: 0,
  failed: 0,
};

function mapSubscription(value: unknown): StoredSubscription | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.endpoint !== "string" ||
    typeof row.p256dh !== "string" ||
    typeof row.auth_key !== "string"
  ) {
    return null;
  }
  return {
    id: row.id,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth_key,
    expirationTime:
      typeof row.expiration_time === "number" ? row.expiration_time : null,
  };
}

async function removeOwnedSubscriptions(
  client: SupabaseClient,
  userId: string,
  subscriptionIds: string[],
) {
  if (subscriptionIds.length === 0) return 0;

  const uniqueIds = [...new Set(subscriptionIds)];
  const { data, error } = await client
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .in("id", uniqueIds)
    .select("id");

  if (error) {
    logSupabaseError("expired push subscription cleanup failed", error);
    return 0;
  }
  return data?.length ?? 0;
}

export async function dispatchNotificationEvent(
  payload: PushDeliveryPayload,
): Promise<NotificationDispatchResult> {
  const client = await createClient();
  const {
    data: { user },
    error: authenticationError,
  } = await client.auth.getUser();
  if (authenticationError || !user) return skippedResult;

  const preference = await client
    .from("user_preferences")
    .select("push_notifications_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  if (preference.error) {
    logSupabaseError("push notification preference read failed", preference.error);
    return skippedResult;
  }
  if (preference.data?.push_notifications_enabled !== true) return skippedResult;

  const subscriptions = await client
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key, expiration_time")
    .eq("user_id", user.id);
  if (subscriptions.error) {
    logSupabaseError("push subscriptions read failed", subscriptions.error);
    return skippedResult;
  }

  const rows = (subscriptions.data ?? [])
    .map(mapSubscription)
    .filter((value): value is StoredSubscription => value !== null);
  const now = Date.now();
  const expired = rows.filter(
    ({ expirationTime }) => expirationTime !== null && expirationTime <= now,
  );
  let removed = await removeOwnedSubscriptions(
    client,
    user.id,
    expired.map(({ id }) => id),
  );
  const active = rows.filter(
    ({ expirationTime }) => expirationTime === null || expirationTime > now,
  );

  let delivered = 0;
  let failed = 0;
  const permanentlyInvalid: string[] = [];
  for (const subscription of active) {
    let result: PushDeliveryResult;
    try {
      result = await sendWebPush(
        {
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
        payload,
      );
    } catch {
      failed += 1;
      continue;
    }
    if (result.outcome === "delivered") {
      delivered += 1;
    } else if (result.outcome === "failed") {
      failed += 1;
      if (result.permanent) permanentlyInvalid.push(subscription.id);
    } else {
      failed += 1;
    }
  }

  removed += await removeOwnedSubscriptions(
    client,
    user.id,
    permanentlyInvalid,
  );
  const attempted = active.length;
  return {
    status:
      attempted === 0
        ? "skipped"
        : failed === 0
          ? "delivered"
          : "partial",
    attempted,
    delivered,
    removed,
    failed,
  };
}
