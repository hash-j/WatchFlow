import Link from "next/link";
import { Suspense } from "react";
import { Library } from "lucide-react";

import { LibraryMovieCard } from "@/components/movies/library-movie-card";
import { Button } from "@/components/ui/button";
import { listLibraryMovies } from "@/lib/library/service";
import { createSupabaseLibraryDependencies } from "@/lib/library/supabase-library";

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

async function LibraryGrid() {
  const movies = await listLibraryMovies(createSupabaseLibraryDependencies());

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
    <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {movies.map((item) => (
        <LibraryMovieCard key={item.libraryId} item={item} />
      ))}
    </div>
  );
}

export default function LibraryPage() {
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
        <LibraryGrid />
      </Suspense>
    </div>
  );
}
