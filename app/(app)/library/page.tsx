import Link from "next/link";
import { Suspense } from "react";
import { LibraryBig, SearchX } from "lucide-react";
import { redirect } from "next/navigation";

import { LibraryControls } from "@/components/library/library-controls";
import { LibraryPagination } from "@/components/library/library-pagination";
import { LibrarySelectionWorkspace } from "@/components/library/library-selection-workspace";
import { LibraryMovieCard } from "@/components/movies/library-movie-card";
import { LibraryMovieListItem } from "@/components/movies/library-movie-list-item";
import { buttonVariants } from "@/components/ui/button";
import {
  buildClearLibraryFiltersUrl,
  buildLibraryUrl,
  countActiveLibraryFilters,
  libraryStateToSearchParams,
  type RawLibrarySearchParams,
} from "@/lib/library/query";
import { getLibraryPageData } from "@/lib/library/supabase-query";

type LibraryPageProps = {
  searchParams: Promise<RawLibrarySearchParams>;
};

function LibraryLoading() {
  return (
    <div className="space-y-5" aria-busy="true">
      <span className="sr-only">Loading your library</span>
      <div className="h-11 animate-pulse rounded-lg bg-muted" />
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="aspect-[2/3] animate-pulse rounded-xl bg-muted"
          />
        ))}
      </div>
    </div>
  );
}

async function LibraryContent({ searchParams }: LibraryPageProps) {
  const rawSearchParams = await searchParams;
  const data = await getLibraryPageData(rawSearchParams);

  if (data.state.page !== data.pagination.page) {
    redirect(buildLibraryUrl(data.state, { page: data.pagination.page }));
  }

  const filtersActive = countActiveLibraryFilters(data.state) > 0;
  const scopeKey = libraryStateToSearchParams(data.state).toString();

  return (
    <div className="space-y-6">
      <LibraryControls
        state={data.state}
        facets={data.facets}
        pagination={data.pagination}
        warnings={data.warnings}
      />

      {data.items.length === 0 ? (
        data.facets.counts.all === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <LibraryBig
              className="mx-auto size-9 text-muted-foreground"
              aria-hidden="true"
            />
            <h2 className="mt-4 text-lg font-semibold">
              Your library is empty
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Search TMDB and add a movie to begin building your private
              library.
            </p>
            <Link
              href="/search"
              className={`${buttonVariants({ variant: "default" })} mt-5`}
            >
              Search movies
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <SearchX
              className="mx-auto size-9 text-muted-foreground"
              aria-hidden="true"
            />
            <h2 className="mt-4 text-lg font-semibold">
              {data.state.q
                ? `No movies match “${data.state.q}” in your library.`
                : "No movies match your current filters."}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Clear the search or remove one or more filters to see other
              personal-library records.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {data.state.q ? (
                <Link
                  href={buildLibraryUrl(
                    data.state,
                    { q: "" },
                    { resetPage: true },
                  )}
                  className={buttonVariants({ variant: "outline" })}
                >
                  Clear search
                </Link>
              ) : null}
              {filtersActive ? (
                <Link
                  href={buildClearLibraryFiltersUrl(data.state)}
                  className={buttonVariants({ variant: "outline" })}
                >
                  Clear filters
                </Link>
              ) : null}
            </div>
          </div>
        )
      ) : (
        <LibrarySelectionWorkspace
          key={scopeKey}
          scopeKey={scopeKey}
          items={data.items.map((item) => ({
            libraryId: item.libraryId,
            title: item.movie.title,
          }))}
        >
          {data.state.view === "grid" ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {data.items.map((item) => (
                <LibraryMovieCard key={item.libraryId} item={item} />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {data.items.map((item) => (
                <LibraryMovieListItem key={item.libraryId} item={item} />
              ))}
            </div>
          )}
        </LibrarySelectionWorkspace>
      )}

      <LibraryPagination state={data.state} pagination={data.pagination} />
    </div>
  );
}

export default function LibraryPage({ searchParams }: LibraryPageProps) {
  return (
    <div>
      <div className="mb-8">
        <p className="text-sm font-medium text-muted-foreground">
          Private collection
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">My Library</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Search, filter, sort, favourite, and manage only the movies saved to
          your account.
        </p>
      </div>

      <Suspense fallback={<LibraryLoading />}>
        <LibraryContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
