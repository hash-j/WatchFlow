import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateSettings: vi.fn(),
  readOwnedLibraryExportRows: vi.fn(),
  readAccountExportSource: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/settings/supabase-settings", () => ({
  authenticateSettings: mocks.authenticateSettings,
}));
vi.mock("@/lib/settings/supabase-export", () => ({
  readOwnedLibraryExportRows: mocks.readOwnedLibraryExportRows,
  readAccountExportSource: mocks.readAccountExportSource,
}));

import { GET as getCsv } from "../../app/(app)/settings/data/export/csv/route";
import { GET as getJson } from "../../app/(app)/settings/data/export/json/route";

const session = {
  user: { id: "verified-user", email: "member@example.com" },
  client: { scope: "authenticated" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticateSettings.mockResolvedValue(session);
  mocks.readOwnedLibraryExportRows.mockResolvedValue([]);
  mocks.readAccountExportSource.mockResolvedValue({
    profile: { full_name: "Member", timezone: "UTC" },
    preferences: null,
    library: [],
  });
});

describe("private export Route Handlers", () => {
  it("rejects unauthenticated CSV and JSON exports", async () => {
    mocks.authenticateSettings.mockResolvedValue(null);
    await expect(getCsv()).resolves.toMatchObject({ status: 401 });
    await expect(getJson()).resolves.toMatchObject({ status: 401 });
    expect(mocks.readOwnedLibraryExportRows).not.toHaveBeenCalled();
  });

  it("scopes CSV export to the verified current user", async () => {
    const response = await getCsv();
    expect(response.status).toBe(200);
    expect(mocks.readOwnedLibraryExportRows).toHaveBeenCalledWith(
      session.client,
      "verified-user",
    );
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toMatch(
      /watchflow-library-\d{4}-\d{2}-\d{2}\.csv/,
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await response.text()).split("\r\n")).toHaveLength(1);
  });

  it("returns the complete JSON structure without raw auth records", async () => {
    const response = await getJson();
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.readAccountExportSource).toHaveBeenCalledWith(
      session.client,
      "verified-user",
    );
    expect(data).toMatchObject({
      profile: { email: "member@example.com", fullName: "Member" },
      library: [],
      schedules: [],
      metadata: { formatVersion: 1 },
    });
    expect(response.headers.get("content-disposition")).toMatch(
      /watchflow-account-data-\d{4}-\d{2}-\d{2}\.json/,
    );
    expect(JSON.stringify(data)).not.toMatch(/refresh_token|access_token|password/i);
  });
});
