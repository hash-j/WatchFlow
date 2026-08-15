import Link from "next/link";
import { Suspense } from "react";
import { CalendarDays, Library, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/components/ui/responsive-layout";
import { listLibraryMovies } from "@/lib/library/service";
import { createSupabaseLibraryDependencies } from "@/lib/library/supabase-library";
import {
  compareLocalDate,
  normalizeTimeZone,
} from "@/lib/library/timezone";
import type { LibraryMovie } from "@/lib/movies/types";
import { getAuthContext } from "@/lib/supabase/auth";
import { formatUserDateTime } from "@/lib/settings/formatting";
import { getCurrentUserPreferences } from "@/lib/settings/supabase-settings";
import { DEFAULT_USER_PREFERENCES } from "@/lib/settings/types";

const quickActions = [
  {
    href: "/search",
    title: "Find a movie",
    description: "Search TMDB and add a title to your private library.",
    icon: Search,
  },
  {
    href: "/library",
    title: "Open your library",
    description: "Update statuses, ratings, reviews, and priorities.",
    icon: Library,
  },
  {
    href: "/schedule",
    title: "Plan a watch",
    description: "Schedule a movie in your local timezone.",
    icon: CalendarDays,
  },
] as const;

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
  const [authContext, movies, savedPreferences] = await Promise.all([
    getAuthContext(),
    listLibraryMovies(createSupabaseLibraryDependencies()),
    getCurrentUserPreferences(),
  ]);
  const preferences = savedPreferences ?? DEFAULT_USER_PREFERENCES;
  const { user, profile, profileLoadFailed, profileName } = authContext;
  const timezone = normalizeTimeZone(profile?.timezone);
  const queue = movies
    .filter((item) => item.status === "watch_next")
    .sort(
      (left, right) =>
        (left.queuePosition ?? Number.MAX_SAFE_INTEGER) -
        (right.queuePosition ?? Number.MAX_SAFE_INTEGER),
    );
  const scheduledToday = movies
    .filter(
      (item) =>
        item.status === "scheduled" &&
        item.scheduledFor &&
        compareLocalDate(
          item.scheduledFor,
          normalizeTimeZone(item.scheduleTimezone, timezone),
        ) === 0,
    )
    .sort((left, right) =>
      (left.scheduledFor ?? "").localeCompare(right.scheduledFor ?? ""),
    );
  const recentlyAdded = [...movies]
    .sort((left, right) =>
      (right.addedAt ?? "").localeCompare(left.addedAt ?? ""),
    )
    .slice(0, 4);
  const recentlyWatched = movies
    .filter((item) => item.status === "watched")
    .sort((left, right) =>
      (right.watchedAt ?? right.updatedAt ?? "").localeCompare(
        left.watchedAt ?? left.updatedAt ?? "",
      ),
    )
    .slice(0, 4);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Dashboard"
        title={<>Welcome{profileName ? `, ${profileName}` : " to WatchFlow"}</>}
        description="Your private workspace for organizing what you want to watch."
        className="mb-0"
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {quickActions.map(({ href, title, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group min-w-0 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-foreground/20 sm:p-5"
          >
            <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-4 font-semibold group-hover:underline">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </Link>
        ))}
      </section>

      <section aria-labelledby="dashboard-overview-heading">
        <h2 id="dashboard-overview-heading" className="text-xl font-semibold">
          Your viewing overview
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="min-w-0 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
            <h3 className="font-semibold">Next movie</h3>
            <MovieList
              items={queue.slice(0, 1)}
              emptyMessage="Nothing is queued yet."
              detail={() => "First in Watch Next"}
            />
          </article>
          <article className="min-w-0 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
            <h3 className="font-semibold">Scheduled today</h3>
            <MovieList
              items={scheduledToday}
              emptyMessage="No movies scheduled today."
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
              items={recentlyAdded}
              emptyMessage="Your library is empty."
            />
          </article>
          <article className="min-w-0 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
            <h3 className="font-semibold">Recently watched</h3>
            <MovieList
              items={recentlyWatched}
              emptyMessage="No watched movies yet."
              detail={(item) =>
                item.personalRating !== null
                  ? `Your rating: ${item.personalRating}/10`
                  : null
              }
            />
          </article>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h2 className="text-lg font-semibold">Account</h2>
            <p className="text-sm text-muted-foreground">
              Authentication and profile data are loaded securely on the server.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/settings">Settings</Link>
          </Button>
        </div>

        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div className="rounded-lg bg-muted/60 p-4">
            <dt className="text-muted-foreground">Signed-in email</dt>
            <dd className="mt-1 break-all font-medium">
              {user.email ?? "Email unavailable"}
            </dd>
          </div>
          <div className="rounded-lg bg-muted/60 p-4">
            <dt className="text-muted-foreground">Profile record</dt>
            <dd className="mt-1 font-medium">
              {profileLoadFailed
                ? "Temporarily unavailable"
                : profile
                  ? "Connected"
                  : "Not created yet"}
            </dd>
          </div>
        </dl>
      </section>
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
