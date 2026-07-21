import Link from "next/link";

import { MoviePoster } from "@/components/movies/movie-poster";
import { MovieRating } from "@/components/movies/movie-rating";
import { RemoveFromLibraryForm } from "@/components/movies/remove-from-library-form";
import { getMovieReleaseYear } from "@/lib/movies/images";
import type { LibraryMovie } from "@/lib/movies/types";

function formatStatus(status: string) {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function LibraryMovieCard({ item }: { item: LibraryMovie }) {
  const { movie } = item;
  const year = getMovieReleaseYear(movie.releaseDate);

  return (
    <article className="flex flex-col rounded-xl border bg-card p-3 shadow-sm">
      <Link href={`/library/${movie.id}`} className="group">
        <MoviePoster path={movie.posterPath} title={movie.title} />
        <div className="px-1 pb-2 pt-4">
          <h2 className="font-semibold leading-tight group-hover:underline">
            {movie.title}
          </h2>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              {year ?? "Date unavailable"}
            </span>
            <MovieRating rating={movie.voteAverage} />
          </div>
          <span className="mt-3 inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
            {formatStatus(item.status)}
          </span>
        </div>
      </Link>
      <div className="mt-auto border-t px-1 pt-3">
        <RemoveFromLibraryForm libraryId={item.libraryId} />
      </div>
    </article>
  );
}
