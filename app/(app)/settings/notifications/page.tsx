import { Info } from "lucide-react";
import { redirect } from "next/navigation";

import { NotificationSettingsForm } from "@/components/settings/notification-settings-form";
import { PushNotificationSettings } from "@/components/settings/push-notification-settings";
import { getVapidPublicKey } from "@/lib/push/config";
import { getSettingsPageData } from "@/lib/settings/supabase-settings";

export default async function NotificationSettingsPage() {
  const data = await getSettingsPageData();
  if (!data) redirect("/auth/login");
  const vapidPublicKey = getVapidPublicKey();

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-semibold">Notifications</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Control notification categories and delivery for your account.
      </p>
      <div className="mt-4 flex gap-3 rounded-lg border bg-muted/50 p-4 text-sm">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          Private in-app system notifications are available now. When push is
          enabled, supported system events can also be delivered to subscribed
          browsers. Scheduled reminders, weekly summaries, and email are not
          currently sent.
        </p>
      </div>
      <div className="mt-6 border-t pt-6">
        <NotificationSettingsForm preferences={data.preferences} />
      </div>
      <div className="mt-6 border-t pt-6">
        <PushNotificationSettings
          initiallyEnabled={data.preferences.pushNotificationsEnabled}
          vapidPublicKey={vapidPublicKey}
        />
      </div>
    </section>
  );
}
