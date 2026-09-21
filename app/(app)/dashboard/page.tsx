import Link from "next/link";
import { Suspense } from "react";
import { CalendarDays, Dices, ListOrdered, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/components/ui/responsive-layout";
import { getDashboardData } from "@/lib/library/supabase-overview";
import { normalizeTimeZone } from "@/lib/library/timezone";
import type { LibraryMovie } from "@/lib/movies/types";
import { getAuthContext } from "@/lib/supabase/auth";
import { formatUserDateTime } from "@/lib/settings/formatting";
import { DEFAULT_USER_PREFERENCES } from "@/lib/settings/types";

function DashboardLoading() {
  return (
    <div className="space-y-8" aria-busy="true">
      <span className="sr-only">Loading your dashboard</span>
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-44 animate-pulse rounded-xl border bg-card" />
        ))}
      </div>
    </div>
  );
}

function MovieList({
  items,
  emptyMessage,
  detail,
}: {
  items: LibraryMovie[];
  emptyMessage: string;
  detail?: (item: LibraryMovie) => string | null;
}) {
  if (items.length === 0) {
    return <p className="mt-4 text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ul className="mt-4 space-y-3">
      {items.map((item) => (
        <li key={item.libraryId}>
          <Link
            href={`/library/${item.movie.id}`}
            className="text-sm font-medium hover:underline"
          >
            {item.movie.title}
          </Link>
          {detail?.(item) ? (
            <p className="text-xs text-muted-foreground">{detail(item)}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

async function DashboardContent() {
  const authContext = await getAuthContext();
  const { user, profile, profileLoadFailed, profileName } = authContext;
  const timezone = normalizeTimeZone(profile?.timezone);
  const data = await getDashboardData(user.id, timezone);
  const preferences = data.preferences ?? DEFAULT_USER_PREFERENCES;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={<>Welcome{profileName ? `, ${profileName}` : " to WatchFlow"}</>}
        title="Dashboard"
        description="See what is coming up and choose your next movie task."
        className="mb-0"
      />

      <section
        aria-labelledby="dashboard-next-actions-heading"
        className="rounded-xl border bg-card p-5 shadow-sm sm:p-6"
      >
        <div>
          <h2 id="dashboard-next-actions-heading" className="text-xl font-semibold">
            Next actions
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Start with the action that best matches what you want to do now.
          </p>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Button asChild className="min-h-12 justify-start">
            <Link href={data.nextMovie.length > 0 ? "/watch-next" : "/search"}>
              {data.nextMovie.length > 0 ? (
                <ListOrdered className="size-4" aria-hidden="true" />
              ) : (
                <Search className="size-4" aria-hidden="true" />
              )}
              {data.nextMovie.length > 0 ? "Open Watch Next" : "Search for a Movie"}
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-12 justify-start">
            <Link href="/picker">
              <Dices className="size-4" aria-hidden="true" />
              Pick a Movie
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-12 justify-start">
            <Link href="/schedule">
              <CalendarDays className="size-4" aria-hidden="true" />
              Schedule a Movie
            </Link>
          </Button>
        </div>
      </section>

      <section aria-labelledby="dashboard-overview-heading">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="dashboard-overview-heading" className="text-xl font-semibold">
              Your viewing overview
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.libraryCount} {data.libraryCount === 1 ? "movie" : "movies"} in your Library
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/library">Open Library</Link>
          </Button>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="min-w-0 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
            <h3 className="font-semibold">Next movie</h3>
            <MovieList
              items={data.nextMovie}
              emptyMessage="Nothing is in Watch Next. Add a Library movie when you plan to watch it soon."
              detail={() => "First in Watch Next"}
            />
          </article>
          <article className="min-w-0 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
            <h3 className="font-semibold">Scheduled today</h3>
            <MovieList
              items={data.scheduledToday}
              emptyMessage="Nothing is planned for today."
              detail={(item) =>
                item.scheduledFor
                  ? formatUserDateTime(
                      item.scheduledFor,
                      normalizeTimeZone(item.scheduleTimezone, timezone),
                      preferences.dateFormat,
                      preferences.timeFormat,
                    )
                  : null
              }
            />
          </article>
          <article className="min-w-0 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
            <h3 className="font-semibold">Recently added</h3>
            <MovieList
              items={data.recentlyAdded}
              emptyMessage="Your Library is empty. Search for a movie to get started."
            />
          </article>
          <article className="min-w-0 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
            <h3 className="font-semibold">Recently watched</h3>
            <MovieList
              items={data.recentlyWatched}
              emptyMessage="No watched movies yet. Mark a movie as Watched to build recent activity."
              detail={(item) =>
                item.personalRating !== null
                  ? `Your rating: ${item.personalRating}/10`
                  : null
              }
            />
          </article>
        </div>
      </section>

      {profileLoadFailed || !profile || !user.email ? (
        <section className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          <p>
            Some account details are temporarily unavailable. Your movie tools
            are still available; open Settings to review your profile later.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href="/settings">Open Settings</Link>
          </Button>
        </section>
      ) : null}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <PageContainer className="max-w-6xl">
      <Suspense fallback={<DashboardLoading />}>
        <DashboardContent />
      </Suspense>
    </PageContainer>
  );
}
