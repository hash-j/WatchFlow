import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getTmdbImageUrl } from "@/lib/movies/images";
import {
  sendWebPush,
  type PushDeliveryResult,
} from "@/lib/push/web-push-adapter";
import { createScheduledReminderBackgroundClient } from "@/lib/supabase/background";
import { notificationActionUrl } from "./presentation";

const DEFAULT_BATCH_SIZE = 10;
const LEASE_SECONDS = 120;

type ScheduledReminderClaim = {
  job_id: string;
  delivery_id: string;
  lease_token: string;
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  notification_id: string;
  title: string;
  body: string;
  action_path: string;
  movie_title: string;
  movie_poster_path: string | null;
};

type FinalizationOutcome =
  | "delivered"
  | "permanent_failure"
  | "retryable_failure"
  | "not_configured"
  | "terminal_failure";

type DeliveryFinalization = {
  deliveryId: string;
  outcome: FinalizationOutcome;
  statusCode: number | null;
};

export type ScheduledReminderExecutionResult = {
  claimedJobs: number;
  attemptedDeliveries: number;
  delivered: number;
  retryable: number;
  failed: number;
};

function isClaim(value: unknown): value is ScheduledReminderClaim {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return [
    "job_id",
    "delivery_id",
    "lease_token",
    "subscription_id",
    "endpoint",
    "p256dh",
    "auth_key",
    "notification_id",
    "title",
    "body",
    "action_path",
    "movie_title",
  ].every((key) => typeof row[key] === "string");
}

function finalizationFor(
  deliveryId: string,
  result: PushDeliveryResult,
): DeliveryFinalization {
  if (result.outcome === "delivered") {
    return { deliveryId, outcome: "delivered", statusCode: null };
  }
  if (result.outcome === "not_configured") {
    return { deliveryId, outcome: "not_configured", statusCode: null };
  }
  if (result.permanent) {
    return {
      deliveryId,
      outcome: "permanent_failure",
      statusCode: result.statusCode,
    };
  }
  if (
    result.statusCode === 429 ||
    (result.statusCode !== null && result.statusCode >= 500)
  ) {
    return {
      deliveryId,
      outcome: "retryable_failure",
      statusCode: result.statusCode,
    };
  }
  return {
    deliveryId,
    outcome: "terminal_failure",
    statusCode: result.statusCode,
  };
}

function groupClaims(claims: ScheduledReminderClaim[]) {
  const grouped = new Map<string, ScheduledReminderClaim[]>();
  for (const claim of claims) {
    const key = `${claim.job_id}:${claim.lease_token}`;
    const existing = grouped.get(key) ?? [];
    existing.push(claim);
    grouped.set(key, existing);
  }
  return grouped;
}

export async function executeScheduledReminders(
  batchSize = DEFAULT_BATCH_SIZE,
  client: SupabaseClient = createScheduledReminderBackgroundClient(),
): Promise<ScheduledReminderExecutionResult> {
  const { data, error } = await client.rpc(
    "watchflow_claim_scheduled_reminders",
    { p_batch_size: batchSize, p_lease_seconds: LEASE_SECONDS },
  );
  if (error) throw new Error("Scheduled reminder claim failed.");

  const claims = (Array.isArray(data) ? data : []).filter(isClaim);
  const groups = groupClaims(claims);
  let delivered = 0;
  let retryable = 0;
  let failed = 0;

  for (const group of groups.values()) {
    const results: DeliveryFinalization[] = [];
    for (const claim of group) {
      let pushResult: PushDeliveryResult;
      try {
        pushResult = await sendWebPush(
          {
            endpoint: claim.endpoint,
            p256dh: claim.p256dh,
            auth: claim.auth_key,
          },
          {
            notificationId: claim.notification_id,
            category: "schedule_reminders",
            title: claim.title,
            body: claim.body,
            movieTitle: claim.movie_title,
            imageUrl: getTmdbImageUrl(claim.movie_poster_path, "w342"),
            actionUrl: notificationActionUrl(
              claim.action_path,
              claim.notification_id,
              "push",
            ),
          },
        );
      } catch {
        pushResult = {
          outcome: "failed",
          statusCode: null,
          permanent: false,
        };
      }

      const result = finalizationFor(claim.delivery_id, pushResult);
      results.push(result);
      if (result.outcome === "delivered") delivered += 1;
      else if (
        result.outcome === "retryable_failure" ||
        result.outcome === "not_configured"
      ) retryable += 1;
      else failed += 1;
    }

    const first = group[0];
    const finalized = await client.rpc(
      "watchflow_finalize_scheduled_reminder",
      {
        p_job_id: first.job_id,
        p_lease_token: first.lease_token,
        p_results: results,
      },
    );
    if (finalized.error) {
      throw new Error("Scheduled reminder finalization failed.");
    }
  }

  return {
    claimedJobs: groups.size,
    attemptedDeliveries: claims.length,
    delivered,
    retryable,
    failed,
  };
}
