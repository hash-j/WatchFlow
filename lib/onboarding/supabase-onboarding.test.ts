import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  logSupabaseError: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/error-logging", () => ({
  logSupabaseError: mocks.logSupabaseError,
}));

import {
  authenticateOnboarding,
  completeOwnedOnboarding,
  getPostVerificationDestination,
  hasVerifiedEmail,
  readOnboardingProfile,
} from "./supabase-onboarding";

function profileReadClient(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  return { client: { from: vi.fn(() => ({ select })) }, select, eq, maybeSingle };
}

function profileUpdateClient(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const select = vi.fn(() => ({ maybeSingle }));
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  return { client: { from: vi.fn(() => ({ update })) }, update, eq, select };
}

beforeEach(() => vi.clearAllMocks());

describe("onboarding authentication and routing", () => {
  it("returns no session for unauthenticated users", async () => {
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { code: "missing" } }) },
    });
    await expect(authenticateOnboarding()).resolves.toBeNull();
  });

  it("requires a confirmed email", () => {
    expect(hasVerifiedEmail({ email: "member@example.com", email_confirmed_at: null } as never)).toBe(false);
    expect(hasVerifiedEmail({ email: "member@example.com", email_confirmed_at: "2026-08-17T00:00:00Z" } as never)).toBe(true);
  });

  it("routes incomplete new users to onboarding and completed users to Dashboard", async () => {
    const incomplete = profileReadClient({
      data: { onboarding_completed_at: null, timezone: "UTC" },
      error: null,
    });
    await expect(getPostVerificationDestination(incomplete.client as never, "new-user")).resolves.toBe("/onboarding");

    const complete = profileReadClient({
      data: { onboarding_completed_at: "2026-08-17T00:00:00Z", timezone: "UTC" },
      error: null,
    });
    await expect(getPostVerificationDestination(complete.client as never, "existing-user")).resolves.toBe("/dashboard");
  });

  it("keeps missing legacy profiles and staggered deployments out of a redirect trap", async () => {
    const missing = profileReadClient({ data: null, error: null });
    await expect(getPostVerificationDestination(missing.client as never, "legacy-user")).resolves.toBe("/dashboard");

    const unavailable = profileReadClient({ data: null, error: { code: "42703" } });
    await expect(getPostVerificationDestination(unavailable.client as never, "deploying-user")).resolves.toBe("/dashboard");
  });
});

describe("owned onboarding completion", () => {
  it("updates only the verified profile ID with a timestamp", async () => {
    const fixture = profileUpdateClient({ data: { id: "verified-user" }, error: null });
    await expect(
      completeOwnedOnboarding(
        fixture.client as never,
        "verified-user",
        "2026-08-17T12:00:00.000Z",
      ),
    ).resolves.toBe("2026-08-17T12:00:00.000Z");
    expect(fixture.update).toHaveBeenCalledWith({
      onboarding_completed_at: "2026-08-17T12:00:00.000Z",
    });
    expect(fixture.eq).toHaveBeenCalledWith("id", "verified-user");
  });

  it("does not claim completion for a missing or foreign profile", async () => {
    const fixture = profileUpdateClient({ data: null, error: null });
    await expect(
      completeOwnedOnboarding(fixture.client as never, "verified-user"),
    ).rejects.toThrow(/profile is not ready/i);
  });

  it("maps database failures to a safe onboarding error", async () => {
    const fixture = profileReadClient({ data: null, error: { code: "42501", message: "private detail" } });
    await expect(readOnboardingProfile(fixture.client as never, "verified-user")).rejects.toThrow(/could not be loaded/i);
    expect(mocks.logSupabaseError).toHaveBeenCalledOnce();
  });
});
