"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Dices, FilterX, RotateCcw } from "lucide-react";

import { pickMovieAction } from "@/app/(app)/actions/discovery";
import { PickerResult } from "@/components/discovery/picker-result";
import { Button, buttonVariants } from "@/components/ui/button";
import { ResponsiveActions } from "@/components/ui/responsive-layout";
import {
  initialPickerActionState,
} from "@/lib/discovery/action-state";
import { MOOD_RULES } from "@/lib/discovery/moods";
import {
  DEFAULT_PICKER_FILTERS,
  pickerFiltersToSearchParams,
} from "@/lib/discovery/picker";
import {
  MOOD_KEYS,
  type MoodKey,
  type PickerFilters,
  type PickerReleasePeriod,
  type PickerWatchedState,
} from "@/lib/discovery/types";

const RELEASE_PERIOD_OPTIONS: {
  value: PickerReleasePeriod;
  label: string;
}[] = [
  { value: "any", label: "Any period" },
  { value: "before_1980", label: "Before 1980" },
  { value: "1980s", label: "1980s" },
  { value: "1990s", label: "1990s" },
  { value: "2000s", label: "2000s" },
  { value: "2010s", label: "2010s" },
  { value: "2020s", label: "2020s" },
];

const WATCHED_OPTIONS: { value: PickerWatchedState; label: string }[] = [
  { value: "unwatched", label: "Unwatched" },
  { value: "watched", label: "Watched" },
  { value: "any", label: "Any" },
];

function replacePickerUrl(filters: PickerFilters) {
  const params = pickerFiltersToSearchParams(filters);
  const url = new URL(window.location.href);
  url.search = params.toString();
  window.history.replaceState(window.history.state, "", url);
}

