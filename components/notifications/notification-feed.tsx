"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Bell, Circle } from "lucide-react";

import {
  MarkAllNotificationsReadForm,
  MarkNotificationReadForm,
} from "@/components/notifications/notification-actions";
import { Button } from "@/components/ui/button";
import { MoviePoster } from "@/components/movies/movie-poster";
import { EmptyState } from "@/components/ui/responsive-layout";
import {
  NOTIFICATION_CATEGORY_LABELS,
  notificationActionUrl,
} from "@/lib/notifications/presentation";
import type { NotificationItem } from "@/lib/notifications/types";
import { cn } from "@/lib/utils";

const UNREAD_COUNT_EVENT = "watchflow:notification-unread-count";

function publishUnreadCount(unreadCount: number) {
  window.dispatchEvent(
    new CustomEvent(UNREAD_COUNT_EVENT, { detail: unreadCount }),
  );
}

function formatCreatedAt(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

export function NotificationFeed({
  notifications,
  unreadCount,
  timeZone,
}: {
  notifications: NotificationItem[];
  unreadCount: number;
  timeZone: string;
}) {
  const [visibleNotifications, setVisibleNotifications] = useState(notifications);
  const [visibleUnreadCount, setVisibleUnreadCount] = useState(unreadCount);

  const markRead = useCallback(
    (notificationId: string) => {
      const target = visibleNotifications.find(
        ({ id }) => id === notificationId,
      );
      if (!target || target.readAt !== null) return;

      const nextUnreadCount = Math.max(0, visibleUnreadCount - 1);
      setVisibleNotifications((current) =>
        current.map((notification) =>
          notification.id === notificationId
            ? { ...notification, readAt: new Date().toISOString() }
            : notification,
        ),
      );
      setVisibleUnreadCount(nextUnreadCount);
      publishUnreadCount(nextUnreadCount);
    },
    [visibleNotifications, visibleUnreadCount],
  );

  const markAllRead = useCallback(() => {
    if (visibleUnreadCount === 0) return;

    const readAt = new Date().toISOString();
    setVisibleNotifications((current) =>
      current.map((notification) =>
        notification.readAt === null
          ? { ...notification, readAt }
          : notification,
      ),
    );
    setVisibleUnreadCount(0);
    publishUnreadCount(0);
  }, [visibleUnreadCount]);

  if (visibleNotifications.length === 0) {
    return (
      <EmptyState
        icon={<Bell className="size-6" aria-hidden="true" />}
        title="No notifications yet"
        description="Movie activity, Watch Next, list, and import updates will appear here when their categories are enabled."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex min-w-0 flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {visibleUnreadCount} unread
        </p>
        <MarkAllNotificationsReadForm
          onReadAll={markAllRead}
          hideWhenComplete={visibleUnreadCount === 0}
        />
      </div>

      <ol className="space-y-3" aria-label="Notification feed">
        {visibleNotifications.map((notification) => {
          const unread = notification.readAt === null;

          return (
            <li
              key={notification.id}
              className={cn(
                "rounded-xl border bg-card p-4 shadow-sm sm:p-5",
                unread && "border-primary/40 bg-primary/[0.03]",
              )}
            >
              <article className="flex min-w-0 gap-3">
                <Circle
                  className={cn(
                    "mt-1 size-2.5 shrink-0",
                    unread ? "fill-primary text-primary" : "fill-muted text-muted",
                  )}
                  aria-hidden="true"
                />
                {notification.moviePosterPath ? (
                  <div className="w-14 shrink-0 sm:w-16">
                    <MoviePoster
                      path={notification.moviePosterPath}
                      title={notification.movieTitle ?? notification.title}
                      sizes="64px"
                    />
                  </div>
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-col justify-between gap-1 sm:flex-row sm:gap-4">
                    <h2 className="break-words font-semibold">
                      {notification.title}
                    </h2>
                    <time
                      dateTime={notification.createdAt}
                      className="shrink-0 text-xs text-muted-foreground"
                    >
                      {formatCreatedAt(notification.createdAt, timeZone)}
                    </time>
                  </div>
                  {notification.category ? (
                    <p className="mt-1 text-xs font-medium text-primary">
                      {NOTIFICATION_CATEGORY_LABELS[notification.category]}
                    </p>
                  ) : null}
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                    {notification.body}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {notification.actionPath ? (
                      <Button asChild size="sm">
                        <Link
                          href={notificationActionUrl(
                            notification.actionPath,
                            notification.id,
                            "center",
                          )}
                        >
                          View details
                        </Link>
                      </Button>
                    ) : null}
                    <MarkNotificationReadForm
                      notificationId={notification.id}
                      title={notification.title}
                      onRead={() => markRead(notification.id)}
                      read={!unread}
                    />
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
