import { describe, expect, it, vi } from "vitest";

import { AuthenticationRequiredError, LibraryValidationError } from "./errors";
import {
  moveLibraryQueueMovie,
  scheduleLibraryMovie,
  updateLibraryMovie,
  validateLibraryMovieStatus,
  validatePersonalRating,
  validateScheduleInput,
  validateWouldWatchAgain,
  type MovieManagementDependencies,
  type MovieManagementInput,
} from "./management";
import { reorderQueueIds, toSequentialQueuePositions } from "./queue";
import { LIBRARY_MOVIE_STATUSES } from "../movies/types";

const session = {
  userId: "verified-user-id",
  client: { scope: "authenticated" },
};
const userMovieId = "11111111-1111-4111-8111-111111111111";

const baseInput: MovieManagementInput = {
  status: "want_to_watch",
  personalRating: "8.5",
  review: "A private review",
  priority: "3",
  wouldWatchAgain: true,
  watchedDate: "2026-07-20",
  watchedDateProvided: true,
  scheduledDate: "",
  scheduledTime: "",
  timezone: "",
  scheduleNote: "",
};

function createDependencies(
  overrides: Partial<MovieManagementDependencies> = {},
): MovieManagementDependencies {
  return {
    authenticate: vi.fn().mockResolvedValue(session),
    updateMovie: vi.fn().mockResolvedValue(true),
    moveQueueMovie: vi.fn().mockResolvedValue(true),
    scheduleMovie: vi.fn().mockResolvedValue({ movieId: "42" }),
    ...overrides,
  };
}

