import Link from "next/link";
import { Star } from "lucide-react";

import { LibraryItemActions } from "@/components/library/library-item-actions";
import { MoviePoster } from "@/components/movies/movie-poster";
import { MovieRating } from "@/components/movies/movie-rating";
import { MovieStatusBadge } from "@/components/movies/movie-status-badge";
import { getMovieReleaseYear } from "@/lib/movies/images";
import type { LibraryMovieSummary } from "@/lib/movies/types";

export function LibraryMovieListItem({ item }: { item: LibraryMovieSummary }) {
  return (
    <article
      data-tmdb-id={item.movie.tmdbId}
      className="grid gap-4 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:items-center"
    >
      <div className="w-20">
        <MoviePoster
          path={item.movie.posterPath}
          title={item.movie.title}
          sizes="80px"
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
          <span>Priority {item.priority}</span>
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
      <div className="min-w-0 sm:min-w-48">
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
