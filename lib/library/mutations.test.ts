import { describe, expect, it, vi } from "vitest";

import {
  AuthenticationRequiredError,
  LibraryValidationError,
} from "./errors";
import {
  bulkRemoveLibraryMovies,
  bulkUpdateLibraryStatus,
  MAX_LIBRARY_BULK_SIZE,
  removeLibraryMovie,
  setLibraryMovieFavourite,
  validateBulkLibraryStatus,
  validateFavourite,
  validateLibrarySelection,
  validateUserMovieId,
  type LibraryMutationDependencies,
} from "./mutations";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

function dependencies(
  overrides: Partial<LibraryMutationDependencies> = {},
): LibraryMutationDependencies {
  return {
    authenticate: vi.fn().mockResolvedValue({
      userId: "verified-user",
      client: {},
    }),
    setFavourite: vi.fn().mockResolvedValue(true),
    bulkUpdateStatus: vi.fn().mockResolvedValue({
      success: true,
      requested: 2,
      matched: 2,
      affected: 2,
      skipped: 0,
      failed: 0,
      reason: null,
    }),
    removeUserMovies: vi.fn().mockResolvedValue({
      success: true,
      requested: 2,
      matched: 2,
      affected: 2,
      skipped: 0,
      failed: 0,
      reason: null,
    }),
    ...overrides,
  };
}

describe("bulk library input validation", () => {
  it("requires a non-empty array", () => {
    expect(() => validateLibrarySelection(undefined)).toThrow(
      LibraryValidationError,
    );
    expect(() => validateLibrarySelection([])).toThrow(/at least one/i);
  });

  it("rejects an invalid selected ID", () => {
    expect(() => validateLibrarySelection(["movie-42"])).toThrow(
      LibraryValidationError,
    );
    expect(() => validateUserMovieId("movie-42")).toThrow(
      "The selected library record was invalid.",
    );
  });

  it("rejects duplicate selected IDs", () => {
    expect(() => validateLibrarySelection([firstId, firstId])).toThrow(
      /duplicate/i,
    );
  });

  it("rejects an excessive batch", () => {
    const ids = Array.from(
      { length: MAX_LIBRARY_BULK_SIZE + 1 },
      (_, index) =>
        `${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`,
    );
    expect(() => validateLibrarySelection(ids)).toThrow(/no more than 100/i);
  });

  it.each([
    "want_to_watch",
    "watch_next",
    "currently_watching",
    "watched",
    "on_hold",
    "dropped",
  ])("accepts bulk status %s", (status) => {
    expect(validateBulkLibraryStatus(status)).toBe(status);
  });

  it("excludes scheduled from bulk status changes", () => {
    expect(() => validateBulkLibraryStatus("scheduled")).toThrow(
      /require a date and time/i,
    );
  });

  it("validates explicit favourite states without truthy string coercion", () => {
    expect(validateFavourite("true")).toBe(true);
    expect(validateFavourite("false")).toBe(false);
    expect(() => validateFavourite("yes")).toThrow(LibraryValidationError);
  });
});

describe("authenticated library mutations", () => {
  it("refuses an unauthenticated favourite or bulk action", async () => {
    const deps = dependencies({
      authenticate: vi.fn().mockResolvedValue(null),
    });

    await expect(
      setLibraryMovieFavourite(firstId, true, deps),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    await expect(
      bulkUpdateLibraryStatus([firstId], "watched", deps),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    await expect(
      bulkRemoveLibraryMovies([firstId], deps),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    await expect(
      removeLibraryMovie(firstId, deps),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    expect(deps.setFavourite).not.toHaveBeenCalled();
    expect(deps.bulkUpdateStatus).not.toHaveBeenCalled();
    expect(deps.removeUserMovies).not.toHaveBeenCalled();
  });

  it("adds and removes a favourite on the user_movies record ID", async () => {
    const deps = dependencies();

    await setLibraryMovieFavourite(firstId, "true", deps);
    await setLibraryMovieFavourite(firstId, "false", deps);

    expect(deps.setFavourite).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ userId: "verified-user" }),
      firstId,
      true,
    );
    expect(deps.setFavourite).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ userId: "verified-user" }),
      firstId,
      false,
    );
  });

  it("passes validated IDs in displayed order to a bulk status change", async () => {
    const deps = dependencies();

    await bulkUpdateLibraryStatus(
      [secondId, firstId],
      "watch_next",
      deps,
    );

    expect(deps.bulkUpdateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "verified-user" }),
      [secondId, firstId],
      "watch_next",
    );
  });

  it("passes only selected user_movies IDs to bulk deletion", async () => {
    const deps = dependencies();

    await bulkRemoveLibraryMovies([firstId, secondId], deps);

    expect(deps.removeUserMovies).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "verified-user" }),
      [firstId, secondId],
    );
  });

  it("removes one validated user_movies UUID through the shared deletion helper", async () => {
    const deps = dependencies();

    await removeLibraryMovie(firstId, deps);

    expect(deps.removeUserMovies).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "verified-user" }),
      [firstId],
    );
    expect(deps.removeUserMovies).toHaveBeenCalledTimes(1);
  });
});
