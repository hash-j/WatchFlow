import Link from "next/link";
import { Star } from "lucide-react";

import { LibraryItemActions } from "@/components/library/library-item-actions";
import { MoviePoster } from "@/components/movies/movie-poster";
import { MovieRating } from "@/components/movies/movie-rating";
import { MovieStatusBadge } from "@/components/movies/movie-status-badge";
import { getMovieReleaseYear } from "@/lib/movies/images";
import { MOVIE_STATUS_VISUALS } from "@/lib/library/status-visuals";
import type { LibraryMovieSummary } from "@/lib/movies/types";
import { cn } from "@/lib/utils";

export function LibraryMovieListItem({ item }: { item: LibraryMovieSummary }) {
  return (
    <article
      data-tmdb-id={item.movie.tmdbId}
      className={cn(
        "grid min-w-0 grid-cols-[4.25rem_minmax(0,1fr)] items-start gap-3 overflow-hidden rounded-xl border bg-card p-3 shadow-sm sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-4 sm:p-4 md:grid-cols-[5rem_minmax(0,1fr)_minmax(10.5rem,auto)] md:items-center",
        MOVIE_STATUS_VISUALS[item.status].cardAccentClasses,
      )}
    >
      <div className="w-[4.25rem] sm:w-20">
        <MoviePoster
          path={item.movie.posterPath}
          title={item.movie.title}
          sizes="(min-width: 640px) 80px, 68px"
        />
      </div>
      <div className="min-w-0">
        <Link
          href={`/library/${item.movie.id}`}
          className="font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {item.movie.title}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>{getMovieReleaseYear(item.movie.releaseDate) ?? "Date unavailable"}</span>
          <MovieRating rating={item.movie.voteAverage} />
          <span className="hidden sm:inline">Priority {item.priority}</span>
        </div>
        <div className="mt-3">
          <MovieStatusBadge status={item.status} />
        </div>
        {item.favourite ? (
          <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold">
            <Star className="size-3.5 fill-current" aria-hidden="true" />
            Favourite
          </p>
        ) : null}
      </div>
      <div className="col-start-2 min-w-0 md:col-auto md:min-w-0">
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
