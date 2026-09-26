"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCheck } from "lucide-react";

import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/(app)/actions/notifications";
import { Button } from "@/components/ui/button";
import { INITIAL_NOTIFICATION_ACTION_STATE } from "@/lib/notifications/types";

function useRefreshAfterSuccessfulRead(
  state: typeof INITIAL_NOTIFICATION_ACTION_STATE,
) {
  const router = useRouter();
  const refreshedRequestId = useRef(0);

  useEffect(() => {
    if (
      state.status !== "success" ||
      state.requestId <= refreshedRequestId.current
    ) {
      return;
    }

    refreshedRequestId.current = state.requestId;
    router.refresh();
  }, [router, state.requestId, state.status]);
}

function ActionMessage({
  state,
}: {
  state: typeof INITIAL_NOTIFICATION_ACTION_STATE;
}) {
  if (!state.message) return null;

  return (
    <p
      className={state.status === "error" ? "text-xs text-destructive" : "sr-only"}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}

export function MarkNotificationReadForm({
  notificationId,
  title,
}: {
  notificationId: string;
  title: string;
}) {
  const [state, action, isPending] = useActionState(
    markNotificationReadAction,
    INITIAL_NOTIFICATION_ACTION_STATE,
  );
  useRefreshAfterSuccessfulRead(state);

  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="notificationId" value={notificationId} />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={isPending}
        aria-label={`Mark ${title} as read`}
      >
        <Check className="size-4" aria-hidden="true" />
        {isPending ? "Marking..." : "Mark as read"}
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}

export function MarkAllNotificationsReadForm() {
  const [state, action, isPending] = useActionState(
    markAllNotificationsReadAction,
    INITIAL_NOTIFICATION_ACTION_STATE,
  );
  useRefreshAfterSuccessfulRead(state);

  return (
    <form action={action} className="space-y-1">
      <Button type="submit" variant="outline" disabled={isPending}>
        <CheckCheck className="size-4" aria-hidden="true" />
        {isPending ? "Marking all..." : "Mark all as read"}
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}