describe("movie management", () => {
  it("saves an allowed status and personal fields for the verified session", async () => {
    const updateMovieMock = vi.fn().mockResolvedValue(true);
    const dependencies = createDependencies({ updateMovie: updateMovieMock });

    await expect(
      updateLibraryMovie(
        "library-item-id",
        { ...baseInput, status: "watch_next" },
        dependencies,
      ),
    ).resolves.toBe(true);

    expect(updateMovieMock).toHaveBeenCalledWith(
      session,
      "library-item-id",
      expect.objectContaining({
        status: "watch_next",
        personalRating: 8.5,
        priority: 3,
        wouldWatchAgain: true,
        watchedAt: null,
        watchedAtProvided: false,
      }),
    );
  });

  it("validates personal ratings from 0 through 10", () => {
    expect(validatePersonalRating("0")).toBe(0);
    expect(validatePersonalRating("10")).toBe(10);
    expect(validatePersonalRating("")).toBeNull();
    expect(() => validatePersonalRating("-0.1")).toThrow(
      LibraryValidationError,
    );
    expect(() => validatePersonalRating("10.1")).toThrow(
      LibraryValidationError,
    );
  });

  it("normalizes empty rating, watched date, and review values", async () => {
    const updateMovieMock = vi.fn().mockResolvedValue(true);
    const dependencies = createDependencies({ updateMovie: updateMovieMock });

    await updateLibraryMovie(
      "library-item-id",
      {
        ...baseInput,
        status: "watched",
        personalRating: "",
        watchedDate: "",
        review: "   ",
      },
      dependencies,
    );

    expect(updateMovieMock).toHaveBeenCalledWith(
      session,
      "library-item-id",
      expect.objectContaining({
        personalRating: null,
        watchedAt: null,
        watchedAtProvided: true,
        review: null,
      }),
    );
  });

  it("updates or explicitly clears watched_at only for a Watched submission", async () => {
    const updateMovieMock = vi.fn().mockResolvedValue(true);
    const dependencies = createDependencies({ updateMovie: updateMovieMock });

    await updateLibraryMovie(
      "library-item-id",
      { ...baseInput, status: "watched" },
      dependencies,
    );
    expect(updateMovieMock).toHaveBeenLastCalledWith(
      session,
      "library-item-id",
      expect.objectContaining({
        watchedAt: "2026-07-20T00:00:00.000Z",
        watchedAtProvided: true,
      }),
    );

    await updateLibraryMovie(
      "library-item-id",
      {
        ...baseInput,
        status: "watched",
        watchedDate: "",
      },
      dependencies,
    );
    expect(updateMovieMock).toHaveBeenLastCalledWith(
      session,
      "library-item-id",
      expect.objectContaining({ watchedAt: null, watchedAtProvided: true }),
    );
  });

  it("preserves watched_at for non-Watched and unrelated submissions", async () => {
    const updateMovieMock = vi.fn().mockResolvedValue(true);
    const dependencies = createDependencies({ updateMovie: updateMovieMock });

    for (const input of [
      { ...baseInput, status: "currently_watching" },
      {
        ...baseInput,
        status: "watched",
        watchedDateProvided: false,
      },
    ]) {
      await updateLibraryMovie("library-item-id", input, dependencies);
      expect(updateMovieMock).toHaveBeenLastCalledWith(
        session,
        "library-item-id",
        expect.objectContaining({ watchedAt: null, watchedAtProvided: false }),
      );
    }
  });

  it("normalizes checked and unchecked rewatch values", () => {
    expect(validateWouldWatchAgain("true")).toBe(true);
    expect(validateWouldWatchAgain("on")).toBe(true);
    expect(validateWouldWatchAgain(null)).toBe(false);
    expect(validateWouldWatchAgain("")).toBe(false);
  });

  it("accepts only the exact database status values", () => {
    for (const status of LIBRARY_MOVIE_STATUSES) {
      expect(validateLibraryMovieStatus(status)).toBe(status);
    }

    expect(() => validateLibraryMovieStatus("Want to Watch")).toThrow(
      LibraryValidationError,
    );
    expect(() => validateLibraryMovieStatus("Watch Next")).toThrow(
      LibraryValidationError,
    );
  });

  it("keeps queue positions sequential when adding, removing, and moving", () => {
    const afterAdd = toSequentialQueuePositions(["one", "two", "three"]);
    expect(afterAdd.map((item) => item.queuePosition)).toEqual([1, 2, 3]);

    const afterRemove = toSequentialQueuePositions(
      afterAdd.map((item) => item.libraryId).filter((id) => id !== "two"),
    );
    expect(afterRemove).toEqual([
      { libraryId: "one", queuePosition: 1 },
      { libraryId: "three", queuePosition: 2 },
    ]);

    expect(reorderQueueIds(["one", "two", "three"], "three", "up")).toEqual([
      "one",
      "three",
      "two",
    ]);
  });

  it("handles queue boundaries and a single-item queue", () => {
    expect(reorderQueueIds(["one", "two"], "one", "down")).toEqual([
      "two",
      "one",
    ]);
    expect(reorderQueueIds(["one", "two"], "two", "up")).toEqual([
      "two",
      "one",
    ]);
    expect(reorderQueueIds(["one", "two"], "one", "up")).toEqual([
      "one",
      "two",
    ]);
    expect(reorderQueueIds(["one", "two"], "two", "down")).toEqual([
      "one",
      "two",
    ]);
    expect(reorderQueueIds(["one"], "one", "up")).toEqual(["one"]);
    expect(reorderQueueIds(["one"], "one", "down")).toEqual(["one"]);
  });

  it("keeps a three-item queue sequential after leaving Watch Next", () => {
    const moved = reorderQueueIds(["one", "two", "three"], "one", "down");
    expect(toSequentialQueuePositions(moved)).toEqual([
      { libraryId: "two", queuePosition: 1 },
      { libraryId: "one", queuePosition: 2 },
      { libraryId: "three", queuePosition: 3 },
    ]);

    const afterLeaving = moved.filter((id) => id !== "one");
    expect(toSequentialQueuePositions(afterLeaving)).toEqual([
      { libraryId: "two", queuePosition: 1 },
      { libraryId: "three", queuePosition: 2 },
    ]);
  });

  it("derives queue ownership from authentication and ignores browser user IDs", async () => {
    const moveQueueMovieMock = vi.fn().mockResolvedValue(true);
    const dependencies = createDependencies({
      moveQueueMovie: moveQueueMovieMock,
    });

    await moveLibraryQueueMovie("library-item-id", "up", dependencies);

    expect(moveQueueMovieMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "verified-user-id" }),
      "library-item-id",
      "up",
    );
    expect(moveQueueMovieMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: "another-user" }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("rejects unauthenticated queue reordering", async () => {
    const moveQueueMovieMock = vi.fn();
    const dependencies = createDependencies({
      authenticate: vi.fn().mockResolvedValue(null),
      moveQueueMovie: moveQueueMovieMock,
    });

    await expect(
      moveLibraryQueueMovie(userMovieId, "down", dependencies),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    expect(moveQueueMovieMock).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated management requests before persistence", async () => {
    const updateMovieMock = vi.fn();
    const dependencies = createDependencies({
      authenticate: vi.fn().mockResolvedValue(null),
      updateMovie: updateMovieMock,
    });

    await expect(
      updateLibraryMovie("library-item-id", baseInput, dependencies),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    expect(updateMovieMock).not.toHaveBeenCalled();
  });

  it("schedules an item as a timezone-aware instant", async () => {
    const scheduleMovieMock = vi.fn().mockResolvedValue({ movieId: "42" });
    const dependencies = createDependencies({
      scheduleMovie: scheduleMovieMock,
    });

    await scheduleLibraryMovie(
      userMovieId,
      {
        scheduledDate: "2099-07-22",
        scheduledTime: "19:30",
        timezone: "Asia/Karachi",
        scheduleNote: "At home",
      },
      dependencies,
    );

    expect(scheduleMovieMock).toHaveBeenCalledWith(session, userMovieId, {
      scheduledFor: "2099-07-22T14:30:00.000Z",
      timezone: "Asia/Karachi",
      scheduleNote: "At home",
    });
  });

  it("requires a movie selection and a valid user_movies UUID", async () => {
    const dependencies = createDependencies();

    await expect(
      scheduleLibraryMovie("", {
        scheduledDate: "2099-07-22",
        scheduledTime: "19:30",
        timezone: "Asia/Karachi",
        scheduleNote: "",
      }, dependencies),
    ).rejects.toThrow("Select a movie");
    await expect(
      scheduleLibraryMovie("not-a-uuid", {
        scheduledDate: "2099-07-22",
        scheduledTime: "19:30",
        timezone: "Asia/Karachi",
        scheduleNote: "",
      }, dependencies),
    ).rejects.toThrow("selected movie is invalid");
  });

  it("rejects past schedules and invalid timezones", () => {
    const now = new Date("2026-07-22T12:00:00.000Z");

    expect(() =>
      validateScheduleInput(
        {
          scheduledDate: "2026-07-22",
          scheduledTime: "12:00",
          timezone: "UTC",
          scheduleNote: "",
        },
        now,
      ),
    ).toThrow("in the future");
    expect(() =>
      validateScheduleInput(
        {
          scheduledDate: "2099-07-22",
          scheduledTime: "19:30",
          timezone: "Invalid/Timezone",
          scheduleNote: "",
        },
        now,
      ),
    ).toThrow("valid IANA timezone");
  });

  it("converts a future Pakistan time and trims an optional note", () => {
    expect(
      validateScheduleInput(
        {
          scheduledDate: "2026-07-23",
          scheduledTime: "19:30",
          timezone: "Asia/Karachi",
          scheduleNote: "  Movie night  ",
        },
        new Date("2026-07-22T12:00:00.000Z"),
      ),
    ).toEqual({
      scheduledFor: "2026-07-23T14:30:00.000Z",
      timezone: "Asia/Karachi",
      scheduleNote: "Movie night",
    });

    expect(
      validateScheduleInput(
        {
          scheduledDate: "2026-07-23",
          scheduledTime: "19:30",
          timezone: "Asia/Karachi",
          scheduleNote: "   ",
        },
        new Date("2026-07-22T12:00:00.000Z"),
      ).scheduleNote,
    ).toBeNull();
  });

  it("rejects unauthenticated scheduling before persistence", async () => {
    const scheduleMovieMock = vi.fn();
    const dependencies = createDependencies({
      authenticate: vi.fn().mockResolvedValue(null),
      scheduleMovie: scheduleMovieMock,
    });

    await expect(
      scheduleLibraryMovie(
        userMovieId,
        {
          scheduledDate: "2099-07-22",
          scheduledTime: "19:30",
          timezone: "Asia/Karachi",
          scheduleNote: "",
        },
        dependencies,
      ),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    expect(scheduleMovieMock).not.toHaveBeenCalled();
  });
});
