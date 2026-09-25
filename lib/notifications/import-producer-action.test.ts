import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  validateChunk: vi.fn(),
  validateRows: vi.fn(),
  importMovies: vi.fn(),
  importDependencies: vi.fn(),
  createNotification: vi.fn(),
  revalidateLibrary: vi.fn(),
  revalidateNotifications: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/import/csv", () => ({
  CsvImportValidationError: class CsvImportValidationError extends Error {},
  parseCsvText: vi.fn(),
  validateCsvFileMetadata: vi.fn(),
  validateParsedCsvPayload: vi.fn(),
  validateParsedCsvChunkPayload: mocks.validateChunk,
}));
vi.mock("@/lib/import/mapping", () => ({
  ImportMappingValidationError: class ImportMappingValidationError extends Error {},
  validateAndMapRows: mocks.validateRows,
}));
vi.mock("@/lib/import/matching", () => ({ matchImportRows: vi.fn() }));
vi.mock("@/lib/import/service", () => ({
  importConfirmedMovies: mocks.importMovies,
}));
vi.mock("@/lib/import/supabase-import", () => ({
  createImportMatchingDependencies: vi.fn(),
  createMovieImportDependencies: mocks.importDependencies,
}));
vi.mock("@/lib/notifications/supabase-notifications", () => ({
  createCsvImportCompletedNotification: mocks.createNotification,
}));
vi.mock("@/lib/revalidation/private-data", () => ({
  revalidateLibraryDerivedViews: mocks.revalidateLibrary,
  revalidateNotificationViews: mocks.revalidateNotifications,
}));

import { confirmCsvImportAction } from "../../app/(app)/actions/import";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const completionId = "11111111-1111-4111-8111-111111111111";
const importResult = {
  summary: {
    total: 1,
    added: 1,
    updated: 0,
    skipped: 0,
    invalid: 0,
    unmatched: 0,
    failed: 0,
  },
  rows: [],
  warnings: [],
};

const actionInput = {
  parsed: { rows: [{}] },
  mapping: {},
  decisions: [
    {
      rowId: "row_1",
      disposition: "import",
      tmdbId: 27205,
      acceptDefaultStatus: false,
    },
  ],
  notificationCompletion: { completionId, finalBatch: true },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({
    data: { user: { id: userId } },
    error: null,
  });
  mocks.validateChunk.mockImplementation((value) => value);
  mocks.validateRows.mockReturnValue([{ id: "row_1" }]);
  mocks.importDependencies.mockReturnValue({});
  mocks.importMovies.mockResolvedValue(importResult);
  mocks.createNotification.mockResolvedValue({ id: "notification-id", created: true });
});

describe("CSV Import V2 notification producer orchestration", () => {
  it("creates a fixed system notification after a successful final batch", async () => {
    const result = await confirmCsvImportAction(actionInput);

    expect(result).toEqual({ ok: true, data: importResult });
    expect(mocks.createNotification).toHaveBeenCalledWith({
      verifiedUserId: userId,
      completionId,
    });
    expect(mocks.revalidateNotifications).toHaveBeenCalledOnce();
    expect(mocks.revalidateLibrary).toHaveBeenCalledOnce();
  });

  it("creates no notification when authentication or import completion fails", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const unauthenticated = await confirmCsvImportAction(actionInput);
    expect(unauthenticated.ok).toBe(false);
    expect(mocks.createNotification).not.toHaveBeenCalled();

    mocks.importMovies.mockRejectedValueOnce(new Error("import failed"));
    const failed = await confirmCsvImportAction(actionInput);
    expect(failed.ok).toBe(false);
    expect(mocks.createNotification).not.toHaveBeenCalled();

    mocks.importMovies.mockResolvedValueOnce({
      ...importResult,
      summary: { ...importResult.summary, added: 0, failed: 1 },
    });
    const rowFailed = await confirmCsvImportAction(actionInput);
    expect(rowFailed.ok).toBe(true);
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it("uses only the verified importing user and ignores browser owner fields", async () => {
    const result = await confirmCsvImportAction({
      ...actionInput,
      parsed: { ...actionInput.parsed, user_id: "browser-owner" },
      notificationCompletion: {
        ...actionInput.notificationCompletion,
        userId: "browser-owner",
        title: "browser title",
      },
    });

    expect(result.ok).toBe(true);
    expect(mocks.createNotification).toHaveBeenCalledWith({
      verifiedUserId: userId,
      completionId,
    });
    expect(JSON.stringify(mocks.createNotification.mock.calls)).not.toContain(
      "browser-owner",
    );
    expect(JSON.stringify(mocks.createNotification.mock.calls)).not.toContain(
      "browser title",
    );
  });

  it("does not notify an intermediate batch and preserves import success if production fails", async () => {
    const intermediate = await confirmCsvImportAction({
      ...actionInput,
      notificationCompletion: { completionId, finalBatch: false },
    });
    expect(intermediate.ok).toBe(true);
    expect(mocks.createNotification).not.toHaveBeenCalled();

    mocks.createNotification.mockRejectedValueOnce(new Error("private producer failure"));
    const completed = await confirmCsvImportAction(actionInput);
    expect(completed).toMatchObject({
      ok: true,
      data: {
        warnings: [
          "Movies were imported, but the completion notification could not be created.",
        ],
      },
    });
    expect(JSON.stringify(completed)).not.toContain("private producer failure");
  });
});
