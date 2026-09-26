import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/lib/supabase/error-logging", () => ({ logSupabaseError: vi.fn() }));

import {
  authenticateSettings,
  readProfileSettings,
  readUserPreferences,
  updateApplicationPreferences,
  updateNotificationPreferences,
  updateOwnedProfile,
} from "./supabase-settings";
import { DEFAULT_USER_PREFERENCES } from "./types";

function builder(result: { data?: unknown; error?: unknown } = {}) {
  const chain = {
    select: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ error: result.error ?? null }),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: result.data ?? null,
      error: result.error ?? null,
    }),
  };
  chain.select.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  createClientMock.mockReset();
});

describe("authenticated settings persistence", () => {
  it("verifies the current user with auth.getUser", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: "verified-user" } },
      error: null,
    });
    createClientMock.mockResolvedValue({ auth: { getUser } });

    await expect(authenticateSettings()).resolves.toEqual(
      expect.objectContaining({ user: { id: "verified-user" } }),
    );
    expect(getUser).toHaveBeenCalledOnce();
  });

  it("rejects an unauthenticated settings session", async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    });
    await expect(authenticateSettings()).resolves.toBeNull();
  });

  it("reads only the authenticated profile", async () => {
    const profile = builder({
      data: {
        full_name: "Member",
        country: "Pakistan",
        timezone: "Asia/Karachi",
      },
    });
    const client = { from: vi.fn().mockReturnValue(profile) } as unknown as SupabaseClient;

    await expect(readProfileSettings(client, "verified-user")).resolves.toMatchObject({
      fullName: "Member",
      country: "Pakistan",
      timezone: "Asia/Karachi",
    });
    expect(profile.eq).toHaveBeenCalledWith("id", "verified-user");
  });

  it("updates name, country, and timezone with the verified owner filter", async () => {
    const profile = builder({
      data: {
        full_name: "Aisha Khan",
        country: "Pakistan",
        timezone: "Asia/Karachi",
      },
    });
    const from = vi.fn().mockReturnValue(profile);
    const client = { from } as unknown as SupabaseClient;

    await updateOwnedProfile(client, "verified-user", {
      fullName: "Aisha Khan",
      country: "Pakistan",
      timezone: "Asia/Karachi",
    });

    expect(profile.update).toHaveBeenCalledWith({
      full_name: "Aisha Khan",
      country: "Pakistan",
      timezone: "Asia/Karachi",
    });
    expect(profile.eq).toHaveBeenCalledWith("id", "verified-user");
  });

  it("never includes internal profile fields in the update payload", async () => {
    const profile = builder({ data: { full_name: "Member", timezone: "UTC" } });
    const client = {
      from: vi.fn().mockReturnValue(profile),
    } as unknown as SupabaseClient;

    await updateOwnedProfile(client, "verified-user", {
      fullName: "Member",
      country: "",
      timezone: "UTC",
    });
    const payload = profile.update.mock.calls[0][0];
    expect(payload).not.toHaveProperty("id");
    expect(payload).not.toHaveProperty("subscription_plan");
    expect(payload).not.toHaveProperty("created_at");
    expect(payload).not.toHaveProperty("updated_at");
  });

  it("isolates preference reads and updates by verified user ID", async () => {
    const read = builder({ data: null });
    const write = builder();
    const from = vi.fn().mockReturnValueOnce(read).mockReturnValueOnce(write);
    const client = { from } as unknown as SupabaseClient;

    await expect(readUserPreferences(client, "user-a")).resolves.toEqual(
      DEFAULT_USER_PREFERENCES,
    );
    await updateApplicationPreferences(client, "user-a", {
      ...DEFAULT_USER_PREFERENCES,
      defaultLibraryView: "list",
    });

    expect(read.eq).toHaveBeenCalledWith("user_id", "user-a");
    expect(write.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-a",
        default_library_view: "list",
      }),
      { onConflict: "user_id" },
    );
  });

  it("persists category preferences only for the verified owner row", async () => {
    const write = builder();
    const client = {
      from: vi.fn().mockReturnValue(write),
    } as unknown as SupabaseClient;

    await updateNotificationPreferences(client, "user-a", {
      ...DEFAULT_USER_PREFERENCES,
      notificationMovieStatusEnabled: false,
      notificationWatchNextEnabled: true,
      notificationCustomListsEnabled: false,
      notificationImportsEnabled: true,
    });

    expect(write.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-a",
        notification_movie_status_enabled: false,
        notification_watch_next_enabled: true,
        notification_custom_lists_enabled: false,
        notification_imports_enabled: true,
      }),
      { onConflict: "user_id" },
    );
  });
});
