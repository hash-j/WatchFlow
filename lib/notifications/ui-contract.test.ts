import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Part 18C-1 notification UI contracts", () => {
  it("adds a protected notification feed to shared navigation", () => {
    const proxy = source("lib/supabase/proxy.ts");
    const navigation = source("components/app-navigation.tsx");
    const page = source("app/(app)/notifications/page.tsx");

    expect(proxy).toContain('"/notifications"');
    expect(navigation).toContain('href: "/notifications"');
    expect(navigation).toContain("unreadCount > 99 ? \"99+\" : unreadCount");
    expect(page).toContain("getNotificationFeed()");
    expect(page).toContain("<NotificationFeed {...feed} />");
  });

  it("keeps the feed system-only and states excluded delivery scope", () => {
    const feed = source("components/notifications/notification-feed.tsx");
    const types = source("lib/notifications/types.ts");

    expect(types).toContain('NOTIFICATION_TYPES = ["system"]');
    expect(feed).toContain("Email, scheduled reminders, summaries, and push delivery are not part of this release.");
    expect(feed).toContain("MarkNotificationReadForm");
    expect(feed).toContain("MarkAllNotificationsReadForm");
  });

  it("loads unread count from the authenticated layout without a browser client", () => {
    const layout = source("app/(app)/layout.tsx");
    const service = source("lib/notifications/supabase-notifications.ts");

    expect(layout).toContain("countUnreadNotifications(");
    expect(layout).toContain("unreadNotificationCount=");
    expect(service).toContain('import "server-only"');
    expect(service).toContain("getAuthContext()");
    expect(service).toContain("client.auth.getUser()");
    expect(service).not.toContain("SUPABASE_SECRET_KEY");
  });
});
