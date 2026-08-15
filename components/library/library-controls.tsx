import Link from "next/link";
import {
  Filter,
  Grid2X2,
  List,
  Search,
  Star,
  X,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildClearLibraryFiltersUrl,
  buildLibraryUrl,
  countActiveLibraryFilters,
  LIBRARY_FAVOURITE_FILTERS,
  LIBRARY_SORTS,
  LIBRARY_SORT_LABELS,
  LIBRARY_WATCHED_FILTERS,
  libraryStateToSearchParams,
  MAX_LIBRARY_SEARCH_LENGTH,
  MIN_LIBRARY_RELEASE_YEAR,
  type LibraryFacets,
  type LibraryPagination,
  type LibraryQueryState,
} from "@/lib/library/query";
import {
  LIBRARY_MOVIE_STATUSES,
  LIBRARY_MOVIE_STATUS_LABELS,
} from "@/lib/movies/types";
import { MOVIES_PER_PAGE_OPTIONS } from "@/lib/settings/types";
import { cn } from "@/lib/utils";

const fieldClassName =
  "flex min-h-11 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function HiddenLibraryParams({
  state,
  omit,
}: {
  state: LibraryQueryState;
  omit: string[];
}) {
  const params = libraryStateToSearchParams(state);
  params.delete("page");
  for (const name of omit) params.delete(name);

  return [...params.entries()].map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));
}

function watchedLabel(value: (typeof LIBRARY_WATCHED_FILTERS)[number]) {
  if (value === "watched") return "Watched";
  if (value === "unwatched") return "Unwatched";
  return "All watched states";
}

function favouriteLabel(value: (typeof LIBRARY_FAVOURITE_FILTERS)[number]) {
  if (value === "favourites") return "Favourites";
  if (value === "not-favourites") return "Not favourites";
  return "All favourite states";
}

type FilterChip = {
  key: string;
  label: string;
  url: string;
};

function getFilterChips(state: LibraryQueryState): FilterChip[] {
  const chips: FilterChip[] = [];

  if (state.status !== "all") {
    chips.push({
      key: "status",
      label: `Status: ${LIBRARY_MOVIE_STATUS_LABELS[state.status]}`,
      url: buildLibraryUrl(state, { status: "all" }, { resetPage: true }),
    });
  }
  if (state.watched !== "all") {
    chips.push({
      key: "watched",
      label: watchedLabel(state.watched),
      url: buildLibraryUrl(state, { watched: "all" }, { resetPage: true }),
    });
  }
  if (state.favourite !== "all") {
    chips.push({
      key: "favourite",
      label: favouriteLabel(state.favourite),
      url: buildLibraryUrl(
        state,
        { favourite: "all" },
        { resetPage: true },
      ),
    });
  }
  if (state.genre) {
    chips.push({
      key: "genre",
      label: `Genre: ${state.genre}`,
      url: buildLibraryUrl(state, { genre: null }, { resetPage: true }),
    });
  }
  if (state.director) {
    chips.push({
      key: "director",
      label: `Director: ${state.director}`,
      url: buildLibraryUrl(state, { director: null }, { resetPage: true }),
    });
  }
  if (state.year !== null) {
    chips.push({
      key: "year",
      label: `Year: ${state.year}`,
      url: buildLibraryUrl(state, { year: null }, { resetPage: true }),
    });
  } else if (state.yearFrom !== null || state.yearTo !== null) {
    chips.push({
      key: "year-range",
      label: `Years: ${state.yearFrom ?? "any"}–${state.yearTo ?? "any"}`,
      url: buildLibraryUrl(
        state,
        { yearFrom: null, yearTo: null },
        { resetPage: true },
      ),
    });
  }
  if (state.ratingMin !== null || state.ratingMax !== null) {
    chips.push({
      key: "rating",
      label: `Personal rating: ${state.ratingMin ?? "any"}–${state.ratingMax ?? "any"}`,
      url: buildLibraryUrl(
        state,
        { ratingMin: null, ratingMax: null },
        { resetPage: true },
      ),
    });
  }

  return chips;
}

