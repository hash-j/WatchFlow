"use client";

import { useActionState, useEffect, useRef } from "react";
import { Check, CheckCheck } from "lucide-react";

import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/(app)/actions/notifications";
import { Button } from "@/components/ui/button";
import { INITIAL_NOTIFICATION_ACTION_STATE } from "@/lib/notifications/types";

function useNotifyAfterSuccessfulRead(
  state: typeof INITIAL_NOTIFICATION_ACTION_STATE,
  onSuccess: (() => void) | undefined,
) {
  const notifiedRequestId = useRef(0);

  useEffect(() => {
    if (
      state.status !== "success" ||
      state.requestId <= notifiedRequestId.current
    ) {
      return;
    }

    notifiedRequestId.current = state.requestId;
    onSuccess?.();
  }, [onSuccess, state.requestId, state.status]);
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
  onRead,
  read = false,
}: {
  notificationId: string;
  title: string;
  onRead?: () => void;
  read?: boolean;
}) {
  const [state, action, isPending] = useActionState(
    markNotificationReadAction,
    INITIAL_NOTIFICATION_ACTION_STATE,
  );
  useNotifyAfterSuccessfulRead(state, onRead);

  return (
    <>
      <form action={action} className="space-y-1" hidden={read}>
        <input type="hidden" name="notificationId" value={notificationId} />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={isPending || read}
          aria-label={`Mark ${title} as read`}
        >
          <Check className="size-4" aria-hidden="true" />
          {isPending ? "Marking..." : "Mark as read"}
        </Button>
        <ActionMessage state={state} />
      </form>
      {read ? (
        <span className="text-xs font-medium text-muted-foreground">Read</span>
      ) : null}
    </>
  );
}

export function MarkAllNotificationsReadForm({
  onReadAll,
  hideWhenComplete = false,
}: {
  onReadAll?: () => void;
  hideWhenComplete?: boolean;
}) {
  const [state, action, isPending] = useActionState(
    markAllNotificationsReadAction,
    INITIAL_NOTIFICATION_ACTION_STATE,
  );
  useNotifyAfterSuccessfulRead(state, onReadAll);

  return (
    <form
      action={action}
      className="space-y-1"
      hidden={hideWhenComplete}
    >
      <Button
        type="submit"
        variant="outline"
        disabled={isPending || hideWhenComplete}
      >
        <CheckCheck className="size-4" aria-hidden="true" />
        {isPending ? "Marking all..." : "Mark all as read"}
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}
