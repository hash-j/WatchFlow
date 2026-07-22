import type { SupabaseClient, User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));
vi.mock("@/lib/supabase/error-logging", () => ({ logSupabaseError: vi.fn() }));

import {
  deleteOwnedLibraryData,
  deleteVerifiedAuthUser,
  hasRecentServerVerifiedLogin,
} from "./data-controls";
import { SettingsPersistenceError } from "./errors";

beforeEach(() => {
  createAdminClientMock.mockReset();
});

describe("library and account data controls", () => {
  it("deletes only user_movies rows owned by the verified user", async () => {
    const chain = {
      delete: vi.fn(),
      eq: vi.fn(),
      select: vi.fn().mockResolvedValue({
        data: [{ id: "one" }, { id: "two" }],
        error: null,
      }),
    };
    chain.delete.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    const from = vi.fn().mockReturnValue(chain);
    const client = { from } as unknown as SupabaseClient;

    await expect(deleteOwnedLibraryData(client, "verified-user")).resolves.toBe(2);
    expect(from).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledWith("user_movies");
    expect(chain.eq).toHaveBeenCalledWith("user_id", "verified-user");
  });

  it("does not report success when library deletion fails", async () => {
    const chain = {
      delete: vi.fn(),
      eq: vi.fn(),
      select: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "RLS", code: "42501" },
      }),
    };
    chain.delete.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    const client = {
      from: vi.fn().mockReturnValue(chain),
    } as unknown as SupabaseClient;

    await expect(
      deleteOwnedLibraryData(client, "verified-user"),
    ).rejects.toBeInstanceOf(SettingsPersistenceError);
  });

  it("passes only the server-verified current user ID to admin deletion", async () => {
    const deleteUser = vi.fn().mockResolvedValue({ error: null });
    createAdminClientMock.mockReturnValue({ auth: { admin: { deleteUser } } });
    const user = { id: "verified-user" } as User;

    await deleteVerifiedAuthUser(user);
    expect(createAdminClientMock).toHaveBeenCalledWith("verified-user");
    expect(deleteUser).toHaveBeenCalledWith("verified-user");
  });

  it("handles admin deletion failure honestly", async () => {
    createAdminClientMock.mockReturnValue({
      auth: {
        admin: {
          deleteUser: vi.fn().mockResolvedValue({
            error: { message: "Failed", code: "500" },
          }),
        },
      },
    });

    await expect(
      deleteVerifiedAuthUser({ id: "verified-user" } as User),
    ).rejects.toThrow("It remains active");
  });

  it("uses the Auth server timestamp for recent-login protection", () => {
    const now = new Date("2026-07-22T12:00:00.000Z");
    expect(
      hasRecentServerVerifiedLogin("2026-07-22T11:45:00.000Z", now),
    ).toBe(true);
    expect(
      hasRecentServerVerifiedLogin("2026-07-22T10:00:00.000Z", now),
    ).toBe(false);
    expect(hasRecentServerVerifiedLogin(undefined, now)).toBe(false);
  });
});
