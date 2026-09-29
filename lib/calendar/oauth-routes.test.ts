import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  createState: vi.fn(),
  consumeState: vi.fn(),
  saveConnection: vi.fn(),
  exchange: vi.fn(),
  encrypt: vi.fn(),
  cookieGet: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/calendar/oauth-store", () => ({
  createCalendarOAuthState: mocks.createState,
  consumeCalendarOAuthState: mocks.consumeState,
  saveGoogleCalendarConnection: mocks.saveConnection,
}));
vi.mock("@/lib/calendar/google-config", () => ({
  getGoogleCalendarConfig: () => ({ redirectUrl: new URL("https://dev.watchflow.test/api/calendar/google/callback") }),
}));
vi.mock("@/lib/calendar/google-provider", async (importOriginal) => {
  const original = await importOriginal<typeof import("./google-provider")>();
  return {
    ...original,
    buildGoogleAuthorizationUrl: () => new URL("https://accounts.google.com/o/oauth2/v2/auth?state=opaque"),
    exchangeGoogleAuthorizationCode: mocks.exchange,
  };
});
vi.mock("@/lib/calendar/token-encryption", () => ({
  encryptCalendarRefreshToken: mocks.encrypt,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet }),
}));

import { NextRequest } from "next/server";
import { GET as callback } from "@/app/api/calendar/google/callback/route";
import { GET as start } from "@/app/api/calendar/google/start/route";
import { GOOGLE_OAUTH_COOKIE, serializeOAuthCookie } from "./oauth-state";

describe("Google Calendar OAuth routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner-a" } }, error: null });
    mocks.createState.mockResolvedValue(undefined);
    mocks.consumeState.mockResolvedValue(true);
    mocks.exchange.mockResolvedValue({
      refreshToken: "refresh", providerSubject: "subject", displayEmail: "owner@example.com",
      grantedScopes: ["openid", "email", "https://www.googleapis.com/auth/calendar.events"],
    });
    mocks.encrypt.mockReturnValue({ ciphertext: Buffer.from("cipher"), nonce: Buffer.alloc(12), authTag: Buffer.alloc(16), keyVersion: 1 });
    mocks.saveConnection.mockResolvedValue("connection-id");
    mocks.cookieGet.mockReturnValue({ value: serializeOAuthCookie("b".repeat(43), "v".repeat(43)) });
  });

  it("denies unauthenticated OAuth start without creating state", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("unauthenticated") });
    const response = await start(new NextRequest("https://dev.watchflow.test/api/calendar/google/start"));
    expect(response.headers.get("location")).toBe("https://dev.watchflow.test/auth/login");
    expect(mocks.createState).not.toHaveBeenCalled();
  });

  it("creates state and a callback-scoped HttpOnly cookie before redirect", async () => {
    const response = await start(new NextRequest("https://dev.watchflow.test/api/calendar/google/start"));
    expect(mocks.createState).toHaveBeenCalledOnce();
    expect(response.headers.get("location")).toContain("https://accounts.google.com/");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${GOOGLE_OAUTH_COOKIE}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Path=/api/calendar/google/callback");
  });

  it("persists one encrypted connection after a consumed state", async () => {
    const response = await callback(new NextRequest("https://dev.watchflow.test/api/calendar/google/callback?state=opaque&code=code"));
    expect(mocks.consumeState).toHaveBeenCalledWith(expect.objectContaining({ userId: "owner-a" }));
    expect(mocks.exchange).toHaveBeenCalledWith("code", "v".repeat(43));
    expect(mocks.encrypt).toHaveBeenCalledWith("refresh", "owner-a");
    expect(mocks.saveConnection).toHaveBeenCalledWith(expect.objectContaining({ userId: "owner-a" }));
    expect(response.headers.get("location")).toBe("https://dev.watchflow.test/settings/calendar?calendar=connected");
  });

  it("handles denial after consuming state and rejects replayed state", async () => {
    const denied = await callback(new NextRequest("https://dev.watchflow.test/api/calendar/google/callback?state=opaque&error=access_denied"));
    expect(denied.headers.get("location")).toContain("calendar=denied");
    expect(mocks.exchange).not.toHaveBeenCalled();
    mocks.consumeState.mockResolvedValue(false);
    const replay = await callback(new NextRequest("https://dev.watchflow.test/api/calendar/google/callback?state=opaque&code=code"));
    expect(replay.headers.get("location")).toContain("calendar=invalid");
    expect(mocks.saveConnection).not.toHaveBeenCalled();
  });

  it("sanitizes token-exchange failures without persisting a connection", async () => {
    mocks.exchange.mockRejectedValue(new Error("provider response contained sensitive detail"));
    const response = await callback(new NextRequest("https://dev.watchflow.test/api/calendar/google/callback?state=opaque&code=code"));
    expect(response.headers.get("location")).toBe("https://dev.watchflow.test/settings/calendar?calendar=failed");
    expect(response.headers.get("location")).not.toContain("sensitive");
    expect(mocks.saveConnection).not.toHaveBeenCalled();
  });
});
