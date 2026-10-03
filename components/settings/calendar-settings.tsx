"use client";

import { useActionState } from "react";
import { CalendarDays, ExternalLink, Unplug } from "lucide-react";

import {
  disconnectGoogleCalendarAction,
  setCalendarSyncEnabledAction,
} from "@/app/(app)/settings/calendar/actions";
import { Button } from "@/components/ui/button";
import { INITIAL_SETTINGS_ACTION_STATE } from "@/lib/settings/types";
import { FormMessage } from "./form-message";

export type CalendarConnectionView = {
  displayEmail: string;
  syncEnabled: boolean;
  status: string;
  lastErrorCode: string | null;
};

export function CalendarSettings({
  connection,
}: {
  connection: CalendarConnectionView | null;
}) {
  const [state, action, pending] = useActionState(
    setCalendarSyncEnabledAction,
    INITIAL_SETTINGS_ACTION_STATE,
  );

  if (!connection) {
    return (
      <div className="rounded-lg border bg-muted/30 p-5">
        <div className="flex items-start gap-3">
          <CalendarDays className="mt-0.5 size-5" aria-hidden="true" />
          <div>
            <h3 className="font-semibold">Google Calendar is not connected</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect your account to synchronize scheduled movies with your
              primary calendar.
            </p>
          </div>
        </div>
        <Button asChild className="mt-4">
          <a href="/api/calendar/google/start">
            Connect Google Calendar
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        </Button>
      </div>
    );
  }

  const disconnecting = connection.status === "disconnect_pending";
  const cleanupNeedsAuthorization =
    disconnecting &&
    [
      "provider_reconnect_required",
      "google_authorization_required",
      "calendar_credential_invalid",
    ].includes(connection.lastErrorCode ?? "");

  return (
    <div className="space-y-5">
      <div className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">Connected Google account</p>
        <p className="mt-1 font-medium break-all">{connection.displayEmail}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Primary calendar · {connection.status}
        </p>
      </div>

      {disconnecting ? (
        <p role="status" className="rounded-lg border bg-muted/50 p-3 text-sm">
          {cleanupNeedsAuthorization
            ? "Reconnect the same Google account so WatchFlow can finish removing its calendar events. Calendar sync will remain off."
            : "Disconnect cleanup is in progress. Calendar sync is off and only WatchFlow-owned events will be removed."}
        </p>
      ) : null}

      {!disconnecting ? (
        <form action={action} className="space-y-3">
          <input
            type="hidden"
            name="enabled"
            value={connection.syncEnabled ? "false" : "true"}
          />
          <Button type="submit" variant="outline" disabled={pending}>
            {pending
              ? "Saving..."
              : connection.syncEnabled
                ? "Pause calendar sync"
                : "Enable calendar sync"}
          </Button>
          <FormMessage state={state} />
        </form>
      ) : null}

      <div className="flex flex-wrap gap-3 border-t pt-5">
        <Button asChild variant="outline">
          <a href="/api/calendar/google/start">
            {disconnecting ? "Reconnect to finish cleanup" : "Reconnect account"}
          </a>
        </Button>
        {!disconnecting ? (
          <form action={disconnectGoogleCalendarAction}>
            <Button type="submit" variant="destructive">
              <Unplug className="size-4" aria-hidden="true" /> Disconnect
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

