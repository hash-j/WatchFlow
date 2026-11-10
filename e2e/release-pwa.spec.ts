import { expect, test } from "@playwright/test";

// Public, read-only release audit: no credentials or remote data mutations.
test("production PWA serves local fonts, caches only static assets, and falls back offline", async ({ page, context }, testInfo) => {
  test.setTimeout(60_000);
  const externalFonts: string[] = [];
  page.on("request", (request) => {
    if (/fonts\.(?:googleapis|gstatic)\.com/.test(request.url())) externalFonts.push(request.url());
  });

  const response = await page.goto("/auth/sign-up");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(externalFonts).toEqual([]);
  const fonts = await page.evaluate(() => performance.getEntriesByType("resource")
    .map((entry) => entry.name).filter((name) => /\.woff2(?:\?|$)/.test(name)));
  expect(fonts.length).toBeGreaterThan(0);
  for (const font of fonts) {
    expect(new URL(font).origin).toBe(new URL(page.url()).origin);
    expect(new URL(font).pathname).toMatch(/^\/_next\/static\//);
  }
  const publicLoad = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    return {
      // Local lab observations, not production Core Web Vitals or budgets.
      route: location.pathname,
      ttfbMs: navigation.responseStart - navigation.requestStart,
      domContentLoadedMs: navigation.domContentLoadedEventEnd - navigation.startTime,
      scriptAndStyleBytes: resources.filter((entry) => /\.(?:js|css)(?:\?|$)/.test(entry.name))
        .reduce((total, entry) => total + entry.encodedBodySize, 0),
      fontBytes: resources.filter((entry) => /\.woff2(?:\?|$)/.test(entry.name))
        .reduce((total, entry) => total + entry.encodedBodySize, 0),
    };
  });
  await testInfo.attach("public-load-lab-observation", {
    body: JSON.stringify(publicLoad, null, 2), contentType: "application/json",
  });

  const manifestResponse = await page.request.get("/manifest.webmanifest");
  expect(manifestResponse.status()).toBe(200);
  expect(manifestResponse.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({ name: "WatchFlow", start_url: "/dashboard", scope: "/", display: "standalone" });
  for (const icon of manifest.icons) {
    const iconResponse = await page.request.get(icon.src);
    expect(iconResponse.status()).toBe(200);
    expect(iconResponse.headers()["content-type"]).toContain("image/png");
  }
  const workerResponse = await page.request.get("/sw.js");
  expect(workerResponse.status()).toBe(200);
  expect(workerResponse.headers()["cache-control"]).toContain("must-revalidate");
  expect(workerResponse.headers()["service-worker-allowed"]).toBe("/");

  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 20_000 }).toBe(true);
  const registration = await page.evaluate(async () => {
    const ready = await navigator.serviceWorker.ready;
    return { scope: ready.scope, script: ready.active?.scriptURL };
  });
  expect(new URL(registration.scope).pathname).toBe("/");
  expect(new URL(registration.script!).pathname).toBe("/sw.js");

  // Exercise private navigation while logged out, then inspect actual Cache Storage.
  for (const path of ["/dashboard", "/library", "/settings", "/notifications"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/auth\/login$/);
  }
  const cachedUrls = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const key of await caches.keys()) {
      if (!key.startsWith("watchflow-static-")) continue;
      const cache = await caches.open(key);
      urls.push(...(await cache.keys()).map((request) => request.url));
    }
    return urls;
  });
  expect(cachedUrls.some((url) => new URL(url).pathname === "/offline.html")).toBe(true);
  for (const cachedUrl of cachedUrls) {
    const parsed = new URL(cachedUrl);
    expect(parsed.origin).toBe(new URL(page.url()).origin);
    expect(parsed.pathname).toMatch(/^(?:\/_next\/static\/|\/icons\/|\/offline\.html$|\/favicon\.ico$)/);
  }

  await context.setOffline(true);
  try {
    await page.goto("/dashboard?release-offline-audit=1");
    await expect(page.getByRole("heading", { name: "You’re offline" })).toBeVisible();
    await expect(page.getByText("Nothing from your Library, notifications, or session is stored for offline use.", { exact: false })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
  await page.goto("/auth/sign-up");
  await expect(page.getByRole("button", { name: "Create account" })).toBeEnabled();
});
