"use client";

import { useEffect, useState } from "react";
import { BellRing, BellOff } from "lucide-react";

import {
  disablePushNotificationsAction,
  savePushSubscriptionAction,
} from "@/app/(app)/actions/push";
import { Button } from "@/components/ui/button";

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const decoded = window.atob(base64);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function pushIsSupported() {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function PushNotificationSettings({
  initiallyEnabled,
  vapidPublicKey,
}: {
  initiallyEnabled: boolean;
  vapidPublicKey: string | null;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [thisBrowserSubscribed, setThisBrowserSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function inspectBrowserPushState() {
      const browserSupportsPush = pushIsSupported();
      setSupported(browserSupportsPush);
      if (!browserSupportsPush) return;

      setPermission(Notification.permission);
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setThisBrowserSubscribed(subscription !== null);
      } catch {
        setThisBrowserSubscribed(false);
      }
    }

    void inspectBrowserPushState();
  }, []);

  async function enablePush() {
    if (!pushIsSupported() || !vapidPublicKey) return;

    setPending(true);
    setMessage(null);
    let createdSubscription: PushSubscription | null = null;
    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") {
        setMessage("Browser notification permission was not granted.");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
        createdSubscription = subscription;
      }

      const serialized = subscription.toJSON();
      const result = await savePushSubscriptionAction({
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime,
        keys: serialized.keys,
      });
      if (result.status === "error") {
        if (createdSubscription) await createdSubscription.unsubscribe();
        setMessage(result.message);
        return;
      }

      setEnabled(true);
      setThisBrowserSubscribed(true);
      setMessage(result.message);
    } catch {
      if (createdSubscription) await createdSubscription.unsubscribe().catch(() => false);
      setMessage("This browser could not create a push subscription.");
    } finally {
      setPending(false);
    }
  }

  async function disablePush() {
    if (!pushIsSupported()) return;

    setPending(true);
    setMessage(null);
    try {
      const result = await disablePushNotificationsAction();
      if (result.status === "error") {
        setMessage(result.message);
        return;
      }

      setEnabled(false);
      setMessage(result.message);
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) await subscription.unsubscribe();
        setThisBrowserSubscribed(false);
      } catch {
        setMessage(
          "Push is disabled for your account, but this browser could not remove its local subscription.",
        );
      }
    } catch {
      setMessage("Push notifications could not be disabled. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const unavailable = supported === false || !vapidPublicKey;

  return (
    <section aria-labelledby="push-notifications-heading" className="space-y-4">
      <div>
        <h3 id="push-notifications-heading" className="font-semibold">
          Browser push notifications
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Store a secure subscription for this browser. Automated push delivery
          is not included in this foundation.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 text-sm">
        <p>
          Account preference: <strong>{enabled ? "Enabled" : "Disabled"}</strong>
        </p>
        <p>
          This browser: <strong>{thisBrowserSubscribed ? "Subscribed" : "Not subscribed"}</strong>
        </p>
        {permission === "denied" ? (
          <p className="mt-2 text-destructive">
            Permission is blocked in this browser. Update the site permission to
            enable push.
          </p>
        ) : null}
        {supported === false ? (
          <p className="mt-2 text-muted-foreground">
            Push notifications are not supported by this browser.
          </p>
        ) : null}
        {!vapidPublicKey ? (
          <p className="mt-2 text-muted-foreground">
            Push subscription configuration is not available in this environment.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {!thisBrowserSubscribed ? (
          <Button type="button" disabled={pending || unavailable || permission === "denied" || supported !== true} onClick={enablePush}>
            <BellRing className="size-4" aria-hidden="true" />
            {pending
              ? "Enabling..."
              : enabled
                ? "Enable push on this browser"
                : "Enable push notifications"}
          </Button>
        ) : null}
        {enabled ? (
          <Button type="button" variant="outline" disabled={pending || supported !== true} onClick={disablePush}>
            <BellOff className="size-4" aria-hidden="true" />
            {pending ? "Disabling..." : "Disable push on all devices"}
          </Button>
        ) : null}
        {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
    </section>
  );
}
