import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  removeMovieMock,
  setFavouriteMock,
  bulkStatusMock,
  bulkRemoveMock,
  redirectMock,
  mutationDependencies,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  removeMovieMock: vi.fn(),
  setFavouriteMock: vi.fn(),
  bulkStatusMock: vi.fn(),
  bulkRemoveMock: vi.fn(),
  redirectMock: vi.fn(),
  mutationDependencies: { kind: "authenticated-mutation-dependencies" },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/server", () => ({ after: (callback: () => void) => callback() }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("./mutations", () => ({
  removeLibraryMovie: removeMovieMock,
  setLibraryMovieFavourite: setFavouriteMock,
  bulkUpdateLibraryStatus: bulkStatusMock,
  bulkRemoveLibraryMovies: bulkRemoveMock,
}));
vi.mock("./supabase-mutations", () => ({
  createSupabaseLibraryMutationDependencies: () => mutationDependencies,
}));
vi.mock("./service", () => ({
  addMovieToLibrary: vi.fn(),
}));
vi.mock("./supabase-library", () => ({
  createSupabaseLibraryDependencies: () => ({}),
}));

import {
  bulkRemoveMoviesAction,
  bulkUpdateStatusAction,
  removeMovieAction,
  setFavouriteAction,
} from "../../app/(app)/actions/library";
import {
  initialBulkLibraryActionState,
  initialLibraryActionState,
} from "./action-state";
import {
  AuthenticationRequiredError,
  LibraryAuthorizationError,
  LibraryPersistenceError,
  LibrarySchemaError,
  LibraryValidationError,
} from "./errors";

const libraryId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  revalidatePathMock.mockReset();
  removeMovieMock.mockReset();
  setFavouriteMock.mockReset();
  bulkStatusMock.mockReset();
  bulkRemoveMock.mockReset();
  redirectMock.mockReset();
});

