import Link from "next/link";
import { Suspense } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";

import {
  DiscoveryLoadError,
  getSafeDiscoveryLoadError,
} from "@/components/discovery/discovery-load-error";
import { RecommendationSection } from "@/components/discovery/recommendation-section";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DiscoveryAuthenticationError } from "@/lib/discovery/errors";
import {
  buildRuleBasedRecommendations,
  MAX_RECOMMENDATIONS,
  RECOMMENDATION_SCORE_WEIGHTS,
} from "@/lib/discovery/recommendations";
import { getDiscoveryDataset } from "@/lib/discovery/supabase-discovery";

type RecommendationsPageProps = {
  searchParams: Promise<{
    refresh?: string | string[];
  }>;
};

const MAX_REFRESH_SEED = 1_000_000;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseRefreshSeed(value: string | string[] | undefined) {
  const candidate = first(value);
  if (candidate === undefined) {
    return { seed: 0, warning: null };
  }

  if (/^\d+$/.test(candidate)) {
    const parsed = Number(candidate);
    if (
      Number.isSafeInteger(parsed) &&
      parsed >= 0 &&
      parsed <= MAX_REFRESH_SEED
    ) {
      return { seed: parsed, warning: null };
    }
  }

  return {
    seed: 0,
    warning: "The refresh option was invalid, so the default order is shown.",
  };
}

function RecommendationsLoading() {
  return (
    <div className="space-y-8" aria-busy="true">
      <span className="sr-only">
        Loading private rule-based recommendations
      </span>
      <div className="h-36 animate-pulse rounded-xl border bg-card" />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-96 animate-pulse rounded-xl border bg-card"
          />
        ))}
      </div>
    </div>
  );
}

