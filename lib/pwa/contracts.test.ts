import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import manifest from "../../app/manifest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Part 18D installable PWA contract", () => {
  it("publishes standalone metadata with any-purpose and maskable icons", () => {
    const value = manifest();

    expect(value).toMatchObject({
      name: "WatchFlow",
      short_name: "WatchFlow",
      start_url: "/dashboard",
      scope: "/",
      display: "standalone",
      background_color: "#121212",
      theme_color: "#121212",
    });
    expect(value.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: "/icons/watchflow-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        }),
        expect.objectContaining({
          src: "/icons/watchflow-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        }),
        expect.objectContaining({
          src: "/icons/watchflow-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        }),
      ]),
    );

    const layout = source("app/layout.tsx");
    expect(layout).toContain('manifest: "/manifest.webmanifest"');
    expect(layout).toContain("appleWebApp");
    expect(layout).toContain("export const viewport");
  });

  it("registers one root-scoped service worker without a worker-side auth path", () => {
    const registration = source(
      "components/pwa/service-worker-registration.tsx",
    );
    const layout = source("app/layout.tsx");

    expect(registration).toContain('"serviceWorker" in navigator');
    expect(registration).toContain('register("/sw.js"');
    expect(registration).toContain('scope: "/"');
    expect(registration).toContain('updateViaCache: "none"');
    expect(layout).toContain("<ServiceWorkerRegistration />");
  });
});

describe("Part 18D service worker privacy contract", () => {
  const worker = source("public/sw.js");

  it("uses network-only navigation with a generic offline shell fallback", () => {
    expect(worker).toContain('request.mode === "navigate"');
    expect(worker).toContain("fetch(request).catch");
    expect(worker).toContain("caches.match(OFFLINE_URL)");
    expect(worker).toContain('const OFFLINE_URL = "/offline.html"');

    const offline = source("public/offline.html");
    expect(offline).toContain("You’re offline");
    expect(offline).toContain("needs a connection to load your private account data");
  });

  it("caches only explicit public static assets and no private data route", () => {
    const precache = worker.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/)?.[1];
    expect(precache).toBeTruthy();
    expect(worker).toContain('const OFFLINE_URL = "/offline.html"');
    expect(precache).toContain("OFFLINE_URL");
    expect(precache).toContain("/icons/");
    expect(precache).not.toMatch(
      /dashboard|library|notifications|supabase|auth|settings|watch-next/i,
    );

    expect(worker).toContain('url.pathname.startsWith("/_next/static/")');
    expect(worker).toContain('url.pathname.startsWith("/icons/")');
    expect(worker).toContain("if (!isCacheableStaticAsset(url)) return;");
    expect(worker).not.toMatch(
      /addEventListener\(["'](?:push|sync|periodicsync|notificationclick)["']/,
    );
    expect(worker).not.toMatch(/supabase|access_token|refresh_token/i);
  });

  it("keeps PWA public files outside auth cookie middleware", () => {
    const proxy = source("proxy.ts");
    expect(proxy).toContain("sw.js");
    expect(proxy).toContain("offline.html");
    expect(proxy).toContain("manifest.webmanifest");
    expect(proxy).toContain("icons/");
  });
});
