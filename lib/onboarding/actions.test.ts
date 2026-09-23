import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  complete: vi.fn(),
  updateTimezone: vi.fn(),
  findOwnedMovie: vi.fn(),
  readPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  addMovie: vi.fn(),
  bulkStatus: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/server", () => ({ after: (callback: () => void) => callback() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/onboarding/supabase-onboarding", async () => {
  const actual = await vi.importActual<typeof import("./supabase-onboarding")>("./supabase-onboarding");
  return {
    ...actual,
    authenticateOnboarding: mocks.authenticate,
    completeOwnedOnboarding: mocks.complete,
    updateOwnedOnboardingTimezone: mocks.updateTimezone,
    findOwnedLibraryMovieByTmdbId: mocks.findOwnedMovie,
  };
});
vi.mock("@/lib/settings/supabase-settings", () => ({
  readUserPreferences: mocks.readPreferences,
  updateApplicationPreferences: mocks.updatePreferences,
}));
vi.mock("@/lib/library/service", () => ({ addMovieToLibrary: mocks.addMovie }));
vi.mock("@/lib/library/supabase-library", () => ({
  createSupabaseLibraryDependencies: () => ({ kind: "library" }),
}));
vi.mock("@/lib/library/mutations", () => ({
  bulkUpdateLibraryStatus: mocks.bulkStatus,
}));
vi.mock("@/lib/library/supabase-mutations", () => ({
  createSupabaseLibraryMutationDependencies: () => ({ kind: "mutations" }),
}));

import {
  addOnboardingMovieAction,
  completeOnboardingAction,
  saveOnboardingPreferencesAction,
  skipOnboardingAction,
} from "../../app/onboarding/actions";
import { InvalidMovieIdError, MovieProviderRateLimitError } from "@/lib/movies/errors";
import { INITIAL_ONBOARDING_ACTION_STATE } from "./types";
import { DEFAULT_USER_PREFERENCES } from "@/lib/settings/types";

const session = {
  user: {
    id: "verified-user",
    email: "member@example.com",
    email_confirmed_at: "2026-08-17T00:00:00.000Z",
  },
  client: { kind: "authenticated-client" },
};

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticate.mockResolvedValue(session);
  mocks.complete.mockResolvedValue("2026-08-17T12:00:00.000Z");
  mocks.updateTimezone.mockResolvedValue(undefined);
  mocks.readPreferences.mockResolvedValue(DEFAULT_USER_PREFERENCES);
  mocks.updatePreferences.mockResolvedValue(undefined);
  mocks.addMovie.mockResolvedValue("added");
  mocks.findOwnedMovie.mockResolvedValue({
    libraryId: "11111111-1111-4111-8111-111111111111",
    status: "want_to_watch",
  });
  mocks.bulkStatus.mockResolvedValue({
    success: true,
    requested: 1,
    matched: 1,
    affected: 1,
    skipped: 0,
    failed: 0,
    reason: null,
  });
});

