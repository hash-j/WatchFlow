import Link from "next/link";
import { Suspense } from "react";
import { Grid2X2, Library, List } from "lucide-react";

import { LibraryMovieCard } from "@/components/movies/library-movie-card";
import { LibraryMovieListItem } from "@/components/movies/library-movie-list-item";
import { Button } from "@/components/ui/button";
import {
  filterLibraryMovies,
  getLibraryFilterCounts,
  getLibraryFilterEmptyMessage,
  normalizeLibraryFilter,
  type LibraryFilter,
} from "@/lib/library/filters";
import { listLibraryMovies } from "@/lib/library/service";
import { createSupabaseLibraryDependencies } from "@/lib/library/supabase-library";
import {
  normalizeLibraryPage,
  normalizeLibraryView,
  normalizeMoviesPerPage,
} from "@/lib/library/view";
import { getCurrentUserPreferences } from "@/lib/settings/supabase-settings";
import { DEFAULT_USER_PREFERENCES, type LibraryView } from "@/lib/settings/types";
import { cn } from "@/lib/utils";

type LibraryPageProps = {
  searchParams: Promise<{
    filter?: string | string[];
    view?: string | string[];
    page?: string | string[];
    perPage?: string | string[];
  }>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function libraryHref(input: {
  filter: LibraryFilter;
  view: LibraryView;
  page?: number;
  perPage: number;
}) {
  const params = new URLSearchParams();
  if (input.filter !== "all") params.set("filter", input.filter);
  params.set("view", input.view);
  params.set("perPage", String(input.perPage));
  if ((input.page ?? 1) > 1) params.set("page", String(input.page));
  return `/library?${params.toString()}`;
}

function LibraryLoading() {
  return (
    <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true">
      <span className="sr-only">Loading your movie library</span>
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="aspect-[2/3] animate-pulse rounded-xl border bg-card" />
      ))}
    </div>
  );
}

async function LibraryContent({
  filter,
  view,
  page,
  perPage,
}: {
  filter: LibraryFilter;
  view: LibraryView;
  page: number;
  perPage: number;
}) {
  const movies = await listLibraryMovies(createSupabaseLibraryDependencies());
  const counts = getLibraryFilterCounts(movies);
  const filteredMovies = filterLibraryMovies(movies, filter);
  const totalPages = Math.max(1, Math.ceil(filteredMovies.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const visibleMovies = filteredMovies.slice(
    (currentPage - 1) * perPage,
    currentPage * perPage,
  );

  if (movies.length === 0) {
    return (
      <div className="mt-8 rounded-xl border bg-card p-10 text-center shadow-sm">
        <Library className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-4 text-lg font-semibold">Your library is empty</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Search for a movie and add it to start building your private WatchFlow
          collection.
        </p>
        <Button asChild className="mt-6">
          <Link href="/search">Search movies</Link>
        </Button>
      </div>
    );
  }

  const filters: Array<{ value: LibraryFilter; label: string }> = [
    { value: "all", label: "All" },
    { value: "unwatched", label: "Unwatched" },
    { value: "watched", label: "Watched" },
  ];

  return (
    <div className="mt-8">
      <div className="flex flex-col justify-between gap-4 rounded-xl border bg-card p-4 shadow-sm lg:flex-row lg:items-center">
        <div>
          <p className="text-sm font-semibold">Library summary</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {counts.watched} watched · {counts.unwatched} unwatched
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <nav aria-label="Filter movie library" className="flex flex-wrap gap-2">
            {filters.map((item) => (
              <Link
                key={item.value}
                href={libraryHref({
                  filter: item.value,
                  view,
                  perPage,
                })}
                aria-current={filter === item.value ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  filter === item.value
                    ? "border-foreground bg-foreground text-background"
                    : "bg-background hover:bg-accent",
                )}
              >
                {item.label}
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {counts[item.value]}
                </span>
              </Link>
            ))}
          </nav>
          <div className="flex rounded-md border p-1" aria-label="Library view">
            {([
              ["grid", "Grid view", Grid2X2],
              ["list", "List view", List],
            ] as const).map(([value, label, Icon]) => (
              <Link
                key={value}
                href={libraryHref({ filter, view: value, perPage })}
                aria-label={label}
                aria-current={view === value ? "page" : undefined}
                className={cn(
                  "grid size-9 place-items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  view === value ? "bg-foreground text-background" : "hover:bg-accent",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </div>
      </div>

      {visibleMovies.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed p-10 text-center">
          <h2 className="font-semibold">{getLibraryFilterEmptyMessage(filter)}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Change the filter or update a movie status to see it here.
          </p>
        </div>
      ) : view === "grid" ? (
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleMovies.map((item) => (
            <LibraryMovieCard key={item.libraryId} item={item} />
          ))}
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {visibleMovies.map((item) => (
            <LibraryMovieListItem key={item.libraryId} item={item} />
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <nav
          aria-label="Library pagination"
          className="mt-6 flex items-center justify-between gap-4 rounded-xl border bg-card p-3"
        >
          {currentPage === 1 ? (
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link
                href={libraryHref({
                  filter,
                  view,
                  page: currentPage - 1,
                  perPage,
                })}
              >
                Previous
              </Link>
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          {currentPage === totalPages ? (
            <Button variant="outline" size="sm" disabled>
              Next
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link
                href={libraryHref({
                  filter,
                  view,
                  page: currentPage + 1,
                  perPage,
                })}
              >
                Next
              </Link>
            </Button>
          )}
        </nav>
      ) : null}
    </div>
  );
}

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  const [params, preferences] = await Promise.all([
    searchParams,
    getCurrentUserPreferences(),
  ]);
  const saved = preferences ?? DEFAULT_USER_PREFERENCES;
  const filter = normalizeLibraryFilter(first(params.filter));
  const view = normalizeLibraryView(first(params.view), saved.defaultLibraryView);
  const page = normalizeLibraryPage(first(params.page));
  const perPage = normalizeMoviesPerPage(first(params.perPage), saved.moviesPerPage);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-muted-foreground">WatchFlow</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">My Library</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Movies saved to your account are private and protected by Row Level
            Security.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/search">Add a movie</Link>
        </Button>
      </div>

      <Suspense fallback={<LibraryLoading />}>
        <LibraryContent
          filter={filter}
          view={view}
          page={page}
          perPage={perPage}
        />
      </Suspense>
    </div>
  );
}
