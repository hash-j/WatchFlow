import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, Clock, ExternalLink, UserRound } from "lucide-react";
import { notFound } from "next/navigation";

import { MoviePoster } from "@/components/movies/movie-poster";
import { MovieRating } from "@/components/movies/movie-rating";
import { MovieManagementForm } from "@/components/movies/movie-management-form";
import { FavouriteToggleForm } from "@/components/movies/favourite-toggle-form";
import { RemoveFromLibraryForm } from "@/components/movies/remove-from-library-form";
import { getLibraryMovie } from "@/lib/library/service";
import { createSupabaseLibraryDependencies } from "@/lib/library/supabase-library";
import {
  getLocalDateInput,
  getLocalTimeInput,
  normalizeTimeZone,
} from "@/lib/library/timezone";
import {
  getMovieReleaseYear,
  getYouTubeTrailerUrl,
} from "@/lib/movies/images";
import { getAuthContext } from "@/lib/supabase/auth";

type MovieDetailPageProps = {
  params: Promise<{ movieId: string }>;
};

function DetailLoading() {
  return (
    <div className="grid animate-pulse gap-8 md:grid-cols-[16rem_1fr]" aria-busy="true">
      <span className="sr-only">Loading movie details</span>
      <div className="aspect-[2/3] rounded-xl bg-muted" />
      <div className="space-y-4">
        <div className="h-10 w-2/3 rounded bg-muted" />
        <div className="h-5 w-1/3 rounded bg-muted" />
        <div className="h-32 rounded bg-muted" />
      </div>
    </div>
  );
}

async function MovieDetail({ params }: MovieDetailPageProps) {
  const { movieId } = await params;
  const [item, authContext] = await Promise.all([
    getLibraryMovie(movieId, createSupabaseLibraryDependencies()),
    getAuthContext(),
  ]);

  if (!item) {
    notFound();
  }

  const { movie } = item;
  const year = getMovieReleaseYear(movie.releaseDate);
  const timezone = normalizeTimeZone(authContext.profile?.timezone);
  const scheduledDate = item.scheduledFor
    ? getLocalDateInput(item.scheduledFor, timezone)
    : getLocalDateInput(new Date().toISOString(), timezone);
  const scheduledTime = item.scheduledFor
    ? getLocalTimeInput(item.scheduledFor, timezone)
    : "19:00";

  return (
    <article className="grid gap-8 md:grid-cols-[16rem_1fr]">
      <div>
        <MoviePoster
          path={movie.posterPath}
          title={movie.title}
          priority
          sizes="256px"
        />
        <div className="mt-4">
          <RemoveFromLibraryForm
            userMovieId={item.libraryId}
            movieId={movie.id}
            redirectAfterRemoval
          />
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>{year ?? "Release date unavailable"}</span>
          {movie.runtimeMinutes ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-4" aria-hidden="true" />
              {movie.runtimeMinutes} min
            </span>
          ) : null}
          <MovieRating rating={movie.voteAverage} />
        </div>

        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          {movie.title}
        </h1>
        <div className="mt-4">
          <FavouriteToggleForm
            libraryId={item.libraryId}
            movieId={movie.id}
            title={movie.title}
            favourite={item.favourite}
          />
        </div>
        {movie.originalTitle ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Original title: {movie.originalTitle}
          </p>
        ) : null}

        {movie.genres.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {movie.genres.map((genre) => (
              <span key={genre} className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
                {genre}
              </span>
            ))}
          </div>
        ) : null}

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Overview</h2>
          <p className="mt-2 max-w-3xl leading-7 text-muted-foreground">
            {movie.overview ?? "No overview is available for this movie."}
          </p>
        </section>

        <section className="mt-8 grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Director
            </h2>
            <p className="mt-2 font-medium">{movie.director ?? "Unavailable"}</p>
          </div>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Main cast
            </h2>
            {movie.cast.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {movie.cast.map((member) => (
                  <li key={`${member.name}-${member.character ?? ""}`} className="flex gap-2 text-sm">
                    <UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span>
                      {member.name}
                      {member.character ? (
                        <span className="text-muted-foreground"> as {member.character}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Cast unavailable</p>
            )}
          </div>
        </section>

        {movie.trailer ? (
          <a
            href={getYouTubeTrailerUrl(movie.trailer.key)}
            target="_blank"
            rel="noreferrer"
            className="mt-8 inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4"
          >
            Watch {movie.trailer.name}
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        ) : (
          <p className="mt-8 text-sm text-muted-foreground">
            No suitable trailer is currently available.
          </p>
        )}

        <section className="mt-10 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold">Your movie details</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Status, ratings, notes, and dates are private to your account.
            </p>
          </div>
          <MovieManagementForm
            item={item}
            timezone={timezone}
            scheduledDate={scheduledDate}
            scheduledTime={scheduledTime}
          />
        </section>
      </div>
    </article>
  );
}

export default function MovieDetailPage({ params }: MovieDetailPageProps) {
  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/library"
        className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to library
      </Link>
      <Suspense fallback={<DetailLoading />}>
        <MovieDetail params={params} />
      </Suspense>
    </div>
  );
}
