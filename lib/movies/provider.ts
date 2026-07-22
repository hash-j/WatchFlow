import type { MovieDetails, MovieSearchResult } from "./types";

export type MovieProviderOptions = {
  includeAdult?: boolean;
  includeUnreleased?: boolean;
  language?: string;
};

export interface MovieProvider {
  searchMovies(
    query: string,
    options?: MovieProviderOptions,
  ): Promise<MovieSearchResult[]>;
  getMovieDetails(
    tmdbId: number,
    options?: MovieProviderOptions,
  ): Promise<MovieDetails>;
}
