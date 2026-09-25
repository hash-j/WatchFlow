import { NOTIFICATION_TYPES, type NotificationItem } from "./types";
import { NotificationsPersistenceError } from "./errors";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function requiredText(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optionalText(value: unknown) {
  return typeof value === "string" ? value : null;
}

function internalActionPath(value: unknown) {
  const path = optionalText(value);
  return path && path.startsWith("/") && !path.startsWith("//")
    ? path
    : null;
}

export function mapNotification(value: unknown): NotificationItem {
  const row = record(value);
  const id = requiredText(row?.id);
  const title = requiredText(row?.title);
  const body = requiredText(row?.body);
  const createdAt = requiredText(row?.created_at);
  const type = requiredText(row?.type);
  const metadata = record(row?.metadata);

  if (
    !row ||
    !id ||
    !title ||
    !body ||
    !createdAt ||
    !type ||
    !metadata ||
    !(NOTIFICATION_TYPES as readonly string[]).includes(type)
  ) {
    throw new NotificationsPersistenceError(
      "The notification response was invalid. Please try again.",
    );
  }

  return {
    id,
    type: type as NotificationItem["type"],
    title,
    body,
    actionPath: internalActionPath(row.action_path),
    metadata,
    readAt: optionalText(row.read_at),
    createdAt,
  };
}

export function mapNotifications(value: unknown): NotificationItem[] {
  if (!Array.isArray(value)) {
    throw new NotificationsPersistenceError(
      "The notification feed response was invalid. Please try again.",
    );
  }

  return value.map(mapNotification);
}
