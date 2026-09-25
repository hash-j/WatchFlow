"use server";

import "server-only";

import { headers } from "next/headers";

import {
  disablePushNotifications,
  savePushSubscription,
} from "@/lib/push/supabase-push";
import type { PushActionResult } from "@/lib/push/types";
import { pushSubscriptionSchema } from "@/lib/push/validation";
import { authenticateSettings } from "@/lib/settings/supabase-settings";

const authenticationError: PushActionResult = {
  status: "error",
  message: "Your session has expired. Sign in again to manage push notifications.",
};

export async function savePushSubscriptionAction(
  input: unknown,
): Promise<PushActionResult> {
  const session = await authenticateSettings();
  if (!session) return authenticationError;

  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      message: "The browser returned an invalid push subscription.",
    };
  }

  try {
    const userAgent = (await headers()).get("user-agent")?.slice(0, 512) ?? null;
    await savePushSubscription(session.client, parsed.data, userAgent);
    return {
      status: "success",
      message: "Push notifications are enabled for this account.",
    };
  } catch {
    return {
      status: "error",
      message: "Push notifications could not be enabled. Please try again.",
    };
  }
}

export async function disablePushNotificationsAction(): Promise<PushActionResult> {
  const session = await authenticateSettings();
  if (!session) return authenticationError;

  try {
    await disablePushNotifications(session.client);
    return {
      status: "success",
      message: "Push notifications are disabled for this account.",
    };
  } catch {
    return {
      status: "error",
      message: "Push notifications could not be disabled. Please try again.",
    };
  }
}
