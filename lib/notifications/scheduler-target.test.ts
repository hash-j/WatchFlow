import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  isExpectedSchedulerTarget,
  supabaseProjectRef,
} from "./scheduler-target";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("scheduler Supabase target pin", () => {
  it("allows only the explicitly expected Supabase project", () => {
    vi.stubEnv("WATCHFLOW_EXPECTED_SUPABASE_PROJECT_REF", "developmentref12345");
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "https://developmentref12345.supabase.co",
    );
    expect(isExpectedSchedulerTarget()).toBe(true);
  });

  it("fails closed when the expected project is missing", () => {
    vi.stubEnv("WATCHFLOW_EXPECTED_SUPABASE_PROJECT_REF", "");
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "https://developmentref12345.supabase.co",
    );
    expect(isExpectedSchedulerTarget()).toBe(false);
  });

  it("fails closed when the configured project differs", () => {
    vi.stubEnv("WATCHFLOW_EXPECTED_SUPABASE_PROJECT_REF", "expectedref12345678");
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "https://differentref1234567.supabase.co",
    );
    expect(isExpectedSchedulerTarget()).toBe(false);
  });

  it.each([
    undefined,
    "not-a-url",
    "http://developmentref12345.supabase.co",
    "https://supabase.co",
    "https://developmentref12345.supabase.co.evil.test",
    "https://user:password@developmentref12345.supabase.co",
    "https://developmentref12345.supabase.co:444",
  ])("rejects malformed or unpinned Supabase URL %s", (value) => {
    expect(supabaseProjectRef(value)).toBeNull();
  });
});
