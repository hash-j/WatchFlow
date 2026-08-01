import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { logSupabaseError } from "./error-logging";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("safe Supabase error logging", () => {
  it("logs only a normalized database code and category", () => {
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
      '[WatchFlow] user_movies delete failed {"code":"PGRST202","category":"postgrest"}',
    );
    expect(logged).not.toContain("Function was not found");
    expect(logged).not.toContain("No matching function signature");
    expect(logged).not.toContain("Use the bulk removal function");
    expect(logged).not.toContain("must-not-be-logged");
    expect(logged).not.toContain("token");
    expect(logged).not.toContain("cookies");
    expect(logged).not.toContain("privatePayload");
  });

  it("drops non-standard codes that could contain private identifiers", () => {
    vi.stubEnv("NODE_ENV", "development");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logSupabaseError("profile update failed", {
      message: "Private profile data",
      code: "user-11111111-1111-4111-8111-111111111111",
      details: "Private details",
      hint: "Private hint",
    });

    expect(errorSpy).toHaveBeenCalledWith(
      '[WatchFlow] profile update failed {"code":null,"category":"database"}',
    );
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
