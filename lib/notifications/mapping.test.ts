import { describe, expect, it } from "vitest";

import { NotificationsPersistenceError } from "./errors";
import { mapNotification, mapNotifications } from "./mapping";

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "system",
  title: "WatchFlow update",
  body: "Your notification center is ready.",
  action_path: "/settings/notifications",
  metadata: { source: "release" },
  read_at: null,
  created_at: "2026-09-25T09:00:00.000Z",
};

describe("notification response mapping", () => {
  it("maps the bounded system notification shape", () => {
    expect(mapNotification(row)).toEqual({
      id: row.id,
      type: "system",
      title: row.title,
      body: row.body,
      actionPath: row.action_path,
      metadata: row.metadata,
      readAt: null,
      createdAt: row.created_at,
    });
    expect(mapNotifications([row])).toHaveLength(1);
  });

  it("rejects unsupported types and malformed metadata", () => {
    expect(() => mapNotification({ ...row, type: "email" })).toThrow(
      NotificationsPersistenceError,
    );
    expect(() => mapNotification({ ...row, metadata: [] })).toThrow(
      NotificationsPersistenceError,
    );
    expect(() => mapNotifications({ notifications: [row] })).toThrow(
      NotificationsPersistenceError,
    );
  });

  it("drops a malformed external action path defensively", () => {
    expect(mapNotification({ ...row, action_path: "https://example.com" }).actionPath).toBeNull();
    expect(mapNotification({ ...row, action_path: "//example.com" }).actionPath).toBeNull();
  });
});
