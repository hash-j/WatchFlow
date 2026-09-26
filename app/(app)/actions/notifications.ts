"use server";

import {
  markAllOwnedNotificationsRead,
  markOwnedNotificationRead,
} from "@/lib/notifications/supabase-notifications";
import {
  INITIAL_NOTIFICATION_ACTION_STATE,
  type NotificationActionState,
} from "@/lib/notifications/types";
import { notificationIdSchema } from "@/lib/notifications/validation";

function result(
  previousState: NotificationActionState,
  status: NotificationActionState["status"],
  message: string,
): NotificationActionState {
  return {
    status,
    message,
    requestId: previousState.requestId + 1,
  };
}

export async function markNotificationReadAction(
  previousState: NotificationActionState = INITIAL_NOTIFICATION_ACTION_STATE,
  formData: FormData,
): Promise<NotificationActionState> {
  const parsed = notificationIdSchema.safeParse(formData.get("notificationId"));
  if (!parsed.success) {
    return result(previousState, "error", "That notification was invalid.");
  }

  try {
    const updated = await markOwnedNotificationRead(parsed.data);
    if (!updated) {
      return result(
        previousState,
        "error",
        "That notification is no longer available.",
      );
    }

    return result(previousState, "success", "Notification marked as read.");
  } catch {
    return result(
      previousState,
      "error",
      "The notification could not be updated. Please try again.",
    );
  }
}

export async function markAllNotificationsReadAction(
  previousState: NotificationActionState = INITIAL_NOTIFICATION_ACTION_STATE,
): Promise<NotificationActionState> {
  try {
    const updated = await markAllOwnedNotificationsRead();
    return result(
      previousState,
      "success",
      updated === 1
        ? "1 notification marked as read."
        : `${updated} notifications marked as read.`,
    );
  } catch {
    return result(
      previousState,
      "error",
      "Notifications could not be updated. Please try again.",
    );
  }
}
