import Link from "next/link";
import { Suspense } from "react";
import { ListOrdered } from "lucide-react";

import { MoviePoster } from "@/components/movies/movie-poster";
import { QueueControls } from "@/components/movies/queue-controls";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/components/ui/responsive-layout";
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
      <div className="mt-8 rounded-xl border bg-card p-10 text-center shadow-sm">
        <ListOrdered className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-4 text-lg font-semibold">Your queue is empty</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Open a saved movie and change its status to Watch Next to build your
          ordered queue.
        </p>
        <Button asChild className="mt-6">
          <Link href="/library">Open your library</Link>
        </Button>
      </div>
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
        eyebrow="Your queue"
        title="Watch Next"
        description="Move movies up or down to decide what you will watch first. Changes are private and positions stay sequential."
        className="mb-0"
      />
      <Suspense fallback={<QueueLoading />}>
        <WatchNextQueue />
      </Suspense>
    </PageContainer>
  );
}
