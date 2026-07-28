import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateSettings: vi.fn(),
  updateOwnedProfile: vi.fn(),
  updateApplicationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
  deleteOwnedLibraryData: vi.fn(),
  deleteVerifiedAuthUser: vi.fn(),
  hasRecentServerVerifiedLogin: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/settings/supabase-settings", () => ({
  authenticateSettings: mocks.authenticateSettings,
  updateOwnedProfile: mocks.updateOwnedProfile,
  updateApplicationPreferences: mocks.updateApplicationPreferences,
  updateNotificationPreferences: mocks.updateNotificationPreferences,
}));
vi.mock("@/lib/settings/data-controls", () => ({
  deleteOwnedLibraryData: mocks.deleteOwnedLibraryData,
  deleteVerifiedAuthUser: mocks.deleteVerifiedAuthUser,
  hasRecentServerVerifiedLogin: mocks.hasRecentServerVerifiedLogin,
}));

import {
  deleteAccountAction,
  deleteLibraryDataAction,
  updateNotificationPreferencesAction,
  updateProfileSettingsAction,
} from "../../app/(app)/settings/actions";
import { SettingsPersistenceError } from "./errors";
import { INITIAL_SETTINGS_ACTION_STATE } from "./types";

function form(values: Record<string, string | boolean>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value === true) data.set(key, "on");
    else if (value !== false) data.set(key, value);
  }
  return data;
}

const session = {
  user: {
    id: "verified-user",
    email: "member@example.com",
    last_sign_in_at: "2026-07-22T11:50:00.000Z",
  },
  client: { auth: { signOut: vi.fn().mockResolvedValue({ error: null }) } },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticateSettings.mockResolvedValue(session);
  mocks.updateOwnedProfile.mockResolvedValue({ fullName: "Aisha" });
  mocks.updateNotificationPreferences.mockResolvedValue(undefined);
  mocks.deleteOwnedLibraryData.mockResolvedValue(3);
  mocks.deleteVerifiedAuthUser.mockResolvedValue(undefined);
  mocks.hasRecentServerVerifiedLogin.mockReturnValue(true);
  mocks.redirect.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
});

describe("settings Server Actions", () => {
  it("saves normalized profile fields for the verified user", async () => {
    const result = await updateProfileSettingsAction(
      INITIAL_SETTINGS_ACTION_STATE,
      form({
        fullName: "  Aisha Khan ",
        country: " Pakistan ",
        timezone: "Asia/Karachi",
      }),
    );

    expect(result.status).toBe("success");
    expect(mocks.updateOwnedProfile).toHaveBeenCalledWith(
      session.client,
      "verified-user",
      {
        fullName: "Aisha Khan",
        country: "Pakistan",
        timezone: "Asia/Karachi",
      },
    );
  });

  it("rejects invalid timezones with a field-specific error", async () => {
    const result = await updateProfileSettingsAction(
      INITIAL_SETTINGS_ACTION_STATE,
      form({ fullName: "Aisha", country: "", timezone: "Invalid/Zone" }),
    );
    expect(result.status).toBe("error");
    expect(result.fieldErrors.timezone?.[0]).toContain("IANA");
    expect(mocks.updateOwnedProfile).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated profile updates", async () => {
    mocks.authenticateSettings.mockResolvedValue(null);
    const result = await updateProfileSettingsAction(
      INITIAL_SETTINGS_ACTION_STATE,
      form({ fullName: "Aisha", country: "", timezone: "UTC" }),
    );
    expect(result.status).toBe("error");
    expect(result.message).toContain("session has expired");
  });

  it("saves notification choices without claiming delivery is active", async () => {
    const result = await updateNotificationPreferencesAction(
      INITIAL_SETTINGS_ACTION_STATE,
      form({
        emailNotificationsEnabled: true,
        scheduleRemindersEnabled: true,
        reminderOffsetMinutes: "60",
        weeklySummaryEnabled: false,
      }),
    );
    expect(result.message).toContain("future delivery");
    expect(result.message).not.toMatch(/sent|sending|active/i);
  });

  it("requires the exact library confirmation phrase", async () => {
    const result = await deleteLibraryDataAction(
      INITIAL_SETTINGS_ACTION_STATE,
      form({ confirmation: "DELETE" }),
    );
    expect(result.status).toBe("error");
    expect(mocks.deleteOwnedLibraryData).not.toHaveBeenCalled();
  });

  it("deletes only verified-user library data and revalidates all movie views", async () => {
    await expect(
      deleteLibraryDataAction(
        INITIAL_SETTINGS_ACTION_STATE,
        form({ confirmation: "DELETE MOVIES" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/settings/data?libraryDeleted=3");

    expect(mocks.deleteOwnedLibraryData).toHaveBeenCalledWith(
      session.client,
      "verified-user",
    );
    for (const path of [
      "/dashboard",
      "/library",
      "/watch-next",
      "/schedule",
      "/settings/data",
    ]) {
      expect(mocks.revalidatePath).toHaveBeenCalledWith(path);
    }
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/lists", "layout");
  });

  it("rejects unauthenticated library deletion", async () => {
    mocks.authenticateSettings.mockResolvedValue(null);
    const result = await deleteLibraryDataAction(
      INITIAL_SETTINGS_ACTION_STATE,
      form({ confirmation: "DELETE MOVIES" }),
    );
    expect(result.status).toBe("error");
    expect(mocks.deleteOwnedLibraryData).not.toHaveBeenCalled();
  });

  it("requires both the account phrase and confirmation checkbox", async () => {
    const result = await deleteAccountAction(
      INITIAL_SETTINGS_ACTION_STATE,
      form({ confirmation: "DELETE" }),
    );
    expect(result.status).toBe("error");
    expect(result.fieldErrors.confirmed).toBeDefined();
    expect(mocks.deleteVerifiedAuthUser).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated account deletion", async () => {
    mocks.authenticateSettings.mockResolvedValue(null);
    const result = await deleteAccountAction(
      INITIAL_SETTINGS_ACTION_STATE,
      form({ confirmation: "DELETE", confirmed: true }),
    );
    expect(result.status).toBe("error");
    expect(mocks.deleteVerifiedAuthUser).not.toHaveBeenCalled();
  });

  it("deletes, signs out, and redirects only the verified current user", async () => {
    await expect(
      deleteAccountAction(
        INITIAL_SETTINGS_ACTION_STATE,
        form({ confirmation: "DELETE", confirmed: true }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/?accountDeleted=1");

    expect(mocks.deleteVerifiedAuthUser).toHaveBeenCalledWith(session.user);
    expect(session.client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("does not sign out or report success after admin deletion failure", async () => {
    mocks.deleteVerifiedAuthUser.mockRejectedValue(
      new SettingsPersistenceError("Your account could not be deleted. It remains active."),
    );
    const result = await deleteAccountAction(
      INITIAL_SETTINGS_ACTION_STATE,
      form({ confirmation: "DELETE", confirmed: true }),
    );
    expect(result).toMatchObject({ status: "error" });
    expect(result.message).toContain("remains active");
    expect(session.client.auth.signOut).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
