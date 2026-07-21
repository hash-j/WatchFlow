export type MovieSearchResult = {
  tmdbId: number;
  title: string;
  originalTitle: string | null;
  overview: string | null;
  posterPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
};

export type MovieCastMember = {
  name: string;
  character: string | null;
};

export type MovieTrailer = {
  key: string;
  name: string;
  site: "YouTube";
};

export type MovieDetails = MovieSearchResult & {
  backdropPath: string | null;
  runtimeMinutes: number | null;
  genres: string[];
  director: string | null;
  cast: MovieCastMember[];
  originalLanguage: string | null;
  productionCountries: string[];
  trailer: MovieTrailer | null;
};

export const LIBRARY_MOVIE_STATUSES = [
  "want_to_watch",
  "watch_next",
  "scheduled",
  "currently_watching",
  "watched",
  "on_hold",
  "dropped",
] as const;

export type LibraryMovieStatus = (typeof LIBRARY_MOVIE_STATUSES)[number];

export const LIBRARY_MOVIE_STATUS_LABELS: Record<LibraryMovieStatus, string> = {
  want_to_watch: "Want to Watch",
  watch_next: "Watch Next",
  scheduled: "Scheduled",
  currently_watching: "Currently Watching",
  watched: "Watched",
  on_hold: "On Hold",
  dropped: "Dropped",
};

export type LibraryMovie = {
  libraryId: string;
  status: LibraryMovieStatus;
  addedAt: string | null;
  updatedAt: string | null;
  personalRating: number | null;
  review: string | null;
  priority: number;
  queuePosition: number | null;
  scheduledFor: string | null;
  scheduleTimezone: string | null;
  scheduleNote: string | null;
  watchedAt: string | null;
  wouldWatchAgain: boolean;
  movie: MovieDetails & { id: string };
};
