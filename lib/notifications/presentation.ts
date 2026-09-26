import type { NotificationCategory } from "./types";

export const NOTIFICATION_CATEGORY_LABELS: Record<
  NotificationCategory,
  string
> = {
  movie_status: "Movie status",
  watch_next: "Watch Next",
  custom_lists: "Custom lists",
  imports: "Imports",
};

export function notificationActionUrl(
  actionPath: string,
  notificationId: string,
  source: "center" | "push",
) {
  if (
    !actionPath.startsWith("/") ||
    actionPath.startsWith("//") ||
    actionPath.includes("\\")
  ) {
    return "/notifications";
  }

  try {
    const url = new URL(actionPath, "https://watchflow.invalid");
    if (url.origin !== "https://watchflow.invalid") return "/notifications";

    url.searchParams.set("notification", notificationId);
    url.searchParams.set("notificationSource", source);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/notifications";
  }
}
