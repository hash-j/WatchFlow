import Link from "next/link";
import { ChartBarBig, Clapperboard, LibraryBig, Star } from "lucide-react";

import { StatisticsMovieList } from "@/components/statistics/statistics-movie-list";
import { StatisticsSummary } from "@/components/statistics/statistics-summary";
import {
  GenreDistribution,
  RatingDistribution,
  StatusDistribution,
  WatchedTimeline,
} from "@/components/statistics/statistics-visualizations";
import { buttonVariants } from "@/components/ui/button";
import {
  formatStatisticsCount,
} from "@/lib/statistics/formatting";
import type { StatisticsResult } from "@/lib/statistics/types";

function EmptyLibraryState() {
  return (
    <section className="rounded-xl border border-dashed bg-card p-8 text-center shadow-sm sm:p-10">
      <LibraryBig
        className="mx-auto size-10 text-muted-foreground"
        aria-hidden="true"
      />
      <h2 className="mt-4 text-xl font-semibold">No library statistics yet</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
        Add movies to your library to begin building viewing statistics.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/search" className={buttonVariants()}>
          Search Movies
        </Link>
        <Link
          href="/import"
          className={buttonVariants({ variant: "outline" })}
        >
          Import Movies
        </Link>
      </div>
    </section>
  );
}

function NoWatchedState() {
  return (
    <section
      className="rounded-xl border border-dashed bg-card p-6 sm:p-8"
      aria-labelledby="no-watched-heading"
    >
      <Clapperboard className="size-8 text-muted-foreground" aria-hidden="true" />
      <h2 id="no-watched-heading" className="mt-4 text-xl font-semibold">
        No watched movies yet
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Mark movies as watched to unlock viewing activity statistics.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/library" className={buttonVariants()}>
          Open Library
        </Link>
        <Link
          href="/watch-next"
          className={buttonVariants({ variant: "outline" })}
        >
          Open Watch Next
        </Link>
      </div>
    </section>
  );
}

function CoverageNotice({ result }: { result: StatisticsResult }) {
  if (result.coverage.complete) {
    return null;
  }

  return (
    <p
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
      role="status"
    >
      Your library contains {formatStatisticsCount(result.coverage.totalMovies)}
      {" "}movies. Except for the exact total, metrics and distributions use the newest {formatStatisticsCount(
        result.coverage.analyzedMovies,
      )} records, so partial values are labelled as analyzed data.
    </p>
  );
}

export function StatisticsDashboard({ result }: { result: StatisticsResult }) {
  if (result.emptyState.emptyLibrary) {
    return <EmptyLibraryState />;
  }

  return (
    <div className="space-y-8">
      <CoverageNotice result={result} />
      <StatisticsSummary result={result} />

      {result.emptyState.noWatchedMovies ? <NoWatchedState /> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section
          className="min-w-0 rounded-xl border bg-card p-5 shadow-sm sm:p-6"
          aria-labelledby="status-distribution-heading"
        >
          <h2 id="status-distribution-heading" className="text-xl font-semibold">
            Status distribution
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Current statuses across {formatStatisticsCount(
              result.coverage.analyzedMovies,
            )} analyzed library {result.coverage.analyzedMovies === 1 ? "movie" : "movies"}.
          </p>
          <div className="mt-5">
            <StatusDistribution entries={result.statusBreakdown} />
          </div>
        </section>

        <section
          className="min-w-0 rounded-xl border bg-card p-5 shadow-sm sm:p-6"
          aria-labelledby="genre-distribution-heading"
        >
          <h2 id="genre-distribution-heading" className="text-xl font-semibold">
            Most common genres in your library
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Each movie counts once per normalized genre; percentages use the
            analyzed library size.
          </p>
          <div className="mt-5">
            {result.genres.length > 0 ? (
              <GenreDistribution entries={result.genres} />
            ) : (
              <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                Genre metadata is unavailable for the movies in your library.
              </p>
            )}
          </div>
        </section>
      </div>

      {!result.emptyState.noWatchedMovies ? (
        <section
          className="rounded-xl border bg-card p-5 shadow-sm sm:p-6"
          aria-labelledby="watched-over-time-heading"
        >
          <div className="flex items-start gap-3">
            <ChartBarBig className="mt-0.5 size-5 text-muted-foreground" aria-hidden="true" />
            <div>
              <h2 id="watched-over-time-heading" className="text-xl font-semibold">
                Watched over time
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Movies with a stored watched date, by month for the last 12
                months. The current period uses {result.timezone}.
              </p>
            </div>
          </div>
          <div className="mt-5">
            <WatchedTimeline entries={result.timeline} />
          </div>
        </section>
      ) : null}

      <section
        className="rounded-xl border bg-card p-5 shadow-sm sm:p-6"
        aria-labelledby="rating-distribution-heading"
      >
        <div className="flex items-start gap-3">
          <Star className="mt-0.5 size-5 text-muted-foreground" aria-hidden="true" />
          <div>
            <h2 id="rating-distribution-heading" className="text-xl font-semibold">
              Personal rating distribution
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Valid personal ratings from 0 through 10; public ratings and
              unrated movies are excluded.
            </p>
          </div>
        </div>
        <div className="mt-5">
          {result.emptyState.noPersonalRatings ? (
            <div className="rounded-lg border border-dashed p-5">
              <h3 className="font-semibold">No personal ratings yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Rate watched movies to see your rating distribution.
              </p>
              <Link
                href="/library"
                className={`${buttonVariants({ variant: "outline" })} mt-4`}
              >
                Open Library
              </Link>
            </div>
          ) : (
            <RatingDistribution entries={result.ratingDistribution} />
          )}
        </div>
      </section>

      {!result.emptyState.noWatchedMovies ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section
            className="min-w-0 rounded-xl border bg-card p-5 shadow-sm sm:p-6"
            aria-labelledby="top-rated-heading"
          >
            <h2 id="top-rated-heading" className="text-xl font-semibold">
              Top-rated watched movies
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Up to five watched movies, ordered by your personal rating.
            </p>
            <div className="mt-5">
              <StatisticsMovieList
                movies={result.topRatedWatched}
                emptyMessage="Rate watched movies to build this list."
              />
            </div>
          </section>

          <section
            className="min-w-0 rounded-xl border bg-card p-5 shadow-sm sm:p-6"
            aria-labelledby="recently-watched-heading"
          >
            <h2 id="recently-watched-heading" className="text-xl font-semibold">
              Recently watched
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Up to five watched movies with stored watched dates. Added dates
              are never substituted.
            </p>
            <div className="mt-5">
              <StatisticsMovieList
                movies={result.recentlyWatched}
                emptyMessage="Add watched dates to see recent viewing activity."
              />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
