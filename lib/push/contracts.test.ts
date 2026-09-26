import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Part 18E browser push foundation", () => {
  it("requests permission only from an explicit user action", () => {
    const component = source(
      "components/settings/push-notification-settings.tsx",
    );

    expect(component).toContain("async function enablePush()");
    expect(component).toContain("Notification.requestPermission()");
    expect(component).toContain("registration.pushManager.subscribe");
    expect(component).toContain("userVisibleOnly: true");
    expect(component).toContain("applicationServerKey:");
    expect(component).toContain("Enable push notifications");
  });

  it("uses server actions and never accepts an owner identifier", () => {
    const actions = source("app/(app)/actions/push.ts");
    const persistence = source("lib/push/supabase-push.ts");

    expect(actions).toContain("authenticateSettings()");
    expect(actions).toContain("pushSubscriptionSchema.safeParse(input)");
    expect(persistence).toContain("watchflow_save_push_subscription");
    expect(persistence).toContain("watchflow_disable_push_notifications");
    expect(`${actions}\n${persistence}`).not.toMatch(
      /SUPABASE_SECRET_KEY|service_role|createAdminClient|p_user_id/,
    );
  });

  it("returns imperative action feedback without remounting the settings UI", () => {
    const actions = source("app/(app)/actions/push.ts");
    const component = source(
      "components/settings/push-notification-settings.tsx",
    );

    expect(actions).not.toContain("revalidatePath");
    expect(component).toContain("setMessage(result.message)");
    expect(component).toContain("setEnabled(true)");
    expect(component).toContain("setThisBrowserSubscribed(true)");
  });

  it("keeps VAPID signing credentials server-only", () => {
    const config = source("lib/push/config.ts");
    const component = source(
      "components/settings/push-notification-settings.tsx",
    );
    const environment = source(".env.example");

    expect(config).toContain('import "server-only"');
    expect(config).toContain("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
    expect(config).toContain("VAPID_PRIVATE_KEY");
    expect(environment).toContain("NEXT_PUBLIC_VAPID_PUBLIC_KEY=");
    expect(environment).toContain("VAPID_PRIVATE_KEY=");
    expect(environment).not.toContain("NEXT_PUBLIC_VAPID_PRIVATE");
    expect(component).not.toMatch(/VAPID_PRIVATE|privateKey|service_role/);
  });

  it("dispatches only through fresh authenticated RLS reads", () => {
    const dispatcher = source("lib/notifications/dispatcher.ts");

    expect(dispatcher).toContain("client.auth.getUser()");
    expect(dispatcher).toContain('.from("push_subscriptions")');
    expect(dispatcher).toContain('.eq("user_id", user.id)');
    expect(dispatcher).not.toMatch(
      /SUPABASE_SECRET_KEY|service_role|createAdminClient|p_user_id/,
    );
  });

  it("shows bounded push payloads and opens only same-origin paths", () => {
    const worker = source("public/sw.js");

    expect(worker).toContain('addEventListener("push"');
    expect(worker).toContain("showNotification");
    expect(worker).toContain('addEventListener("notificationclick"');
    expect(worker).toContain('internalNotificationUrl(candidateUrl)');
    expect(worker).toContain('!value.startsWith("/")');
    expect(worker).toContain('value.startsWith("//")');
    expect(worker).toContain('value.includes("\\\\")');
    expect(worker).toContain('resolved.origin === self.location.origin');
    expect(worker).toContain("notificationId: payload.notificationId");
    expect(worker).not.toMatch(
      /addEventListener\(["'](?:sync|periodicsync)["']/,
    );

    const start = worker.indexOf("function internalNotificationUrl");
    const end = worker.indexOf('self.addEventListener("push"', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const normalize = runInNewContext(
      `${worker.slice(start, end)}; internalNotificationUrl`,
      {
        self: { location: { origin: "https://watchflow.test" } },
        URL,
      },
      { timeout: 1_000 },
    ) as (value: unknown) => string;
    expect(normalize("/watch-next?notification=qa#context")).toBe(
      "/watch-next?notification=qa#context",
    );
    expect(normalize("https://example.com/escape")).toBe("/notifications");
    expect(normalize("//example.com/escape")).toBe("/notifications");
  });

  it("tests the shipped URL guard without weakening the application CSP", () => {
    const acceptance = source("e2e/part18h-notification-center.spec.ts");
    const config = source("next.config.ts");

    expect(acceptance).toContain('from "node:vm"');
    expect(acceptance).toContain("runInNewContext(");
    expect(acceptance).not.toContain("new Function(");
    expect(acceptance).not.toContain("test.skip(!movie");
    expect(config).toContain(
      'process.env.NODE_ENV === "development" ? " \'unsafe-eval\'" : ""',
    );
  });
});
