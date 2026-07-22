import { Info } from "lucide-react";
import { redirect } from "next/navigation";

import { NotificationSettingsForm } from "@/components/settings/notification-settings-form";
import { getSettingsPageData } from "@/lib/settings/supabase-settings";

export default async function NotificationSettingsPage() {
  const data = await getSettingsPageData();
  if (!data) redirect("/auth/login");

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-semibold">Notification preferences</h2>
      <div className="mt-4 flex gap-3 rounded-lg border bg-muted/50 p-4 text-sm">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          Notification delivery will be enabled in a future update. Your
          preferences are saved now; reminders and email are not currently sent.
        </p>
      </div>
      <div className="mt-6 border-t pt-6">
        <NotificationSettingsForm preferences={data.preferences} />
      </div>
    </section>
  );
}
