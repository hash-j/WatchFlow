import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  setFavouriteMock,
  bulkStatusMock,
  bulkRemoveMock,
  mutationDependencies,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  setFavouriteMock: vi.fn(),
  bulkStatusMock: vi.fn(),
  bulkRemoveMock: vi.fn(),
  mutationDependencies: { kind: "authenticated-mutation-dependencies" },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("./mutations", () => ({
  setLibraryMovieFavourite: setFavouriteMock,
  bulkUpdateLibraryStatus: bulkStatusMock,
  bulkRemoveLibraryMovies: bulkRemoveMock,
}));
vi.mock("./supabase-mutations", () => ({
  createSupabaseLibraryMutationDependencies: () => mutationDependencies,
}));
vi.mock("./service", () => ({
  addMovieToLibrary: vi.fn(),
  removeMovieFromLibrary: vi.fn(),
}));
vi.mock("./supabase-library", () => ({
  createSupabaseLibraryDependencies: () => ({}),
}));

import {
  bulkRemoveMoviesAction,
  bulkUpdateStatusAction,
  setFavouriteAction,
} from "../../app/(app)/actions/library";
import {
  initialBulkLibraryActionState,
  initialLibraryActionState,
} from "./action-state";

const libraryId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  revalidatePathMock.mockReset();
  setFavouriteMock.mockReset();
  bulkStatusMock.mockReset();
  bulkRemoveMock.mockReset();
});

describe("Part 12 library Server Actions", () => {
  it("toggles favourite and revalidates the detail and affected private views", async () => {
    setFavouriteMock.mockResolvedValue(true);
    const formData = new FormData();
    formData.set("libraryId", libraryId);
    formData.set("movieId", "42");
    formData.set("favourite", "true");

    await expect(
      setFavouriteAction(initialLibraryActionState, formData),
    ).resolves.toEqual({
      status: "success",
      message: "Added to favourites.",
    });

    expect(setFavouriteMock).toHaveBeenCalledWith(
      libraryId,
      "true",
      mutationDependencies,
    );
    expect([...formData.keys()]).not.toContain("user_id");
    expect(revalidatePathMock).toHaveBeenCalledWith("/library/42");
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePathMock).toHaveBeenCalledWith("/library", "layout");
    expect(revalidatePathMock).toHaveBeenCalledWith("/watch-next");
    expect(revalidatePathMock).toHaveBeenCalledWith("/schedule");
  });

  it("reports another user's or stale favourite record without claiming success", async () => {
    setFavouriteMock.mockResolvedValue(false);
    const formData = new FormData();
    formData.set("libraryId", libraryId);
    formData.set("favourite", "true");

    await expect(
      setFavouriteAction(initialLibraryActionState, formData),
    ).resolves.toMatchObject({
      status: "error",
      message: expect.stringMatching(/no longer available/i),
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("submits ordered selected IDs and a target status without a user ID", async () => {
    bulkStatusMock.mockResolvedValue({
      success: true,
      requested: 2,
      matched: 2,
      affected: 2,
      skipped: 0,
      failed: 0,
      reason: null,
    });
    const formData = new FormData();
    formData.append("libraryIds", secondId);
    formData.append("libraryIds", libraryId);
    formData.set("status", "watch_next");

    await expect(
      bulkUpdateStatusAction(initialBulkLibraryActionState, formData),
    ).resolves.toMatchObject({
      status: "success",
      requestId: 1,
      affected: 2,
    });
    expect(bulkStatusMock).toHaveBeenCalledWith(
      [secondId, libraryId],
      "watch_next",
      mutationDependencies,
    );
    expect([...formData.keys()]).not.toContain("user_id");
  });

  it("reports a stale or mixed-ownership bulk selection without revalidation", async () => {
    bulkStatusMock.mockResolvedValue({
      success: false,
      requested: 2,
      matched: 1,
      affected: 0,
      skipped: 1,
      failed: 0,
      reason: "selection_changed",
    });
    const formData = new FormData();
    formData.append("libraryIds", libraryId);
    formData.append("libraryIds", secondId);
    formData.set("status", "watched");

    await expect(
      bulkUpdateStatusAction(initialBulkLibraryActionState, formData),
    ).resolves.toMatchObject({
      status: "error",
      affected: 0,
      skipped: 1,
      message: expect.stringMatching(/no changes were made/i),
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("bulk-removes selected personal records and revalidates affected routes", async () => {
    bulkRemoveMock.mockResolvedValue({
      success: true,
      requested: 1,
      matched: 1,
      affected: 1,
      skipped: 0,
      failed: 0,
      reason: null,
    });
    const formData = new FormData();
    formData.append("libraryIds", libraryId);

    await expect(
      bulkRemoveMoviesAction(initialBulkLibraryActionState, formData),
    ).resolves.toMatchObject({
      status: "success",
      affected: 1,
      message: "1 movie removed from your library.",
    });
    expect(bulkRemoveMock).toHaveBeenCalledWith(
      [libraryId],
      mutationDependencies,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/library", "layout");
    expect(revalidatePathMock).toHaveBeenCalledWith("/watch-next");
    expect(revalidatePathMock).toHaveBeenCalledWith("/schedule");
  });
});