export function LibraryControls({
  state,
  facets,
  pagination,
  warnings,
}: {
  state: LibraryQueryState;
  facets: LibraryFacets;
  pagination: LibraryPagination;
  warnings: string[];
}) {
  const activeFilterCount = countActiveLibraryFilters(state);
  const chips = getFilterChips(state);
  const clearSearchUrl = buildLibraryUrl(
    state,
    { q: "" },
    { resetPage: true },
  );

  return (
    <div className="space-y-4">
      <form
        role="search"
        method="get"
        action="/library"
        className="grid min-w-0 grid-cols-2 gap-2 min-[480px]:grid-cols-[minmax(0,1fr)_auto_auto]"
      >
        <HiddenLibraryParams state={state} omit={["q"]} />
        <Label htmlFor="library-search" className="sr-only">
          Search your library
        </Label>
        <Input
          id="library-search"
          name="q"
          type="search"
          maxLength={MAX_LIBRARY_SEARCH_LENGTH}
          defaultValue={state.q}
          placeholder="Search titles, directors, cast, or genres"
          className="col-span-2 min-[480px]:col-span-1"
        />
        <Button type="submit" className="min-h-11">
          <Search className="size-4" aria-hidden="true" />
          <span>Search</span>
        </Button>
        {state.q ? (
          <Button asChild type="button" variant="outline" className="min-h-11">
            <Link href={clearSearchUrl} aria-label="Clear library search">
              <X className="size-4" aria-hidden="true" />
              <span>Clear</span>
            </Link>
          </Button>
        ) : null}
      </form>

      {warnings.length > 0 ? (
        <div
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
          role="status"
        >
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}

      <div className="min-w-0 space-y-4 rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {pagination.totalItems === 0
            ? "0 matching movies"
            : `Showing ${pagination.firstItem}–${pagination.lastItem} of ${pagination.totalItems} movies`}
        </p>

        <form
          method="get"
          action="/library"
          className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-[minmax(14rem,1fr)_10rem_auto] lg:items-end"
        >
          <HiddenLibraryParams state={state} omit={["sort", "perPage"]} />
          <label className="col-span-2 space-y-1 text-sm font-medium lg:col-span-1">
            Sort
            <select name="sort" defaultValue={state.sort} className={fieldClassName}>
              {LIBRARY_SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {LIBRARY_SORT_LABELS[sort]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">
            Per page
            <select
              name="perPage"
              defaultValue={String(state.perPage)}
              className={fieldClassName}
            >
              {MOVIES_PER_PAGE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="outline" className="col-span-2 lg:col-span-1">
            Apply
          </Button>
        </form>

        <div className="grid grid-cols-2 gap-2 min-[520px]:flex min-[520px]:flex-wrap" aria-label="Library view">
          <Link
            href={buildLibraryUrl(
              state,
              { view: "grid" },
              { resetPage: true },
            )}
            aria-current={state.view === "grid" ? "page" : undefined}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "w-full min-[520px]:w-auto",
              state.view === "grid" && "bg-accent",
            )}
          >
            <Grid2X2 className="size-4" aria-hidden="true" />
            Grid
          </Link>
          <Link
            href={buildLibraryUrl(
              state,
              { view: "list" },
              { resetPage: true },
            )}
            aria-current={state.view === "list" ? "page" : undefined}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "w-full min-[520px]:w-auto",
              state.view === "list" && "bg-accent",
            )}
          >
            <List className="size-4" aria-hidden="true" />
            List
          </Link>
          <Link
            href={buildLibraryUrl(
              state,
              { favourite: "favourites" },
              { resetPage: true },
            )}
            className={`${buttonVariants({ variant: "outline", size: "sm" })} col-span-2 w-full min-[520px]:w-auto`}
          >
            <Star className="size-4" aria-hidden="true" />
            Favourites ({facets.counts.favourites})
          </Link>
        </div>
      </div>

      <details className="rounded-xl border bg-card">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="inline-flex items-center gap-2">
            <Filter className="size-4" aria-hidden="true" />
            Filters
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
            {activeFilterCount} active
          </span>
        </summary>
        <form
          method="get"
          action="/library"
          className="grid gap-4 border-t p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <HiddenLibraryParams
            state={state}
            omit={[
              "status",
              "watched",
              "favourite",
              "genre",
              "director",
              "year",
              "yearFrom",
              "yearTo",
              "ratingMin",
              "ratingMax",
            ]}
          />

          <label className="space-y-1 text-sm font-medium">
            Status
            <select name="status" defaultValue={state.status} className={fieldClassName}>
              <option value="all">All statuses</option>
              {LIBRARY_MOVIE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {LIBRARY_MOVIE_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm font-medium">
            Watched state
            <select name="watched" defaultValue={state.watched} className={fieldClassName}>
              {LIBRARY_WATCHED_FILTERS.map((value) => (
                <option key={value} value={value}>
                  {watchedLabel(value)}
                  {value === "watched"
                    ? ` (${facets.counts.watched})`
                    : value === "unwatched"
                      ? ` (${facets.counts.unwatched})`
                      : ` (${facets.counts.all})`}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm font-medium">
            Favourite
            <select
              name="favourite"
              defaultValue={state.favourite}
              className={fieldClassName}
            >
              {LIBRARY_FAVOURITE_FILTERS.map((value) => (
                <option key={value} value={value}>
                  {favouriteLabel(value)}
                  {value === "favourites"
                    ? ` (${facets.counts.favourites})`
                    : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm font-medium">
            Genre
            <select name="genre" defaultValue={state.genre ?? ""} className={fieldClassName}>
              <option value="">All genres</option>
              {facets.genres.map((genre) => (
                <option key={genre} value={genre}>
                  {genre}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm font-medium">
            Director
            <Input
              name="director"
              list="library-directors"
              maxLength={150}
              defaultValue={state.director ?? ""}
              placeholder="Any director"
            />
            <datalist id="library-directors">
              {facets.directors.map((director) => (
                <option key={director} value={director} />
              ))}
            </datalist>
          </label>

          <label className="space-y-1 text-sm font-medium">
            Exact release year
            <Input
              name="year"
              type="number"
              min={MIN_LIBRARY_RELEASE_YEAR}
              max={new Date().getUTCFullYear() + 5}
              step="1"
              list="library-release-years"
              defaultValue={state.year ?? ""}
              placeholder="Any year"
            />
            <datalist id="library-release-years">
              {facets.years.map((year) => (
                <option key={year} value={year} />
              ))}
            </datalist>
          </label>

          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="mb-1 text-sm font-medium">
              Release-year range
            </legend>
            <Label className="sr-only" htmlFor="library-year-from">
              Release year from
            </Label>
            <Input
              id="library-year-from"
              name="yearFrom"
              type="number"
              min={MIN_LIBRARY_RELEASE_YEAR}
              max={new Date().getUTCFullYear() + 5}
              step="1"
              defaultValue={state.yearFrom ?? ""}
              placeholder="From"
            />
            <Label className="sr-only" htmlFor="library-year-to">
              Release year to
            </Label>
            <Input
              id="library-year-to"
              name="yearTo"
              type="number"
              min={MIN_LIBRARY_RELEASE_YEAR}
              max={new Date().getUTCFullYear() + 5}
              step="1"
              defaultValue={state.yearTo ?? ""}
              placeholder="To"
            />
            <p className="col-span-2 text-xs text-muted-foreground">
              Exact year takes precedence over this range.
            </p>
          </fieldset>

          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="mb-1 text-sm font-medium">
              Personal-rating range
            </legend>
            <Label className="sr-only" htmlFor="library-rating-min">
              Minimum personal rating
            </Label>
            <Input
              id="library-rating-min"
              name="ratingMin"
              type="number"
              min="0"
              max="10"
              step="0.1"
              defaultValue={state.ratingMin ?? ""}
              placeholder="Min"
            />
            <Label className="sr-only" htmlFor="library-rating-max">
              Maximum personal rating
            </Label>
            <Input
              id="library-rating-max"
              name="ratingMax"
              type="number"
              min="0"
              max="10"
              step="0.1"
              defaultValue={state.ratingMax ?? ""}
              placeholder="Max"
            />
          </fieldset>

          <div className="grid grid-cols-1 gap-2 sm:col-span-2 sm:grid-cols-2 lg:col-span-4 lg:flex lg:flex-wrap">
            <Button type="submit" className="w-full lg:w-auto">Apply filters</Button>
            <Button asChild type="button" variant="outline" className="w-full lg:w-auto">
              <Link href={buildClearLibraryFiltersUrl(state)}>
                Clear all filters
              </Link>
            </Button>
          </div>
        </form>
      </details>

      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-2" aria-label="Active library filters">
          {chips.map((chip) => (
            <Link
              key={chip.key}
              href={chip.url}
              aria-label={`Remove filter: ${chip.label}`}
              className="inline-flex min-h-11 items-center gap-1 rounded-full border bg-background px-3 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {chip.label}
              <X className="size-3.5" aria-hidden="true" />
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

