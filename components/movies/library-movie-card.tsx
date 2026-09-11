import Link from "next/link";
import { Star } from "lucide-react";

import { LibraryItemActions } from "@/components/library/library-item-actions";
import { MovieStatusBadge } from "@/components/movies/movie-status-badge";
import { MoviePoster } from "@/components/movies/movie-poster";
import { MovieRating } from "@/components/movies/movie-rating";
import { getMovieReleaseYear } from "@/lib/movies/images";
import { MOVIE_STATUS_VISUALS } from "@/lib/library/status-visuals";
import type { LibraryMovieSummary } from "@/lib/movies/types";
import { cn } from "@/lib/utils";

export function LibraryMovieCard({ item }: { item: LibraryMovieSummary }) {
  const { movie } = item;
  const year = getMovieReleaseYear(movie.releaseDate);
  const statusVisual = MOVIE_STATUS_VISUALS[item.status];

  return (
    <article
      data-tmdb-id={movie.tmdbId}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card p-2 shadow-sm sm:p-3",
        statusVisual.cardAccentClasses,
      )}
    >
      <Link
        href={`/library/${movie.id}`}
        className="group rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div className="relative">
          <MoviePoster path={movie.posterPath} title={movie.title} />
          {item.favourite ? (
            <span className="absolute bottom-2 left-2 inline-flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-full border bg-background/95 px-2 py-1 text-xs font-semibold shadow-sm">
              <Star className="size-3.5 fill-current" aria-hidden="true" />
              Favourite
            </span>
          ) : null}
        </div>
        <div className="px-1 pb-2 pt-3 sm:pt-4">
          <h2 className="line-clamp-2 break-words text-sm font-semibold leading-tight group-hover:underline sm:text-base">
            {movie.title}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5 sm:mt-2 sm:gap-2">
            <span className="text-xs text-muted-foreground sm:text-sm">
              {year ?? "Date unavailable"}
            </span>
            <MovieRating rating={movie.voteAverage} />
          </div>
          <div className="mt-2 sm:mt-3">
            <MovieStatusBadge status={item.status} />
          </div>
        </div>
      </Link>
      <div className="mt-auto border-t px-1 pt-2.5 sm:pt-3">
        <LibraryItemActions
          userMovieId={item.libraryId}
          movieId={item.movie.id}
          title={item.movie.title}
          favourite={item.favourite}
        />
      </div>
    </article>
  );
}
