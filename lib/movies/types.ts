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

export type LibraryMovieStatus = "want_to_watch" | string;

export type LibraryMovie = {
  libraryId: string;
  status: LibraryMovieStatus;
  addedAt: string | null;
  movie: MovieDetails & { id: string };
};