describe("Part 12 library Server Actions", () => {
  it("single-removes the submitted user_movies ID and revalidates every affected view", async () => {
    removeMovieMock.mockResolvedValue({
      success: true,
      requested: 1,
      matched: 1,
      affected: 1,
      skipped: 0,
      failed: 0,
      reason: null,
    });
    const formData = new FormData();
    formData.set("userMovieId", libraryId);
    formData.set("movieId", "42");
    formData.set("movieTitle", "The Matrix");

    await expect(
      removeMovieAction(initialLibraryActionState, formData),
    ).resolves.toEqual({
      status: "success",
      message: "The Matrix was removed from your library.",
    });

    expect(removeMovieMock).toHaveBeenCalledWith(
      libraryId,
      mutationDependencies,
    );
    expect([...formData.keys()]).not.toContain("user_id");
    expect([...formData.keys()]).not.toContain("libraryId");
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePathMock).toHaveBeenCalledWith("/library");
    expect(revalidatePathMock).toHaveBeenCalledWith("/library/[movieId]", "page");
    expect(revalidatePathMock).toHaveBeenCalledWith("/statistics");
    expect(revalidatePathMock).toHaveBeenCalledWith("/watch-next");
    expect(revalidatePathMock).toHaveBeenCalledWith("/schedule");
    expect(revalidatePathMock).toHaveBeenCalledWith("/picker");
    expect(revalidatePathMock).toHaveBeenCalledWith("/recommendations");
    expect(revalidatePathMock).toHaveBeenCalledTimes(10);
  });

  it("does not treat a stale, missing, or foreign user_movies ID as success", async () => {
    removeMovieMock.mockResolvedValue({
      success: false,
      requested: 1,
      matched: 0,
      affected: 0,
      skipped: 1,
      failed: 0,
      reason: "selection_changed",
    });
    const formData = new FormData();
    formData.set("userMovieId", libraryId);

    await expect(
      removeMovieAction(initialLibraryActionState, formData),
    ).resolves.toEqual({
      status: "error",
      message: "This movie is no longer in your library.",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("redirects detail-page removals after invalidating affected views", async () => {
    removeMovieMock.mockResolvedValue({
      success: true,
      requested: 1,
      matched: 1,
      affected: 1,
      skipped: 0,
      failed: 0,
      reason: null,
    });
    const formData = new FormData();
    formData.set("userMovieId", libraryId);
    formData.set("movieTitle", "The Matrix");
    formData.set("redirectAfterRemoval", "true");

    await removeMovieAction(initialLibraryActionState, formData);

    expect(revalidatePathMock).toHaveBeenCalledTimes(10);
    expect(redirectMock).toHaveBeenCalledWith(
      "/library?removed=The%20Matrix",
    );
  });

  it("reports unauthenticated and invalid single removals specifically", async () => {
    const formData = new FormData();
    formData.set("userMovieId", libraryId);

    removeMovieMock.mockRejectedValueOnce(new AuthenticationRequiredError());
    await expect(
      removeMovieAction(initialLibraryActionState, formData),
    ).resolves.toEqual({
      status: "error",
      message: "Please sign in again.",
    });

    removeMovieMock.mockRejectedValueOnce(
      new LibraryValidationError("invalid UUID"),
    );
    await expect(
      removeMovieAction(initialLibraryActionState, formData),
    ).resolves.toEqual({
      status: "error",
      message: "The selected movie was invalid. Refresh the page and try again.",
    });
  });

  it("keeps RLS denials and database failures safe and retryable", async () => {
    const formData = new FormData();
    formData.set("userMovieId", libraryId);

    removeMovieMock.mockRejectedValueOnce(new LibraryAuthorizationError());
    await expect(
      removeMovieAction(initialLibraryActionState, formData),
    ).resolves.toEqual({
      status: "error",
      message: "The movie could not be removed. Please try again.",
    });

    removeMovieMock.mockRejectedValueOnce(new LibraryPersistenceError());
    await expect(
      removeMovieAction(initialLibraryActionState, formData),
    ).resolves.toEqual({
      status: "error",
      message: "The movie could not be removed. Please try again.",
    });

    removeMovieMock.mockRejectedValueOnce(
      new LibrarySchemaError("migration detail"),
    );
    await expect(
      removeMovieAction(initialLibraryActionState, formData),
    ).resolves.toEqual({
      status: "error",
      message: "The movie could not be removed. Please try again.",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

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
      favourite: true,
    });

    expect(setFavouriteMock).toHaveBeenCalledWith(
      libraryId,
      "true",
      mutationDependencies,
    );
    expect([...formData.keys()]).not.toContain("user_id");
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePathMock).toHaveBeenCalledWith("/library");
    expect(revalidatePathMock).toHaveBeenCalledWith("/library/[movieId]", "page");
    expect(revalidatePathMock).toHaveBeenCalledWith("/statistics");
    expect(revalidatePathMock).toHaveBeenCalledWith("/watch-next");
    expect(revalidatePathMock).toHaveBeenCalledWith("/schedule");
    expect(revalidatePathMock).toHaveBeenCalledWith("/picker");
    expect(revalidatePathMock).toHaveBeenCalledWith("/recommendations");
    expect(revalidatePathMock).toHaveBeenCalledTimes(10);
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
    expect(revalidatePathMock).toHaveBeenCalledWith("/picker");
    expect(revalidatePathMock).toHaveBeenCalledWith("/recommendations");
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
    expect(revalidatePathMock).toHaveBeenCalledWith("/library");
    expect(revalidatePathMock).toHaveBeenCalledWith("/library/[movieId]", "page");
    expect(revalidatePathMock).toHaveBeenCalledWith("/statistics");
    expect(revalidatePathMock).toHaveBeenCalledWith("/watch-next");
    expect(revalidatePathMock).toHaveBeenCalledWith("/schedule");
    expect(revalidatePathMock).toHaveBeenCalledWith("/picker");
    expect(revalidatePathMock).toHaveBeenCalledWith("/recommendations");
  });
});
