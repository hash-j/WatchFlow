import Link from "next/link";
import { Suspense } from "react";
import { ListOrdered } from "lucide-react";

import { MoviePoster } from "@/components/movies/movie-poster";
import { QueueControls } from "@/components/movies/queue-controls";
import { Button } from "@/components/ui/button";
import { EmptyState, PageContainer, PageHeader } from "@/components/ui/responsive-layout";
import { getCurrentUserWatchNextMovies } from "@/lib/library/supabase-library";

function QueueLoading() {
  return (
    <div className="mt-8 space-y-3" aria-busy="true">
      <span className="sr-only">Loading your Watch Next queue</span>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="h-32 animate-pulse rounded-xl border bg-card" />
      ))}
    </div>
  );
}

async function WatchNextQueue() {
  const { items: queue, truncated } =
    await getCurrentUserWatchNextMovies();

  if (queue.length === 0) {
    return (
      <EmptyState
        className="mt-8"
        icon={<ListOrdered className="size-9" aria-hidden="true" />}
        title="Your Watch Next queue is empty"
        description="Saved can hold anything you may watch later. Add a Library movie to Watch Next when you want to watch it soon."
        actions={
          <Button asChild>
            <Link href="/library">Browse Library</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      {truncated ? (
        <p
          className="mt-8 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
          role="status"
        >
          Showing the first 500 queued movies. Remove or reorder earlier items
          to reach the rest.
        </p>
      ) : null}
      <ol className={`${truncated ? "mt-4" : "mt-8"} space-y-3`}>
        {queue.map((item, index) => (
          <li
            key={item.libraryId}
            className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] gap-4 rounded-xl border bg-card p-4 shadow-sm md:grid-cols-[2.5rem_5rem_minmax(0,1fr)_auto] md:items-center"
          >
            <span className="grid size-10 place-items-center rounded-full bg-muted text-sm font-semibold">
              {index + 1}
            </span>
            <div className="col-start-2 row-start-1 w-full max-w-28 md:col-start-auto md:row-start-auto md:w-20">
              <MoviePoster
                path={item.movie.posterPath}
                title={item.movie.title}
                sizes="80px"
              />
            </div>
            <div className="col-start-2 min-w-0 md:col-start-auto">
              <Link
                href={`/library/${item.movie.id}`}
                className="font-semibold hover:underline"
              >
                {item.movie.title}
              </Link>
              <p className="mt-1 text-sm text-muted-foreground">
                Priority {item.priority} · Position {index + 1}
              </p>
            </div>
            <div className="col-start-2 min-w-0 md:col-start-auto">
              <QueueControls
                libraryId={item.libraryId}
                isFirst={index === 0}
                isLast={index === queue.length - 1 && !truncated}
              />
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

export default function WatchNextPage() {
  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        eyebrow="Your movies"
        title="Watch Next"
        description="An ordered queue for movies you plan to watch soon—separate from your broader Saved collection."
        className="mb-0"
      />
      <Suspense fallback={<QueueLoading />}>
        <WatchNextQueue />
      </Suspense>
    </PageContainer>
  );
}
