import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  it("supports public VAPID configuration without exposing private keys", () => {
    const config = source("lib/push/config.ts");
    const environment = source(".env.example");

    expect(config).toContain("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
    expect(environment).toContain("NEXT_PUBLIC_VAPID_PUBLIC_KEY=");
    expect(config).not.toMatch(/PRIVATE|SECRET|service_role/);
  });

  it("shows bounded push payloads and opens only same-origin paths", () => {
    const worker = source("public/sw.js");

    expect(worker).toContain('addEventListener("push"');
    expect(worker).toContain("showNotification");
    expect(worker).toContain('addEventListener("notificationclick"');
    expect(worker).toContain('candidatePath.startsWith("/")');
    expect(worker).toContain('!candidatePath.startsWith("//")');
    expect(worker).toContain('new URL(actionPath, self.location.origin)');
    expect(worker).not.toMatch(
      /addEventListener\(["'](?:sync|periodicsync)["']/,
    );
  });
});
