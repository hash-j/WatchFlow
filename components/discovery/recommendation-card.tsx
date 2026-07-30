import Link from "next/link";
import { ArrowRight, Heart, ListPlus } from "lucide-react";

import { WatchNextAction } from "@/components/discovery/watch-next-action";
import { FavouriteToggleForm } from "@/components/movies/favourite-toggle-form";
import { MoviePoster } from "@/components/movies/movie-poster";
import { MovieRating } from "@/components/movies/movie-rating";
import { MovieStatusBadge } from "@/components/movies/movie-status-badge";
import { buttonVariants } from "@/components/ui/button";
import type { RecommendationItem } from "@/lib/discovery/types";

export function RecommendationCard({ item }: { item: RecommendationItem }) {
  const { movie } = item;

  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="grid min-w-0 gap-4 p-4 sm:grid-cols-[7rem_minmax(0,1fr)] lg:grid-cols-1">
        <div className="mx-auto w-full max-w-40 sm:max-w-none lg:max-w-none">
          <MoviePoster
            path={movie.posterPath}
            title={movie.title}
            sizes="(max-width: 640px) 160px, (max-width: 1024px) 112px, 260px"
          />
        </div>

        <div className="min-w-0">
          <Link
            href={`/library/${movie.movieId}`}
            className="break-words text-lg font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {movie.title}
          </Link>
          <p className="mt-1 text-sm text-muted-foreground">
            {movie.releaseYear ?? "Year unavailable"}
            {movie.runtimeMinutes === null
              ? ""
              : ` · ${movie.runtimeMinutes} min`}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <MovieStatusBadge status={movie.status} />
            <span className="inline-flex items-center gap-1 text-sm">
              <span className="font-medium">Public rating:</span>
              <MovieRating rating={movie.publicRating} />
            </span>
          </div>
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Heart
              className={movie.favourite ? "size-3.5 fill-current" : "size-3.5"}
              aria-hidden="true"
            />
            {movie.favourite ? "Favourite" : "Not a favourite"}
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col border-t p-4">
        <h3 className="text-sm font-semibold">You may like this because</h3>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          {item.reasons.map((reason) => (
            <li key={`${reason.kind}-${reason.text}`} className="break-words">
              • {reason.text}
            </li>
          ))}
        </ul>

        <div className="mt-auto flex flex-wrap items-start gap-2 pt-5">
          <Link
            href={`/library/${movie.movieId}`}
            className={buttonVariants({
              size: "sm",
              className: "min-h-11",
            })}
          >
            Open Details
            <ArrowRight aria-hidden="true" />
          </Link>
          <WatchNextAction
            userMovieId={movie.userMovieId}
            movieTitle={movie.title}
            status={movie.status}
          />
          <FavouriteToggleForm
            libraryId={movie.userMovieId}
            movieId={movie.movieId}
            title={movie.title}
            favourite={movie.favourite}
            compact
            className="min-h-11"
          />
          <Link
            href={`/library/${movie.movieId}#custom-lists-heading`}
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "min-h-11",
            })}
          >
            <ListPlus aria-hidden="true" />
            Custom Lists
          </Link>
        </div>
      </div>
    </article>
  );
}
