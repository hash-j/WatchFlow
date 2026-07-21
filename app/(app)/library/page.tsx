import Link from "next/link";
import { Suspense } from "react";
import { Library } from "lucide-react";

import { LibraryMovieCard } from "@/components/movies/library-movie-card";
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
import { cn } from "@/lib/utils";

type LibraryPageProps = {
  searchParams: Promise<{ filter?: string }>;
};

const filterLinks: Array<{
  value: LibraryFilter;
  label: string;
  href: string;
}> = [
  { value: "all", label: "All", href: "/library" },
  { value: "unwatched", label: "Unwatched", href: "/library?filter=unwatched" },
  { value: "watched", label: "Watched", href: "/library?filter=watched" },
];

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

async function LibraryContent({ filter }: { filter: LibraryFilter }) {
  const movies = await listLibraryMovies(createSupabaseLibraryDependencies());
  const counts = getLibraryFilterCounts(movies);
  const filteredMovies = filterLibraryMovies(movies, filter);

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

  return (
    <div className="mt-8">
      <div className="flex flex-col justify-between gap-4 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold">Library summary</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {counts.watched} watched · {counts.unwatched} unwatched
          </p>
        </div>
        <nav aria-label="Filter movie library" className="flex flex-wrap gap-2">
          {filterLinks.map((link) => (
            <Link
              key={link.value}
              href={link.href}
              aria-current={filter === link.value ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                filter === link.value
                  ? "border-foreground bg-foreground text-background"
                  : "bg-background hover:bg-accent",
              )}
            >
              {link.label}
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {counts[link.value]}
              </span>
            </Link>
          ))}
        </nav>
      </div>

      {filteredMovies.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed p-10 text-center">
          <h2 className="font-semibold">{getLibraryFilterEmptyMessage(filter)}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Change the filter or update a movie status to see it here.
          </p>
        </div>
      ) : (
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredMovies.map((item) => (
            <LibraryMovieCard key={item.libraryId} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  const filter = normalizeLibraryFilter((await searchParams).filter);

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
        <LibraryContent filter={filter} />
      </Suspense>
    </div>
  );
}
