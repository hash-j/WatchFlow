import { Bell } from "lucide-react";

import { NotificationFeed } from "@/components/notifications/notification-feed";
import { EmptyState, PageContainer, PageHeader } from "@/components/ui/responsive-layout";
import { NotificationsPersistenceError } from "@/lib/notifications/errors";
import { getNotificationFeed } from "@/lib/notifications/supabase-notifications";

export default async function NotificationsPage() {
  let feed;
  let loadError: string | null = null;

  try {
    feed = await getNotificationFeed();
  } catch (error) {
    if (!(error instanceof NotificationsPersistenceError)) {
      throw error;
    }

    loadError = error.message;
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Account"
        title="Notifications"
        description="Review private system updates for your WatchFlow account."
      />
      {feed ? (
        <NotificationFeed {...feed} />
      ) : (
        <EmptyState
          icon={<Bell className="size-6" aria-hidden="true" />}
          title="Notifications are unavailable"
          description={loadError ?? "Your notifications could not be loaded."}
        />
      )}
    </PageContainer>
  );
}
