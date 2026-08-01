import {
  formatStatisticsCount,
  formatStatisticsRating,
  formatStatisticsRuntime,
} from "@/lib/statistics/formatting";
import type { StatisticsResult } from "@/lib/statistics/types";

type SummaryCard = {
  label: string;
  value: string;
  description: string;
  testId: string;
};

export function StatisticsSummary({ result }: { result: StatisticsResult }) {
  const { summary, period } = result;
  const cards: SummaryCard[] = [
    {
      label: "Total movies",
      value: formatStatisticsCount(summary.totalMovies),
      description: "All movies saved in your private library.",
      testId: "stat-total-movies",
    },
    {
      label: "Watched",
      value: formatStatisticsCount(summary.watchedMovies),
      description: 'Movies whose current status is “Watched.”',
      testId: "stat-watched-movies",
    },
    {
      label: "Unwatched",
      value: formatStatisticsCount(summary.unwatchedMovies),
      description: "Every current status other than Watched.",
      testId: "stat-unwatched-movies",
    },
    {
      label: "Watch Next",
      value: formatStatisticsCount(summary.watchNextMovies),
      description: 'Movies whose current status is “Watch Next.”',
      testId: "stat-watch-next-movies",
    },
    {
      label: "Favourites",
      value: formatStatisticsCount(summary.favouriteMovies),
      description: "Movies you have marked as favourites.",
      testId: "stat-favourite-movies",
    },
    {
      label: "Scheduled",
      value: formatStatisticsCount(summary.scheduledMovies),
      description: "Scheduled-status movies with a valid stored viewing time.",
      testId: "stat-scheduled-movies",
    },
    {
      label: "Average personal rating",
      value: formatStatisticsRating(summary.averagePersonalRating),
      description:
        summary.averagePersonalRating === null
          ? "No valid personal ratings are available."
          : `Across ${formatStatisticsCount(summary.ratedMovies)} rated ${summary.ratedMovies === 1 ? "movie" : "movies"}; unrated movies are excluded.`,
      testId: "stat-average-rating",
    },
    {
      label: "Watched runtime",
      value: formatStatisticsRuntime(summary.totalWatchedRuntimeMinutes),
      description:
        summary.totalWatchedRuntimeMinutes === null
          ? "Runtime is unavailable because no watched movie has valid runtime metadata."
          : `Known positive runtimes from ${formatStatisticsCount(summary.watchedRuntimeMovies)} watched ${summary.watchedRuntimeMovies === 1 ? "movie" : "movies"}.`,
      testId: "stat-watched-runtime",
    },
    {
      label: `Watched in ${period.currentMonthLabel}`,
      value: formatStatisticsCount(summary.watchedThisMonth),
      description: "Watched movies with a stored watched date in this month.",
      testId: "stat-watched-this-month",
    },
    {
      label: `Watched in ${period.currentYear}`,
      value: formatStatisticsCount(summary.watchedThisYear),
      description: "Watched movies with a stored watched date in this year.",
      testId: "stat-watched-this-year",
    },
  ];

  return (
    <section aria-labelledby="statistics-summary-heading">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="statistics-summary-heading" className="text-xl font-semibold">
            Library summary
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Counts use each movie&apos;s current personal-library state.
          </p>
        </div>
      </div>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => (
          <div
            key={card.testId}
            className="min-w-0 rounded-xl border bg-card p-5 shadow-sm"
          >
            <dt className="text-sm font-medium text-muted-foreground">
              {card.label}
            </dt>
            <dd
              className="mt-2 break-words text-2xl font-bold tracking-tight"
              data-testid={card.testId}
            >
              {card.value}
            </dd>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {card.description}
            </p>
          </div>
        ))}
      </dl>
    </section>
  );
}
