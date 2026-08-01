import Link from "next/link";

import { MoviePoster } from "@/components/movies/movie-poster";
import {
  formatStatisticsRating,
  formatStatisticsWatchedDate,
} from "@/lib/statistics/formatting";

type StatisticsListMovie = {
  userMovieId: string;
  movieId: string;
  title: string;
  posterPath: string | null;
  releaseYear: number | null;
  personalRating: number | null;
  watchedDate: string | null;
};

export function StatisticsMovieList({
  movies,
  emptyMessage,
}: {
  movies: readonly StatisticsListMovie[];
  emptyMessage: string;
}) {
  if (movies.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {movies.map((movie) => {
        const watchedDate = formatStatisticsWatchedDate(movie.watchedDate);

        return (
          <li key={movie.userMovieId}>
            <Link
              href={`/library/${movie.movieId}`}
              className="group grid min-h-20 grid-cols-[3.5rem_1fr] gap-3 rounded-lg border bg-background p-3 transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoviePoster
                path={movie.posterPath}
                title={movie.title}
                sizes="56px"
              />
              <span className="min-w-0 self-center">
                <span className="block break-words text-sm font-semibold group-hover:underline">
                  {movie.title}
                  {movie.releaseYear ? ` (${movie.releaseYear})` : ""}
                </span>
                {movie.personalRating !== null ? (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Your rating: {formatStatisticsRating(movie.personalRating)}
                  </span>
                ) : null}
                {watchedDate ? (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Watched {watchedDate}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
