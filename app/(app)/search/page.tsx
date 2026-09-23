import { Suspense } from "react";
import { redirect } from "next/navigation";

import { AddToLibraryForm } from "@/components/movies/add-to-library-form";
import { MoviePoster } from "@/components/movies/movie-poster";
import { MovieRating } from "@/components/movies/movie-rating";
import { MovieSearchForm } from "@/components/movies/search-form";
import { PageContainer, PageHeader } from "@/components/ui/responsive-layout";
import {
  EmptyMovieQueryError,
  MovieProviderError,
  MovieSearchValidationError,
} from "@/lib/movies/errors";
import { AuthenticationRequiredError } from "@/lib/library/errors";
import { getCurrentUserSearchOwnedTmdbIds } from "@/lib/library/supabase-search-membership";
import { getMovieReleaseYear } from "@/lib/movies/images";
import { searchTmdbMoviesForCurrentUser } from "@/lib/movies/server-search";

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

  let searchResult:
    | {
        status: "success";
        movies: Awaited<ReturnType<typeof searchTmdbMoviesForCurrentUser>>;
        ownedTmdbIds: Set<number>;
      }
    | { status: "error"; message: string };

  try {
    const movies = await searchTmdbMoviesForCurrentUser(query);
    const ownedTmdbIds = await getCurrentUserSearchOwnedTmdbIds(
      movies.map((movie) => movie.tmdbId),
    );
    searchResult = { status: "success", movies, ownedTmdbIds };
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect("/auth/login");
    } else if (
      error instanceof EmptyMovieQueryError ||
      error instanceof MovieSearchValidationError
    ) {
      searchResult = { status: "error", message: error.message };
    } else if (error instanceof MovieProviderError) {
      searchResult = { status: "error", message: error.message };
    } else {
      searchResult = {
        status: "error",
        message: "Movie search is unavailable right now. Please try again.",
      };
    }
  }

  if (searchResult.status === "error") {
    return <SearchMessage>{searchResult.message}</SearchMessage>;
  }

  if (searchResult.movies.length === 0) {
    return (
      <SearchMessage>
        No movies matched “{query.trim()}”. Try another title.
      </SearchMessage>
    );
  }

  return (
    <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {searchResult.movies.map((movie) => {
        const releaseYear = getMovieReleaseYear(movie.releaseDate);

        return (
          <article
            key={movie.tmdbId}
            data-tmdb-id={movie.tmdbId}
            className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm min-[430px]:flex-row"
          >
            <div className="mx-auto w-full max-w-44 shrink-0 p-3 min-[430px]:mx-0 min-[430px]:w-32 min-[430px]:pr-0">
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
              <AddToLibraryForm
                tmdbId={movie.tmdbId}
                alreadyInLibrary={searchResult.ownedTmdbIds.has(movie.tmdbId)}
              />
            </div>
          </article>
        );
      })}
    </div>
  );
}

export default function SearchPage({ searchParams }: SearchPageProps) {
  return (
    <PageContainer className="max-w-6xl">
      <div>
        <PageHeader
          eyebrow="Discover"
          title="Search"
          description="Find movies by title and save them to your private Library."
          className="mb-0"
        />
        <Suspense fallback={<div className="mt-6 h-10 max-w-2xl animate-pulse rounded bg-muted" />}>
          <MovieSearchForm />
        </Suspense>
      </div>

      <Suspense fallback={<SearchLoading />}>
        <SearchResults searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}
