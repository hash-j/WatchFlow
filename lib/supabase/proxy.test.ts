import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getClaims: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
vi.mock("../utils", () => ({ hasEnvVars: true }));

import { updateSession } from "./proxy";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createServerClient.mockImplementation((_url, _key, options) => ({
    auth: {
      getClaims: async () => {
        options.cookies.setAll([
          { name: "session-part-0", value: "", options: { path: "/", maxAge: 0, httpOnly: true } },
          { name: "session-part-1", value: "", options: { path: "/", maxAge: 0, httpOnly: true } },
        ]);
        return mocks.getClaims();
      },
    },
  }));
});

describe("auth proxy cookie propagation", () => {
  it("preserves every cookie deletion and its options on a login redirect", async () => {
    mocks.getClaims.mockResolvedValue({ data: null });
    const response = await updateSession(new NextRequest("https://watchflow.test/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://watchflow.test/auth/login");
    for (const name of ["session-part-0", "session-part-1"]) {
      expect(response.cookies.get(name)).toMatchObject({ name, value: "", path: "/", maxAge: 0, httpOnly: true });
    }
  });

  it("preserves cookies on a verified user's normal response", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "verified-user" } } });
    const response = await updateSession(new NextRequest("https://watchflow.test/dashboard"));

    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.getAll()).toHaveLength(2);
    expect(mocks.getClaims).toHaveBeenCalledOnce();
  });
});
