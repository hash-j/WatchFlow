import { afterEach, describe, expect, it, vi } from "vitest";

const { createBrowserClientMock } = vi.hoisted(() => ({
  createBrowserClientMock: vi.fn(() => ({ kind: "browser-client" })),
}));

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: createBrowserClientMock,
}));

import { SupabaseBrowserConfigurationError } from "./browser-config";
import { createClient } from "./client";

afterEach(() => {
  vi.unstubAllEnvs();
  createBrowserClientMock.mockClear();
});

describe("browser Supabase configuration", () => {
  it("throws a typed controlled error when public configuration is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");

    expect(() => createClient()).toThrow(SupabaseBrowserConfigurationError);
    expect(createBrowserClientMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed public Supabase URL before creating a client", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "not-a-valid-url");
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "public-test-key-for-watchflow",
    );

    expect(() => createClient()).toThrow(SupabaseBrowserConfigurationError);
    expect(createBrowserClientMock).not.toHaveBeenCalled();
  });

  it("creates a browser client from validated public configuration", () => {
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "https://example-project.supabase.co",
    );
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "public-test-key-for-watchflow",
    );

    expect(createClient()).toEqual({ kind: "browser-client" });
    expect(createBrowserClientMock).toHaveBeenCalledWith(
      "https://example-project.supabase.co",
      "public-test-key-for-watchflow",
    );
  });
});