function RecommendationEmptyState({
  coldStart,
  notice,
}: {
  coldStart:
    | "empty_library"
    | "no_eligible_candidates"
    | "no_ratings"
    | "no_suitable_recommendations"
    | null;
  notice: string | null;
}) {
  return (
    <div className="rounded-xl border border-dashed bg-card p-8 text-center sm:p-10">
      <Sparkles
        className="mx-auto size-10 text-muted-foreground"
        aria-hidden="true"
      />
      <h2 className="mt-4 text-xl font-semibold">
        {coldStart === "empty_library"
          ? "Add movies to get recommendations"
          : coldStart === "no_eligible_candidates"
            ? "No unwatched candidates yet"
            : "No suitable recommendations yet"}
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
        {notice ??
          "Rate a few watched movies and keep unwatched movies in your library to improve these rule-based suggestions."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/search" className={buttonVariants()}>
          Search Movies
        </Link>
        <Link
          href="/library"
          className={buttonVariants({ variant: "outline" })}
        >
          Open Library
        </Link>
        <Link
          href="/watch-next"
          className={buttonVariants({ variant: "outline" })}
        >
          Open Watch Next
        </Link>
        <Link
          href="/import"
          className={buttonVariants({ variant: "outline" })}
        >
          Import Movies
        </Link>
      </div>
    </div>
  );
}

async function RecommendationsContent({
  searchParams,
}: RecommendationsPageProps) {
  let content:
    | {
        status: "ready";
        dataset: Awaited<ReturnType<typeof getDiscoveryDataset>>;
        refresh: ReturnType<typeof parseRefreshSeed>;
        result: ReturnType<typeof buildRuleBasedRecommendations>;
        nextRefresh: number;
      }
    | { status: "error"; message: string };

  try {
    const [dataset, params] = await Promise.all([
      getDiscoveryDataset(),
      searchParams,
    ]);
    const refresh = parseRefreshSeed(params.refresh);
    const result = buildRuleBasedRecommendations(dataset.movies, {
      refreshSeed: refresh.seed,
    });
    const nextRefresh =
      refresh.seed >= MAX_REFRESH_SEED ? 1 : refresh.seed + 1;

    content = { status: "ready", dataset, refresh, result, nextRefresh };
  } catch (error) {
    if (error instanceof DiscoveryAuthenticationError) {
      redirect("/auth/login");
    }

    content = { status: "error", message: getSafeDiscoveryLoadError(error) };
  }

  if (content.status === "error") {
    return (
      <DiscoveryLoadError
        message={content.message}
        retryHref="/recommendations"
      />
    );
  }

  const { dataset, refresh, result, nextRefresh } = content;

  return (
    <div className="space-y-8">
      <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <Badge variant="outline">Rule-based recommendations</Badge>
            <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
              Suggestions use only stored metadata and activity from your
              private library. They are transparent rules—not AI, predictions,
              or certainty.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {result.recommendationCount} recommendations from{" "}
              {result.candidateCount} eligible unwatched candidates
            </p>
          </div>
          {result.recommendationCount > 1 ? (
            <Link
              href={`/recommendations?refresh=${nextRefresh}`}
              className={buttonVariants({ variant: "outline" })}
              aria-label="Refresh recommendation presentation"
            >
              <RefreshCw aria-hidden="true" />
              Refresh suggestions
            </Link>
          ) : null}
        </div>

        <details className="mt-5 rounded-lg border bg-muted/30 p-4">
          <summary className="cursor-pointer font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            How recommendations work
          </summary>
          <div className="mt-3 space-y-3 text-sm text-muted-foreground">
            <p>
              Seeds prefer personal ratings of 8/10 or higher, then watched
              favourites, watched ratings of 7+, rated genres, watched genres,
              favourite genres, and stored public ratings.
            </p>
            <p>
              Candidate statuses are Want to Watch, Watch Next, Scheduled, and
              On Hold. Watched, Dropped, and Currently Watching movies are
              excluded.
            </p>
            <p>
              Scoring: +{RECOMMENDATION_SCORE_WEIGHTS.sharedGenre} per shared
              genre (up to {RECOMMENDATION_SCORE_WEIGHTS.sharedGenreCap}), +
              {RECOMMENDATION_SCORE_WEIGHTS.sameDirector} same director, +
              {RECOMMENDATION_SCORE_WEIGHTS.similarReleasePeriod} within 10
              release years, +{RECOMMENDATION_SCORE_WEIGHTS.similarRuntime}{" "}
              within 30 runtime minutes, +
              {RECOMMENDATION_SCORE_WEIGHTS.favourite} favourite, +
              {RECOMMENDATION_SCORE_WEIGHTS.watchNext} Watch Next, and up to +
              {RECOMMENDATION_SCORE_WEIGHTS.publicRatingEight} for public
              rating. A 9–10 seed adds up to +
              {RECOMMENDATION_SCORE_WEIGHTS.seedRatingTen}.
            </p>
            <p>
              Results are deduplicated, limited to {MAX_RECOMMENDATIONS}, and
              diversified across genres and directors. Refresh only shuffles
              within a similar-score window.
            </p>
          </div>
        </details>
      </section>

      {refresh.warning ? (
        <p
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
          role="status"
        >
          {refresh.warning}
        </p>
      ) : null}

      {dataset.truncated ? (
        <p className="text-sm text-muted-foreground" role="status">
          For predictable performance, these recommendations use your 1,000
          most recently added library movies.
        </p>
      ) : null}

      {result.notice ? (
        <p
          className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground"
          role="status"
        >
          {result.notice}
        </p>
      ) : null}

      {result.sections.length === 0 ? (
        <RecommendationEmptyState
          coldStart={result.coldStart}
          notice={result.notice}
        />
      ) : (
        result.sections.map((section) => (
          <RecommendationSection key={section.id} section={section} />
        ))
      )}
    </div>
  );
}

export default function RecommendationsPage(props: RecommendationsPageProps) {
  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8">
        <p className="text-sm font-medium text-muted-foreground">
          Private library discovery
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          Recommendations
        </h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Rediscover unwatched movies already in your WatchFlow library through
          explicit ratings, genres, directors, runtime, release period, and
          queue rules.
        </p>
      </header>

      <Suspense fallback={<RecommendationsLoading />}>
        <RecommendationsContent {...props} />
      </Suspense>
    </div>
  );
}
