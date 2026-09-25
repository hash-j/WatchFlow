import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures/qa";
import {
  authenticatedQaGuard,
  developmentTargetGuard,
} from "./helpers/environment";

const allowedCachedPath =
  /^(?:\/_next\/static\/|\/icons\/|\/offline\.html$|\/favicon\.ico$)/;

async function waitForServiceWorkerControl(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error("Service worker did not claim the page.")),
        15_000,
      );
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => {
          window.clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
    });
  });
}

test.describe("Part 18D guarded PWA foundation acceptance", () => {
  test.skip(!developmentTargetGuard.enabled, developmentTargetGuard.reason);
  test.skip(!authenticatedQaGuard.enabled, authenticatedQaGuard.reason);

  test("manifest, registration, static-only caching, and offline shell work", async ({
    qaUserBPage,
  }) => {
    test.setTimeout(120_000);

    const manifestResponse = await qaUserBPage.request.get(
      "/manifest.webmanifest",
    );
    expect(manifestResponse.status()).toBe(200);
    expect(manifestResponse.headers()["content-type"]).toContain(
      "application/manifest+json",
    );
    const manifest = await manifestResponse.json();
    expect(manifest).toMatchObject({
      name: "WatchFlow",
      start_url: "/dashboard",
      display: "standalone",
    });
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192", purpose: "any" }),
        expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
      ]),
    );

    const iconResponse = await qaUserBPage.request.get(
      "/icons/watchflow-192.png",
    );
    expect(iconResponse.status()).toBe(200);
    expect(iconResponse.headers()["content-type"]).toContain("image/png");

    await qaUserBPage.goto("/dashboard");
    await waitForServiceWorkerControl(qaUserBPage);
    const registration = await qaUserBPage.evaluate(async () => {
      const ready = await navigator.serviceWorker.ready;
      return {
        scope: ready.scope,
        scriptURL: ready.active?.scriptURL ?? "",
      };
    });
    expect(new URL(registration.scope).pathname).toBe("/");
    expect(new URL(registration.scriptURL).pathname).toBe("/sw.js");

    await qaUserBPage.goto("/notifications");
    await expect(
      qaUserBPage.getByRole("heading", { name: "Notifications", level: 1 }),
    ).toBeVisible();
    await qaUserBPage.goto("/library");
    await expect(
      qaUserBPage.getByRole("heading", { name: "Library", level: 1 }),
    ).toBeVisible();

    const cachedUrls = await qaUserBPage.evaluate(async () => {
      const urls: string[] = [];
      for (const key of await caches.keys()) {
        if (!key.startsWith("watchflow-static-")) continue;
        const cache = await caches.open(key);
        urls.push(...(await cache.keys()).map((request) => request.url));
      }
      return urls;
    });
    expect(cachedUrls.length).toBeGreaterThan(0);
    for (const cachedUrl of cachedUrls) {
      const parsed = new URL(cachedUrl);
      expect(parsed.origin).toBe(new URL(qaUserBPage.url()).origin);
      expect(parsed.pathname).toMatch(allowedCachedPath);
      expect(parsed.pathname).not.toMatch(
        /dashboard|library|notifications|settings|auth|watch-next/i,
      );
    }

    await qaUserBPage.context().setOffline(true);
    try {
      await qaUserBPage.goto(`/dashboard?part18d-offline=${Date.now()}`);
      await expect(
        qaUserBPage.getByRole("heading", { name: "You’re offline" }),
      ).toBeVisible();
      await expect(
        qaUserBPage.getByText(
          "Nothing from your Library, notifications, or session is stored for offline use.",
          { exact: false },
        ),
      ).toBeVisible();
    } finally {
      await qaUserBPage.context().setOffline(false);
    }

    const signUpResponse = await qaUserBPage.request.get("/auth/sign-up");
    expect(signUpResponse.status()).not.toBe(404);
  });
});
