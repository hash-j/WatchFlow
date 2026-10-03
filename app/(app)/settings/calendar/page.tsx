import { CalendarSettings } from "@/components/settings/calendar-settings";
import { getAuthContext } from "@/lib/supabase/auth";

const messages: Record<string, string> = {
  connected: "Google Calendar connected.",
  cleanup_reauthorized:
    "Google Calendar access restored for disconnect cleanup. Calendar sync remains off.",
  denied: "Google Calendar access was not granted.",
  invalid: "That calendar connection request was invalid or expired.",
  failed: "Google Calendar could not be connected. Please try again.",
  unavailable: "Google Calendar connection is not configured.",
  disconnect_pending:
    "Google Calendar disconnect started. WatchFlow will remove only its own calendar events before deleting the local connection.",
  disconnected: "Google Calendar disconnected.",
  disconnect_failed: "Google Calendar could not be disconnected. Please try again.",
};

export default async function CalendarSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ calendar?: string }>;
}) {
  const { client, user } = await getAuthContext();

  const { data } = await client
    .from("calendar_connections")
    .select("display_email, sync_enabled, status, last_error_code")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle();
  const status = (await searchParams).calendar;

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-semibold">Calendar</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage the Google account WatchFlow will use for your primary calendar.
      </p>
      {status && messages[status] ? (
        <p role="status" className="mt-4 rounded-lg border bg-muted/50 p-3 text-sm">
          {messages[status]}
        </p>
      ) : null}
      <div className="mt-6">
        <CalendarSettings
          connection={
            data
              ? {
                  displayEmail: String(data.display_email),
                  syncEnabled: Boolean(data.sync_enabled),
                  status: String(data.status),
                  lastErrorCode:
                    typeof data.last_error_code === "string"
                      ? data.last_error_code
                      : null,
                }
              : null
          }
        />
      </div>
    </section>
  );
}
