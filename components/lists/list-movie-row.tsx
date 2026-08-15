import Link from "next/link";
import { Star } from "lucide-react";

import { MoviePoster } from "@/components/movies/movie-poster";
import { MovieStatusBadge } from "@/components/movies/movie-status-badge";
import type { CustomListMovie } from "@/lib/lists/types";

import { ListOrderControls } from "./list-order-controls";
import { RemoveListMovieDialog } from "./remove-list-movie-dialog";

export function ListMovieRow({
  item,
  listName,
  isFirst,
  isLast,
}: {
  item: CustomListMovie;
  listName: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const year =
    item.movie.releaseYear ??
    (item.movie.releaseDate ? item.movie.releaseDate.slice(0, 4) : null);

  return (
    <li className="grid min-w-0 gap-4 rounded-xl border bg-card p-4 shadow-sm md:grid-cols-[3rem_5rem_minmax(0,1fr)] lg:grid-cols-[3rem_5rem_minmax(0,1fr)_auto] lg:items-center">
      <div className="flex items-center gap-3 sm:block">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold"
          aria-label={`Position ${item.position}`}
        >
          {item.position}
        </span>
        <span className="text-sm font-medium sm:sr-only">
          Position {item.position}
        </span>
      </div>

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
          className="break-words font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {item.movie.title}
        </Link>
        {item.movie.originalTitle ? (
          <p className="mt-1 break-words text-xs text-muted-foreground">
            Original: {item.movie.originalTitle}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{year ?? "Release date unavailable"}</span>
          {item.personalRating !== null ? (
            <span>Your rating: {item.personalRating}/10</span>
          ) : (
            <span>Not rated</span>
          )}
          {item.favourite ? (
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <Star className="size-3.5 fill-current" aria-hidden="true" />
              Favourite
            </span>
          ) : null}
        </div>
        <div className="mt-3">
          <MovieStatusBadge status={item.status} />
        </div>
      </div>

      <div className="col-span-full flex min-w-0 flex-col gap-2 border-t pt-3 md:col-start-3 lg:col-span-1 lg:col-start-auto lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
        <ListOrderControls
          listMovieId={item.listMovieId}
          title={item.movie.title}
          isFirst={isFirst}
          isLast={isLast}
        />
        <RemoveListMovieDialog
          listMovieId={item.listMovieId}
          title={item.movie.title}
          listName={listName}
        />
      </div>
    </li>
  );
}