export function MoviePicker({
  initialFilters,
  availableGenres,
  initialWarnings,
  libraryCount,
  libraryTruncated,
}: {
  initialFilters: PickerFilters;
  availableGenres: string[];
  initialWarnings: string[];
  libraryCount: number;
  libraryTruncated: boolean;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [showInitialWarnings, setShowInitialWarnings] = useState(
    initialWarnings.length > 0,
  );
  const [hiddenThroughRequest, setHiddenThroughRequest] = useState(0);
  const [state, action, isPending] = useActionState(
    pickMovieAction,
    initialPickerActionState,
  );
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const processedRequestRef = useRef(0);

  useEffect(() => {
    if (
      state.status !== "success" ||
      !state.result?.movie ||
      state.requestId === processedRequestRef.current
    ) {
      return;
    }

    processedRequestRef.current = state.requestId;
    const pickedId = state.result.movie.userMovieId;
    setExcludedIds((current) => {
      if (state.result?.exclusionCycleReset) {
        return [pickedId];
      }

      return [...current.filter((id) => id !== pickedId), pickedId].slice(-50);
    });
    requestAnimationFrame(() => resultHeadingRef.current?.focus());
  }, [state]);

  function updateFilters(next: Partial<PickerFilters>) {
    const updated = { ...filters, ...next };
    setShowInitialWarnings(false);
    setHiddenThroughRequest(state.requestId + (isPending ? 1 : 0));
    setFilters(updated);
    replacePickerUrl(updated);
  }

  function clearFilters() {
    setShowInitialWarnings(false);
    setHiddenThroughRequest(state.requestId + (isPending ? 1 : 0));
    setFilters(DEFAULT_PICKER_FILTERS);
    replacePickerUrl(DEFAULT_PICKER_FILTERS);
  }

  function handleSubmit() {
    replacePickerUrl(filters);
  }

  const selectedMood =
    filters.mood === "any" ? null : MOOD_RULES[filters.mood];
  const warnings = [
    ...(showInitialWarnings ? initialWarnings : []),
    ...(state.requestId > hiddenThroughRequest ? state.warnings : []),
  ];
  const effectiveTruncation = libraryTruncated || state.libraryTruncated;
  const showActionOutput = state.requestId > hiddenThroughRequest;
  const activeFilterCount = [
    filters.genre !== null,
    filters.maxRuntime !== null,
    filters.minPublicRating !== null,
    filters.mood !== "any",
    filters.releasePeriod !== "any",
    filters.watchedState !== "unwatched",
    filters.watchNextOnly,
    filters.favouriteOnly,
  ].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <form
        action={action}
        onSubmit={handleSubmit}
        aria-busy={isPending}
        className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6"
      >
        {excludedIds.map((id) => (
          <input
            key={id}
            type="hidden"
            name="excludedUserMovieIds"
            value={id}
          />
        ))}

        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <h2 className="text-xl font-semibold">Pick from your Library</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The default includes unwatched movies. Picking does not change them.
            </p>
          </div>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {libraryCount} {libraryCount === 1 ? "movie" : "movies"} in your
            library
          </p>
        </div>

        <details
          open={activeFilterCount > 0 || warnings.length > 0}
          className="mt-6 rounded-xl border bg-muted/20"
        >
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span>Refine the choice (optional)</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {activeFilterCount} active
            </span>
          </summary>
          <div className="grid gap-5 border-t p-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="grid gap-2 text-sm font-medium">
            Genre
            <select
              name="genre"
              value={filters.genre ?? ""}
              onChange={(event) =>
                updateFilters({ genre: event.target.value || null })
              }
              className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Any genre</option>
              {availableGenres.map((genre) => (
                <option key={genre} value={genre}>
                  {genre}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-medium">
            Maximum runtime
            <select
              name="maxRuntime"
              value={filters.maxRuntime ?? ""}
              onChange={(event) =>
                updateFilters({
                  maxRuntime: event.target.value
                    ? (Number(event.target.value) as PickerFilters["maxRuntime"])
                    : null,
                })
              }
              className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Any runtime</option>
              <option value="90">Up to 90 minutes</option>
              <option value="120">Up to 120 minutes</option>
              <option value="150">Up to 150 minutes</option>
              <option value="180">Up to 180 minutes</option>
            </select>
          </label>

          <label className="grid gap-2 text-sm font-medium">
            Minimum public rating
            <select
              name="minRating"
              value={filters.minPublicRating ?? ""}
              onChange={(event) =>
                updateFilters({
                  minPublicRating: event.target.value
                    ? Number(event.target.value)
                    : null,
                })
              }
              className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Any public rating</option>
              {[5, 6, 7, 8, 9].map((rating) => (
                <option key={rating} value={rating}>
                  {rating}+
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-medium">
            Mood
            <select
              name="mood"
              value={filters.mood}
              aria-describedby="mood-explanation"
              onChange={(event) =>
                updateFilters({
                  mood:
                    event.target.value === "any"
                      ? "any"
                      : (event.target.value as MoodKey),
                })
              }
              className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="any">Any mood</option>
              {MOOD_KEYS.map((mood) => (
                <option key={mood} value={mood}>
                  {MOOD_RULES[mood].label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-medium">
            Release period
            <select
              name="period"
              value={filters.releasePeriod}
              onChange={(event) =>
                updateFilters({
                  releasePeriod: event.target.value as PickerReleasePeriod,
                })
              }
              className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {RELEASE_PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-medium">
            Watched state
            <select
              name={filters.watchNextOnly ? undefined : "watched"}
              value={filters.watchedState}
              disabled={filters.watchNextOnly}
              onChange={(event) =>
                updateFilters({
                  watchedState: event.target.value as PickerWatchedState,
                })
              }
              className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {WATCHED_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {filters.watchNextOnly ? (
              <input
                type="hidden"
                name="watched"
                value={filters.watchedState}
              />
            ) : null}
          </label>
          </div>

          <div
          id="mood-explanation"
          className="mx-4 mt-1 rounded-lg border bg-background p-3 text-sm text-muted-foreground"
        >
          {selectedMood ? (
            <>
              <p>{selectedMood.explanation}</p>
              {selectedMood.caution ? (
                <p className="mt-1">{selectedMood.caution}</p>
              ) : null}
            </>
          ) : (
            <p>
              Moods are transparent genre and runtime rules, not psychological
              analysis or AI.
            </p>
          )}
          </div>

          <fieldset className="m-4 grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">Additional picker filters</legend>
          <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm font-medium focus-within:ring-2 focus-within:ring-ring">
            <input
              type="checkbox"
              name="watchNext"
              value="1"
              checked={filters.watchNextOnly}
              onChange={(event) =>
                updateFilters({ watchNextOnly: event.target.checked })
              }
              className="size-4 accent-foreground"
            />
            Pick only from Watch Next
          </label>
          <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm font-medium focus-within:ring-2 focus-within:ring-ring">
            <input
              type="checkbox"
              name="favourite"
              value="1"
              checked={filters.favouriteOnly}
              onChange={(event) =>
                updateFilters({ favouriteOnly: event.target.checked })
              }
              className="size-4 accent-foreground"
            />
            Favourite only
          </label>
          </fieldset>

        {filters.watchNextOnly ? (
          <p className="mx-4 mb-4 text-sm text-muted-foreground" role="status">
            Watch Next only requires status “Watch Next” and overrides the
            watched-state selection. Picking does not change queue order.
          </p>
          ) : null}
        </details>

        {warnings.length > 0 ? (
          <ul
            className="mt-4 space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
            role="status"
          >
            {[...new Set(warnings)].map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}

        {effectiveTruncation ? (
          <p className="mt-4 text-sm text-muted-foreground" role="status">
            For predictable performance, this picker uses your 1,000 most
            recently added library movies.
          </p>
        ) : null}

        <ResponsiveActions className="mt-6">
          <Button
            type="submit"
            disabled={isPending || libraryCount === 0}
            className="min-h-11"
          >
            <Dices aria-hidden="true" />
            {isPending
              ? "Picking a movie..."
              : showActionOutput && state.status === "success"
                ? "Pick Another"
                : "Pick a Movie"}
          </Button>
          {activeFilterCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={clearFilters}
            >
              <FilterX aria-hidden="true" />
              Clear filters
            </Button>
          ) : null}
        </ResponsiveActions>
      </form>

      <div aria-live="polite" aria-atomic="true">
        {showActionOutput && state.message ? (
          <p
            className={
              state.status === "error"
                ? "rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}
        {showActionOutput && state.result?.exclusionCycleReset ? (
          <p className="mt-2 text-sm text-muted-foreground" role="status">
            Every matching movie was picked this session, so the repeat cycle
            started again.
          </p>
        ) : null}
      </div>

      {libraryCount === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center">
          <h2 className="text-xl font-semibold">Your library is empty</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Add or import movies before asking WatchFlow to choose one.
          </p>
          <ResponsiveActions className="mx-auto mt-5 max-w-md justify-center">
            <Link href="/search" className={buttonVariants()}>
              Search Movies
            </Link>
            <Link
              href="/import"
              className={buttonVariants({ variant: "outline" })}
            >
              Import Movies
            </Link>
          </ResponsiveActions>
        </div>
      ) : showActionOutput && state.status === "empty" ? (
        <div className="rounded-xl border border-dashed bg-card p-6 text-center">
          <RotateCcw
            className="mx-auto size-9 text-muted-foreground"
            aria-hidden="true"
          />
          <h2 className="mt-3 text-xl font-semibold">No matches found</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            No movies in your library match these filters. Clear the mood,
            remove the runtime limit, lower the public rating, or include
            watched movies.
          </p>
          <ResponsiveActions className="mx-auto mt-5 max-w-xl justify-center">
            <Button type="button" variant="outline" onClick={clearFilters}>
              Clear all filters
            </Button>
            <Link
              href="/watch-next"
              className={buttonVariants({ variant: "outline" })}
            >
              View Watch Next
            </Link>
            <Link href="/library" className={buttonVariants()}>
              Open Library
            </Link>
          </ResponsiveActions>
        </div>
      ) : showActionOutput && state.result?.movie ? (
        <PickerResult result={state.result} headingRef={resultHeadingRef} />
      ) : null}
    </div>
  );
}
