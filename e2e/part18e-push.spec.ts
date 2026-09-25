import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { expect, test } from "./fixtures/qa";
import { expectNoUnexpectedBrowserFailures } from "./helpers/diagnostics";
import {
  authenticatedQaGuard,
  developmentTargetGuard,
  getE2eBaseUrl,
  getQaCredentials,
} from "./helpers/environment";

function publicSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) throw new Error("Public Supabase QA configuration is missing.");
  return { url, key };
}

async function authenticatedClient(kind: "A" | "B") {
  const { url, key } = publicSupabaseConfig();
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword(getQaCredentials(kind));
  if (error) throw new Error(`QA User ${kind} could not authenticate for push RLS acceptance.`);
  return client;
}

async function cleanupOwnPushSubscriptions(client: SupabaseClient) {
  const { error } = await client.rpc("watchflow_disable_push_notifications");
  if (error) throw new Error("QA push fixture cleanup failed.");
}

test.describe.configure({ mode: "serial" });

test.describe("Part 18E guarded push foundation acceptance", () => {
  test.skip(!developmentTargetGuard.enabled, developmentTargetGuard.reason);
  test.skip(!authenticatedQaGuard.enabled, authenticatedQaGuard.reason);
  test.skip(
    !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim(),
    "NEXT_PUBLIC_VAPID_PUBLIC_KEY is required for Push API acceptance",
  );

  test("permission, subscription persistence, disable, and two-user RLS work", async ({
    qaUserBContext,
    qaUserBPage,
    qaUserBAudit,
  }) => {
    test.setTimeout(120_000);
    const userA = await authenticatedClient("A");
    const userB = await authenticatedClient("B");

    try {
      await cleanupOwnPushSubscriptions(userB);
      await qaUserBContext.grantPermissions(["notifications"], {
        origin: new URL(getE2eBaseUrl()).origin,
      });

      await qaUserBPage.goto("/settings/notifications");
      await expect(
        qaUserBPage.getByRole("heading", {
          name: "Browser push notifications",
        }),
      ).toBeVisible();
      await qaUserBPage
        .getByRole("button", { name: "Enable push notifications" })
        .click();
      await expect(
        qaUserBPage.getByText("Push notifications are enabled for this account."),
      ).toBeVisible();
      await expect(qaUserBPage.getByText("Account preference: Enabled")).toBeVisible();
      await expect(qaUserBPage.getByText("This browser: Subscribed")).toBeVisible();

      const endpoint = await qaUserBPage.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        return (await registration.pushManager.getSubscription())?.endpoint ?? null;
      });
      expect(endpoint).toMatch(/^https:\/\//);

      const ownRows = await userB
        .from("push_subscriptions")
        .select("endpoint")
        .eq("endpoint", endpoint!);
      expect(ownRows.error).toBeNull();
      expect(ownRows.data).toEqual([{ endpoint }]);

      const crossOwnerRows = await userA
        .from("push_subscriptions")
        .select("endpoint")
        .eq("endpoint", endpoint!);
      expect(crossOwnerRows.error).toBeNull();
      expect(crossOwnerRows.data).toEqual([]);

      const enabledPreference = await userB
        .from("user_preferences")
        .select("push_notifications_enabled")
        .single();
      expect(enabledPreference.error).toBeNull();
      expect(enabledPreference.data?.push_notifications_enabled).toBe(true);

      await qaUserBPage
        .getByRole("button", { name: "Disable push on all devices" })
        .click();
      await expect(
        qaUserBPage.getByText("Push notifications are disabled for this account."),
      ).toBeVisible();
      await expect(qaUserBPage.getByText("Account preference: Disabled")).toBeVisible();
      await expect(qaUserBPage.getByText("This browser: Not subscribed")).toBeVisible();

      const removedRows = await userB
        .from("push_subscriptions")
        .select("id")
        .eq("endpoint", endpoint!);
      expect(removedRows.error).toBeNull();
      expect(removedRows.data).toEqual([]);
      expectNoUnexpectedBrowserFailures(qaUserBAudit);
    } finally {
      await cleanupOwnPushSubscriptions(userB);
      await qaUserBPage.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        await (await registration.pushManager.getSubscription())?.unsubscribe();
      }).catch(() => undefined);
      await userA.auth.signOut({ scope: "local" });
      await userB.auth.signOut({ scope: "local" });
    }
  });
});
