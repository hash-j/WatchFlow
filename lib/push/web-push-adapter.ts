import "server-only";

import webPush from "web-push";

import { getVapidConfiguration } from "./config";

export type PushDeliveryPayload = {
  notificationId: string;
  category: "movie_status" | "watch_next" | "custom_lists" | "imports";
  title: string;
  body: string;
  movieTitle: string | null;
  imageUrl: string | null;
  actionUrl: string;
};

export type DeliverablePushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushDeliveryResult =
  | { outcome: "delivered" }
  | { outcome: "not_configured" }
  | { outcome: "failed"; statusCode: number | null; permanent: boolean };

function deliveryStatus(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }
  return null;
}

export async function sendWebPush(
  subscription: DeliverablePushSubscription,
  payload: PushDeliveryPayload,
): Promise<PushDeliveryResult> {
  const vapid = getVapidConfiguration();
  if (!vapid) return { outcome: "not_configured" };

  webPush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  try {
    await webPush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify(payload),
      {
        TTL: 300,
        urgency: "normal",
      },
    );
    return { outcome: "delivered" };
  } catch (error) {
    const statusCode = deliveryStatus(error);
    return {
      outcome: "failed",
      statusCode,
      permanent: statusCode === 404 || statusCode === 410,
    };
  }
}
