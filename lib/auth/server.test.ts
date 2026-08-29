import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { redirectAuthenticatedUser } from "./server";

beforeEach(() => vi.clearAllMocks());

describe("public auth route session redirect", () => {
  it("redirects an authenticated user to the dashboard", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: "authenticated-user" } },
          error: null,
        }),
      },
    });

    await expect(redirectAuthenticatedUser()).rejects.toThrow(
      "REDIRECT:/dashboard",
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("leaves the public page available to an unauthenticated user", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: null },
          error: null,
        }),
      },
    });

    await expect(redirectAuthenticatedUser()).resolves.toBeUndefined();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("keeps the public page available during a temporary auth outage", async () => {
    mocks.createClient.mockRejectedValue(new Error("service unavailable"));

    await expect(redirectAuthenticatedUser()).resolves.toBeUndefined();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