describe("onboarding preferences", () => {
  it("persists validated existing preferences and timezone before step 3", async () => {
    await expect(
      saveOnboardingPreferencesAction(
        INITIAL_ONBOARDING_ACTION_STATE,
        form({
          timezone: "Asia/Karachi",
          defaultLibraryView: "list",
          preferredLanguage: "ur",
          user_id: "attacker",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/onboarding?step=3");

    expect(mocks.updateTimezone).toHaveBeenCalledWith(
      session.client,
      "verified-user",
      "Asia/Karachi",
    );
    expect(mocks.updatePreferences).toHaveBeenCalledWith(
      session.client,
      "verified-user",
      expect.objectContaining({
        defaultLibraryView: "list",
        preferredLanguage: "ur",
      }),
    );
    expect(mocks.updatePreferences.mock.calls[0][2]).not.toHaveProperty("user_id");
  });

  it("returns field errors for invalid timezone and view without persistence", async () => {
    const result = await saveOnboardingPreferencesAction(
      INITIAL_ONBOARDING_ACTION_STATE,
      form({
        timezone: "Invalid/Zone",
        defaultLibraryView: "cards",
        preferredLanguage: "en",
      }),
    );
    expect(result.status).toBe("error");
    expect(result.fieldErrors).toHaveProperty("timezone");
    expect(result.fieldErrors).toHaveProperty("defaultLibraryView");
    expect(mocks.updateTimezone).not.toHaveBeenCalled();
  });
});

describe("onboarding movie additions", () => {
  it.each([
    ["want_to_watch", "Want to Watch"],
    ["watched", "Watched"],
  ])("adds and normalizes a movie to %s", async (status, label) => {
    const result = await addOnboardingMovieAction(
      INITIAL_ONBOARDING_ACTION_STATE,
      form({ tmdbId: "27205", status, user_id: "attacker" }),
    );
    expect(result).toMatchObject({ status: "success", message: `Added as ${label}.` });
    expect(mocks.addMovie).toHaveBeenCalledWith(27205, { kind: "library" });
    expect(mocks.bulkStatus).toHaveBeenCalledWith(
      ["11111111-1111-4111-8111-111111111111"],
      status,
      { kind: "mutations" },
    );
    expect(mocks.findOwnedMovie).toHaveBeenCalledWith(
      session.client,
      "verified-user",
      27205,
    );
  });

  it("retains duplicate protection while allowing the selected simple status", async () => {
    mocks.addMovie.mockResolvedValue("duplicate");
    const result = await addOnboardingMovieAction(
      INITIAL_ONBOARDING_ACTION_STATE,
      form({ tmdbId: "27205", status: "watched" }),
    );
    expect(result.message).toContain("Already in your Library");
    expect(mocks.bulkStatus).toHaveBeenCalledOnce();
  });

  it("rejects advanced statuses before ingestion", async () => {
    const result = await addOnboardingMovieAction(
      INITIAL_ONBOARDING_ACTION_STATE,
      form({ tmdbId: "27205", status: "watch_next" }),
    );
    expect(result.status).toBe("error");
    expect(mocks.addMovie).not.toHaveBeenCalled();
  });

  it("maps invalid IDs and retained TMDB rate limiting safely", async () => {
    mocks.addMovie.mockRejectedValueOnce(new InvalidMovieIdError());
    const invalid = await addOnboardingMovieAction(
      INITIAL_ONBOARDING_ACTION_STATE,
      form({ tmdbId: "attacker", status: "watched" }),
    );
    expect(invalid.status).toBe("error");
    expect(invalid.message).not.toContain("NaN");

    mocks.addMovie.mockRejectedValueOnce(new MovieProviderRateLimitError(42));
    const limited = await addOnboardingMovieAction(
      INITIAL_ONBOARDING_ACTION_STATE,
      form({ tmdbId: "27205", status: "watched" }),
    );
    expect(limited.message).toMatch(/42 seconds|try again/i);
  });
});

describe("completion and skip", () => {
  it.each([0, 1, 4])("allows completion with %i movies because count is not a gate", async () => {
    await expect(
      completeOnboardingAction(INITIAL_ONBOARDING_ACTION_STATE, new FormData()),
    ).rejects.toThrow("REDIRECT:/dashboard");
    expect(mocks.complete).toHaveBeenCalledWith(session.client, "verified-user");
  });

  it("skip preserves partial preferences and movies by only stamping completion", async () => {
    await expect(
      skipOnboardingAction(INITIAL_ONBOARDING_ACTION_STATE, new FormData()),
    ).rejects.toThrow("REDIRECT:/dashboard");
    expect(mocks.complete).toHaveBeenCalledOnce();
    expect(mocks.updatePreferences).not.toHaveBeenCalled();
    expect(mocks.addMovie).not.toHaveBeenCalled();
  });

  it("does not accept completion without a verified current user", async () => {
    mocks.authenticate.mockResolvedValue(null);
    const result = await completeOnboardingAction(
      INITIAL_ONBOARDING_ACTION_STATE,
      new FormData(),
    );
    expect(result.status).toBe("error");
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
