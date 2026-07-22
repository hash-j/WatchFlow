import { Suspense } from "react";

import { AddToLibraryForm } from "@/components/movies/add-to-library-form";
import { MoviePoster } from "@/components/movies/movie-poster";
import { MovieRating } from "@/components/movies/movie-rating";
import { MovieSearchForm } from "@/components/movies/search-form";
import { getAuthContext } from "@/lib/supabase/auth";
import {
  EmptyMovieQueryError,
  MovieProviderError,
} from "@/lib/movies/errors";
import { getMovieReleaseYear } from "@/lib/movies/images";
import { tmdbMovieProvider } from "@/lib/movies/tmdb-provider";
import { getCurrentUserPreferences } from "@/lib/settings/supabase-settings";

type SearchPageProps = {
  searchParams: Promise<{ q?: string | string[] }>;
};

function SearchLoading() {
  return (
    <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
      <span className="sr-only">Searching for movies</span>
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-80 animate-pulse rounded-xl border bg-card" />
      ))}
    </div>
  );
}

function SearchMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-8 rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

async function SearchResults({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = Array.isArray(params.q) ? params.q[0] : params.q;

  if (query === undefined) {
    return (
      <SearchMessage>
        Search by title to find a movie and add it to your private library.
      </SearchMessage>
    );
  }

  const [, preferences] = await Promise.all([
    getAuthContext(),
    getCurrentUserPreferences(),
  ]);

  try {
    const movies = await tmdbMovieProvider.searchMovies(query, {
      includeAdult: preferences?.showAdultResults ?? false,
      includeUnreleased: preferences?.includeUnreleasedMovies ?? true,
      language: preferences?.preferredLanguage ?? "en",
    });

    if (movies.length === 0) {
      return (
        <SearchMessage>
          No movies matched “{query.trim()}”. Try another title.
        </SearchMessage>
      );
    }

    return (
      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {movies.map((movie) => {
          const releaseYear = getMovieReleaseYear(movie.releaseDate);

          return (
            <article
              key={movie.tmdbId}
              className="flex overflow-hidden rounded-xl border bg-card shadow-sm"
            >
              <div className="w-32 shrink-0 p-3 pr-0">
                <MoviePoster
                  path={movie.posterPath}
                  title={movie.title}
                  sizes="128px"
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col p-4">
                <h2 className="font-semibold leading-tight">{movie.title}</h2>
                {movie.originalTitle ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Original: {movie.originalTitle}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  {releaseYear ?? "Release date unavailable"}
                </p>
                <div className="mt-2">
                  <MovieRating rating={movie.voteAverage} />
                </div>
                <p className="mt-3 line-clamp-4 text-sm text-muted-foreground">
                  {movie.overview ?? "No overview is available for this movie."}
                </p>
                <AddToLibraryForm tmdbId={movie.tmdbId} />
              </div>
            </article>
          );
        })}
      </div>
    );
  } catch (error) {
    if (error instanceof EmptyMovieQueryError) {
      return <SearchMessage>{error.message}</SearchMessage>;
    }

    if (error instanceof MovieProviderError) {
      return <SearchMessage>{error.message}</SearchMessage>;
    }

    return (
      <SearchMessage>
        Movie search is unavailable right now. Please try again.
      </SearchMessage>
    );
  }
}

export default function SearchPage({ searchParams }: SearchPageProps) {
  return (
    <div className="mx-auto max-w-6xl">
      <div>
        <p className="text-sm font-medium text-muted-foreground">WatchFlow</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Search Movies</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Search TMDB securely from the server, then save complete movie details
          to your personal library.
        </p>
        <Suspense fallback={<div className="mt-6 h-10 max-w-2xl animate-pulse rounded bg-muted" />}>
          <MovieSearchForm />
        </Suspense>
      </div>

      <Suspense fallback={<SearchLoading />}>
        <SearchResults searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
