import { afterEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(() => ({ kind: "admin-client" })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

import {
  createAdminClient,
  SupabaseAdminConfigurationError,
} from "./admin";

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalSecretKey = process.env.SUPABASE_SECRET_KEY;

afterEach(() => {
  if (originalUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }

  if (originalSecretKey === undefined) {
    delete process.env.SUPABASE_SECRET_KEY;
  } else {
    process.env.SUPABASE_SECRET_KEY = originalSecretKey;
  }

  createClientMock.mockClear();
});

describe("server-only Supabase admin client", () => {
  it("throws a clear error when SUPABASE_SECRET_KEY is missing", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    delete process.env.SUPABASE_SECRET_KEY;

    expect(() => createAdminClient("verified-user-id")).toThrow(
      new SupabaseAdminConfigurationError(
        "SUPABASE_SECRET_KEY is not configured on the server.",
      ),
    );
    expect(createClientMock).not.toHaveBeenCalled();
  });
});
