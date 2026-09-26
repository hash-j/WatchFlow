import { describe, expect, it } from "vitest";

import { notificationActionUrl } from "./presentation";

const notificationId = "11111111-1111-4111-8111-111111111111";

describe("notification action presentation", () => {
  it("preserves an internal route, existing query, and notification context", () => {
    expect(
      notificationActionUrl(
        "/library?status=watched#history",
        notificationId,
        "center",
      ),
    ).toBe(
      `/library?status=watched&notification=${notificationId}&notificationSource=center#history`,
    );
  });

  it.each([
    "https://example.com/steal",
    "//example.com/steal",
    "/\\example.com/steal",
  ])("rejects external or ambiguous navigation %s", (path) => {
    expect(notificationActionUrl(path, notificationId, "push")).toBe(
      "/notifications",
    );
  });
});
