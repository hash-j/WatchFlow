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
  const candidateUrl =
    typeof value.actionUrl === "string"
      ? value.actionUrl.trim()
      : typeof value.actionPath === "string"
        ? value.actionPath.trim()
        : "";
  const actionUrl = internalNotificationUrl(candidateUrl);
  const imageUrl =
    typeof value.imageUrl === "string" &&
    value.imageUrl.startsWith("https://image.tmdb.org/t/p/")
      ? value.imageUrl
      : undefined;
  const notificationId =
    typeof value.notificationId === "string"
      ? value.notificationId.slice(0, 64)
      : null;

  return { title, body, actionUrl, imageUrl, notificationId };
}

function internalNotificationUrl(value) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return "/notifications";
  }

  try {
    const resolved = new URL(value, self.location.origin);
    return resolved.origin === self.location.origin
      ? `${resolved.pathname}${resolved.search}${resolved.hash}`
      : "/notifications";
  } catch {
    return "/notifications";
  }
}

self.addEventListener("push", (event) => {
  const payload = pushPayload(event);
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/watchflow-192.png",
      badge: "/icons/watchflow-192.png",
      image: payload.imageUrl,
      tag: payload.notificationId
        ? `watchflow-${payload.notificationId}`
        : undefined,
      data: {
        actionUrl: payload.actionUrl,
        notificationId: payload.notificationId,
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const candidateUrl = event.notification.data?.actionUrl;
  const actionUrl = internalNotificationUrl(candidateUrl);
  const targetUrl = new URL(actionUrl, self.location.origin).href;

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
