import type { MovieDetails, MovieSearchResult } from "./types";

export interface MovieProvider {
  searchMovies(query: string): Promise<MovieSearchResult[]>;
  getMovieDetails(tmdbId: number): Promise<MovieDetails>;
}
