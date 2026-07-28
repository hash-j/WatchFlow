import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { logSupabaseError } from "./error-logging";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("safe Supabase error logging", () => {
  it("persists only message, code, details, and hint", () => {
    vi.stubEnv("NODE_ENV", "development");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const providerError = {
      message: "Function was not found",
      code: "PGRST202",
      details: "No matching function signature",
      hint: "Use the bulk removal function",
      token: "must-not-be-logged",
      cookies: "must-not-be-logged",
      privatePayload: { title: "must-not-be-logged" },
    };

    logSupabaseError("user_movies delete failed", providerError);

    expect(errorSpy).toHaveBeenCalledOnce();
    const logged = String(errorSpy.mock.calls[0]?.[0]);
    expect(logged).toBe(
      '[WatchFlow] user_movies delete failed {"message":"Function was not found","code":"PGRST202","details":"No matching function signature","hint":"Use the bulk removal function"}',
    );
    expect(logged).not.toContain("must-not-be-logged");
    expect(logged).not.toContain("token");
    expect(logged).not.toContain("cookies");
    expect(logged).not.toContain("privatePayload");
  });

  it("does not log outside development", () => {
    vi.stubEnv("NODE_ENV", "production");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logSupabaseError("user_movies delete failed", {
      message: "Database error",
      code: "XX000",
      details: null,
      hint: null,
    });

    expect(errorSpy).not.toHaveBeenCalled();
  });
});
