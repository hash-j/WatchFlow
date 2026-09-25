import { Info } from "lucide-react";
import { redirect } from "next/navigation";

import { NotificationSettingsForm } from "@/components/settings/notification-settings-form";
import { getSettingsPageData } from "@/lib/settings/supabase-settings";

export default async function NotificationSettingsPage() {
  const data = await getSettingsPageData();
  if (!data) redirect("/auth/login");

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-semibold">Notifications</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose how you would like future reminders and summaries to work.
      </p>
      <div className="mt-4 flex gap-3 rounded-lg border bg-muted/50 p-4 text-sm">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          Private in-app system notifications are available now. Scheduled
          reminders, weekly summaries, email, and push notifications are not
          currently sent.
        </p>
      </div>
      <div className="mt-6 border-t pt-6">
        <NotificationSettingsForm preferences={data.preferences} />
      </div>
    </section>
  );
}
