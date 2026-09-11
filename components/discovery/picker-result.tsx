import Link from "next/link";
import type { Ref } from "react";
import {
  ArrowRight,
  Clock3,
  Heart,
  ListPlus,
  Sparkles,
} from "lucide-react";

import { WatchNextAction } from "@/components/discovery/watch-next-action";
import { FavouriteToggleForm } from "@/components/movies/favourite-toggle-form";
import { MoviePoster } from "@/components/movies/movie-poster";
import { MovieRating } from "@/components/movies/movie-rating";
import { MovieStatusBadge } from "@/components/movies/movie-status-badge";
import { buttonVariants } from "@/components/ui/button";
import { ResponsiveActions } from "@/components/ui/responsive-layout";
import type { PickerResult as PickerResultValue } from "@/lib/discovery/types";

export function PickerResult({
  result,
  headingRef,
}: {
  result: PickerResultValue;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const movie = result.movie;
  if (!movie) {
    return null;
  }

  return (
    <article className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="grid min-w-0 gap-6 p-4 sm:p-6 md:grid-cols-[12rem_minmax(0,1fr)] lg:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-48 md:max-w-none">
          <MoviePoster
            path={movie.posterPath}
            title={movie.title}
            sizes="(max-width: 640px) 208px, 240px"
          />
        </div>

        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Your pick
          </p>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="mt-1 break-words text-2xl font-bold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-3xl"
          >
            {movie.title}
          </h2>
          {movie.originalTitle ? (
            <p className="mt-1 break-words text-sm text-muted-foreground">
              Original title: {movie.originalTitle}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <MovieStatusBadge status={movie.status} />
            <span className="inline-flex items-center gap-1 text-sm">
              <span className="font-medium">Public rating:</span>
              <MovieRating rating={movie.publicRating} />
            </span>
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <Heart
                className={movie.favourite ? "size-4 fill-current" : "size-4"}
                aria-hidden="true"
              />
              {movie.favourite ? "Favourite" : "Not a favourite"}
            </span>
          </div>

          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Release year</dt>
              <dd className="font-medium">
                {movie.releaseYear ?? "Unavailable"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Runtime</dt>
              <dd className="inline-flex items-center gap-1 font-medium">
                <Clock3 className="size-4" aria-hidden="true" />
                {movie.runtimeMinutes === null
                  ? "Unavailable"
                  : `${movie.runtimeMinutes} minutes`}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Director</dt>
              <dd className="break-words font-medium">
                {movie.director ?? "Unavailable"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Genres</dt>
              <dd className="break-words font-medium">
                {movie.genres.length > 0
                  ? movie.genres.join(", ")
                  : "Unavailable"}
              </dd>
            </div>
          </dl>

          <section
            aria-labelledby="picker-match-reasons"
            className="mt-6 rounded-xl bg-muted/60 p-4"
          >
            <h3
              id="picker-match-reasons"
              className="flex items-center gap-2 font-semibold"
            >
              <Sparkles className="size-4" aria-hidden="true" />
              Why it matched
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {result.reasons.map((reason) => (
                <li key={reason}>• {reason}</li>
              ))}
            </ul>
          </section>

          <ResponsiveActions className="mt-6 items-stretch [&>a]:min-h-11 [&>form]:flex [&>form]:min-w-0 [&>form]:flex-col [&>form>button]:w-full min-[420px]:items-start min-[420px]:[&>form]:w-auto min-[420px]:[&>form>button]:w-auto">
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
              Add to Custom List
            </Link>
          </ResponsiveActions>
        </div>
      </div>
    </article>
  );
}
