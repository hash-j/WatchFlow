import {
  formatStatisticsCount,
  formatStatisticsPercentage,
} from "@/lib/statistics/formatting";
import type {
  StatisticsGenreEntry,
  StatisticsRatingEntry,
  StatisticsStatusBreakdown,
  StatisticsTimelineEntry,
} from "@/lib/statistics/types";

type DistributionEntry = {
  key: string;
  label: string;
  count: number;
  percentage: number;
};

export function DistributionList({
  entries,
  accessibleLabel,
}: {
  entries: readonly DistributionEntry[];
  accessibleLabel: string;
}) {
  return (
    <div>
      <p className="sr-only">
        {accessibleLabel}: {entries
          .map((entry) => `${entry.label}, ${entry.count}`)
          .join("; ")}.
      </p>
      <ul className="space-y-4">
        {entries.map((entry) => (
          <li key={entry.key}>
            <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 break-words font-medium">
                {entry.label}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {formatStatisticsCount(entry.count)} ·{" "}
                {formatStatisticsPercentage(entry.percentage)}
              </span>
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
              aria-hidden="true"
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${entry.percentage}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StatusDistribution({
  entries,
}: {
  entries: readonly StatisticsStatusBreakdown[];
}) {
  return (
    <DistributionList
      entries={entries.map((entry) => ({
        key: entry.status,
        label: entry.label,
        count: entry.count,
        percentage: entry.percentage,
      }))}
      accessibleLabel="Status distribution"
    />
  );
}

export function GenreDistribution({
  entries,
}: {
  entries: readonly StatisticsGenreEntry[];
}) {
  return (
    <DistributionList
      entries={entries.map((entry) => ({
        key: entry.genre.toLocaleLowerCase("en-US"),
        label: entry.genre,
        count: entry.count,
        percentage: entry.percentage,
      }))}
      accessibleLabel="Most common genres in your library"
    />
  );
}

export function WatchedTimeline({
  entries,
}: {
  entries: readonly StatisticsTimelineEntry[];
}) {
  const maximum = Math.max(...entries.map((entry) => entry.count), 1);

  return (
    <div>
      <p className="sr-only">
        Movies watched by month: {entries
          .map((entry) => `${entry.label}, ${entry.count}`)
          .join("; ")}.
      </p>
      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {entries.map((entry) => (
          <li key={entry.monthKey} className="min-w-0 rounded-lg bg-muted/50 p-3">
            <p className="break-words text-xs leading-5 text-muted-foreground">
              {entry.label}
            </p>
            <p className="mt-1 text-lg font-semibold">
              {formatStatisticsCount(entry.count)}
            </p>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-background"
              aria-hidden="true"
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{
                  width:
                    entry.count === 0
                      ? "0%"
                      : `${Math.max((entry.count / maximum) * 100, 6)}%`,
                }}
              />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function RatingDistribution({
  entries,
}: {
  entries: readonly StatisticsRatingEntry[];
}) {
  return (
    <div>
      <p className="sr-only">
        Personal rating distribution: {entries
          .map((entry) => `${entry.label}, ${entry.count}`)
          .join("; ")}.
      </p>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {entries.map((entry) => (
          <li key={entry.key} className="rounded-lg border bg-muted/30 p-4">
            <p className="text-sm font-medium">{entry.label}</p>
            <p className="mt-2 text-2xl font-semibold">
              {formatStatisticsCount(entry.count)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatStatisticsPercentage(entry.percentage)} of rated movies
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
