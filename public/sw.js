const CACHE_PREFIX = "watchflow-static-";
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icons/watchflow-192.png",
  "/icons/watchflow-512.png",
  "/icons/watchflow-maskable-512.png",
  "/icons/watchflow-apple-180.png",
];

function isCacheableStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icons/") ||
      url.pathname === "/favicon.ico")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const fallback = await caches.match(OFFLINE_URL);
        return fallback ?? Response.error();
      }),
    );
    return;
  }

  if (!isCacheableStaticAsset(url)) return;

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached;

      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    }),
  );
});

function pushPayload(event) {
  let value = {};
  try {
    value = event.data?.json() ?? {};
  } catch {
    value = {};
  }

  const title =
    typeof value.title === "string" && value.title.trim()
      ? value.title.trim().slice(0, 100)
      : "WatchFlow";
  const body =
    typeof value.body === "string"
      ? value.body.trim().slice(0, 300)
      : "You have a new WatchFlow notification.";
  const candidatePath =
    typeof value.actionPath === "string" ? value.actionPath.trim() : "";
  const actionPath =
    candidatePath.startsWith("/") && !candidatePath.startsWith("//")
      ? candidatePath
      : "/notifications";

  return { title, body, actionPath };
}

self.addEventListener("push", (event) => {
  const payload = pushPayload(event);
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/watchflow-192.png",
      badge: "/icons/watchflow-192.png",
      data: { actionPath: payload.actionPath },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const candidatePath = event.notification.data?.actionPath;
  const actionPath =
    typeof candidatePath === "string" &&
    candidatePath.startsWith("/") &&
    !candidatePath.startsWith("//")
      ? candidatePath
      : "/notifications";
  const targetUrl = new URL(actionPath, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clients) => {
        const existing = clients.find((client) => client.url.startsWith(self.location.origin));
        if (existing) {
          await existing.navigate(targetUrl);
          return existing.focus();
        }
        return self.clients.openWindow(targetUrl);
      }),
  );
});
