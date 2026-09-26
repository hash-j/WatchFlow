import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  markOne: vi.fn(),
  markAll: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/notifications/supabase-notifications", () => ({
  markOwnedNotificationRead: mocks.markOne,
  markAllOwnedNotificationsRead: mocks.markAll,
}));

import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "../../app/(app)/actions/notifications";
import { INITIAL_NOTIFICATION_ACTION_STATE } from "./types";

const notificationId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.markOne.mockResolvedValue(true);
  mocks.markAll.mockResolvedValue(2);
});

describe("notification read actions", () => {
  it("validates the identifier and ignores browser owner input", async () => {
    const formData = new FormData();
    formData.set("notificationId", notificationId);
    formData.set("userId", "browser-supplied-owner");

    const state = await markNotificationReadAction(
      INITIAL_NOTIFICATION_ACTION_STATE,
      formData,
    );

    expect(mocks.markOne).toHaveBeenCalledWith(notificationId);
    expect(mocks.markOne.mock.calls[0]).not.toContain("browser-supplied-owner");
    expect(state).toMatchObject({ status: "success", requestId: 1 });
  });

  it("does not call the service for an invalid identifier", async () => {
    const formData = new FormData();
    formData.set("notificationId", "not-a-uuid");

    const state = await markNotificationReadAction(
      INITIAL_NOTIFICATION_ACTION_STATE,
      formData,
    );

    expect(state.status).toBe("error");
    expect(mocks.markOne).not.toHaveBeenCalled();
  });

  it("marks all owned notifications and returns client-refresh state", async () => {
    const state = await markAllNotificationsReadAction(
      INITIAL_NOTIFICATION_ACTION_STATE,
    );

    expect(mocks.markAll).toHaveBeenCalledOnce();
    expect(state).toMatchObject({
      status: "success",
      message: "2 notifications marked as read.",
    });
  });

  it("returns controlled failures without exposing backend errors", async () => {
    mocks.markOne.mockRejectedValue(new Error("private database payload"));
    const formData = new FormData();
    formData.set("notificationId", notificationId);

    const state = await markNotificationReadAction(
      INITIAL_NOTIFICATION_ACTION_STATE,
      formData,
    );

    expect(state.message).toBe(
      "The notification could not be updated. Please try again.",
    );
    expect(state.message).not.toContain("private database");
  });
});
