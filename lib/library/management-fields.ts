import type { LibraryMovieStatus } from "../movies/types";

export type MovieManagementFieldVisibility = {
  priority: boolean;
  personalRating: boolean;
  watchedDate: boolean;
  schedule: boolean;
  wouldWatchAgain: boolean;
};

export function getMovieManagementFieldVisibility(
  status: LibraryMovieStatus,
): MovieManagementFieldVisibility {
  return {
    priority: status === "watch_next",
    personalRating: status === "watched",
    watchedDate: status === "watched",
    schedule: status === "scheduled",
    wouldWatchAgain: status === "watched",
  };
}

