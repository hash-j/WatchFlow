import Link from "next/link";

import { MoviePoster } from "@/components/movies/movie-poster";
import { MovieRating } from "@/components/movies/movie-rating";
import { MovieStatusBadge } from "@/components/movies/movie-status-badge";
import { RemoveFromLibraryForm } from "@/components/movies/remove-from-library-form";
import { getMovieReleaseYear } from "@/lib/movies/images";
import type { LibraryMovie } from "@/lib/movies/types";

export function LibraryMovieListItem({ item }: { item: LibraryMovie }) {
  return (
    <article className="grid gap-4 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:items-center">
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
      </div>
      <div className="sm:min-w-36">
        <RemoveFromLibraryForm libraryId={item.libraryId} />
      </div>
    </article>
  );
}
