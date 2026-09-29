import { redirect } from "next/navigation";

import { CalendarSettings } from "@/components/settings/calendar-settings";
import { authenticateSettings } from "@/lib/settings/supabase-settings";

const messages: Record<string, string> = {
  connected: "Google Calendar connected.",
  denied: "Google Calendar access was not granted.",
  invalid: "That calendar connection request was invalid or expired.",
  failed: "Google Calendar could not be connected. Please try again.",
  unavailable: "Google Calendar connection is not configured.",
  disconnected: "Google Calendar disconnected and provider access revoked.",
  disconnected_local: "Google Calendar disconnected. Provider revocation could not be confirmed.",
  disconnect_failed: "Google Calendar could not be disconnected. Please try again.",
};

export default async function CalendarSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ calendar?: string }>;
}) {
  const session = await authenticateSettings();
  if (!session) redirect("/auth/login");

  const { data } = await session.client
    .from("calendar_connections")
    .select("display_email, sync_enabled, status")
    .eq("user_id", session.user.id)
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
          connection={data ? {
            displayEmail: String(data.display_email),
            syncEnabled: Boolean(data.sync_enabled),
            status: String(data.status),
          } : null}
        />
      </div>
    </section>
  );
}
