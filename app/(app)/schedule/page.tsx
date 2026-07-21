import Link from "next/link";
import { Suspense } from "react";
import { CalendarClock } from "lucide-react";

import { ScheduleMovieForm } from "@/components/movies/schedule-movie-form";
import { Button } from "@/components/ui/button";
import { listLibraryMovies } from "@/lib/library/service";
import {
  getScheduleTimezone,
  groupScheduledMovies,
} from "@/lib/library/schedule";
import { createSupabaseLibraryDependencies } from "@/lib/library/supabase-library";
import {
  formatScheduledDateTime,
  getLocalDateInput,
  isValidTimeZone,
  normalizeTimeZone,
} from "@/lib/library/timezone";
import type { LibraryMovie } from "@/lib/movies/types";
import { getAuthContext } from "@/lib/supabase/auth";

function ScheduleLoading() {
  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[22rem_1fr]" aria-busy="true">
      <span className="sr-only">Loading your schedule</span>
      <div className="h-96 animate-pulse rounded-xl border bg-card" />
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-xl border bg-card" />
        ))}
      </div>
    </div>
  );
}

function ScheduleSection({
  title,
  items,
  timezone,
}: {
  title: string;
  items: LibraryMovie[];
  timezone: string;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No movies in this section.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((item) => (
            <li key={item.libraryId} className="rounded-xl border bg-card p-4 shadow-sm">
              <Link
                href={`/library/${item.movie.id}`}
                className="font-semibold hover:underline"
              >
                {item.movie.title}
              </Link>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatScheduledDateTime(
                  item.scheduledFor!,
                  getScheduleTimezone(item, timezone),
                )}
              </p>
              {item.scheduleNote ? (
                <p className="mt-3 text-sm">{item.scheduleNote}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function ScheduleWorkspace() {
  const [movies, authContext] = await Promise.all([
    listLibraryMovies(createSupabaseLibraryDependencies()),
    getAuthContext(),
  ]);
  const profileTimezoneValue = authContext.profile?.timezone;
  const profileTimezone =
    typeof profileTimezoneValue === "string" &&
    isValidTimeZone(profileTimezoneValue)
      ? profileTimezoneValue
      : null;
  const timezone = normalizeTimeZone(profileTimezone);
  const { today, upcoming, past } = groupScheduledMovies(movies, timezone);

  if (movies.length === 0) {
    return (
      <div className="mt-8 rounded-xl border bg-card p-10 text-center shadow-sm">
        <CalendarClock className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-4 text-lg font-semibold">
          Add a movie to your library before scheduling it.
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Your private library supplies the movies available for your schedule.
        </p>
        <Button asChild className="mt-6">
          <Link href="/search">Search movies</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[22rem_1fr]">
      <div>
        <ScheduleMovieForm
          movies={movies.map((item) => ({
            libraryId: item.libraryId,
            title: item.movie.title,
          }))}
          profileTimezone={profileTimezone}
          defaultDate={getLocalDateInput(new Date().toISOString(), timezone)}
        />
      </div>
      <div className="space-y-8">
        <ScheduleSection title="Today" items={today} timezone={timezone} />
        <ScheduleSection title="Upcoming" items={upcoming} timezone={timezone} />
        <ScheduleSection title="Past" items={past} timezone={timezone} />
      </div>
    </div>
  );
}

export default function SchedulePage() {
  return (
    <div className="mx-auto max-w-6xl">
      <p className="text-sm font-medium text-muted-foreground">Plan ahead</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Schedule</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Choose a local date, time, and timezone. WatchFlow stores the exact
        timezone-aware instant for your private schedule.
      </p>
      <Suspense fallback={<ScheduleLoading />}>
        <ScheduleWorkspace />
      </Suspense>
    </div>
  );
}
