import { describe, expect, it } from "vitest";

import {
  isMovieManagementSelectableStatus,
  MOVIE_MANAGEMENT_SELECTABLE_STATUSES,
} from "../movies/types";
import { getMovieManagementFieldVisibility } from "./management-fields";

describe("movie-management status fields", () => {
  it("offers only the four supported statuses for new edits", () => {
    expect(MOVIE_MANAGEMENT_SELECTABLE_STATUSES).toEqual([
      "want_to_watch",
      "watch_next",
      "scheduled",
      "watched",
    ]);
    expect(isMovieManagementSelectableStatus("currently_watching")).toBe(false);
  });

  it.each([
    [
      "want_to_watch",
      {
        priority: false,
        personalRating: false,
        watchedDate: false,
        schedule: false,
        wouldWatchAgain: false,
      },
    ],
    [
      "watch_next",
      {
        priority: true,
        personalRating: false,
        watchedDate: false,
        schedule: false,
        wouldWatchAgain: false,
      },
    ],
    [
      "scheduled",
      {
        priority: false,
        personalRating: false,
        watchedDate: false,
        schedule: true,
        wouldWatchAgain: false,
      },
    ],
    [
      "watched",
      {
        priority: false,
        personalRating: true,
        watchedDate: true,
        schedule: false,
        wouldWatchAgain: true,
      },
    ],
  ] as const)("returns the exact %s field matrix", (status, expected) => {
    expect(getMovieManagementFieldVisibility(status)).toEqual(expected);
  });

  it.each(["currently_watching", "on_hold", "dropped"] as const)(
    "keeps non-selectable %s records readable with review-only metadata",
    (status) => {
      expect(getMovieManagementFieldVisibility(status)).toEqual({
        priority: false,
        personalRating: false,
        watchedDate: false,
        schedule: false,
        wouldWatchAgain: false,
      });
    },
  );
});
