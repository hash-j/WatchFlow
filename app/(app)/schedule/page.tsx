import Link from "next/link";
import { Suspense } from "react";
import { CalendarClock } from "lucide-react";

import { ScheduleMovieForm } from "@/components/movies/schedule-movie-form";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/components/ui/responsive-layout";
import {
  getScheduleTimezone,
  groupScheduledMovies,
} from "@/lib/library/schedule";
import { getSchedulePageData } from "@/lib/library/supabase-overview";
import {
  getLocalDateInput,
  isValidTimeZone,
  normalizeTimeZone,
} from "@/lib/library/timezone";
import type { LibraryMovie } from "@/lib/movies/types";
import { getAuthContext } from "@/lib/supabase/auth";
import { formatUserDateTime } from "@/lib/settings/formatting";
import {
  DEFAULT_USER_PREFERENCES,
  type DateFormat,
  type TimeFormat,
} from "@/lib/settings/types";

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
  emptyMessage,
  items,
  timezone,
  dateFormat,
  timeFormat,
}: {
  title: string;
  emptyMessage: string;
  items: LibraryMovie[];
  timezone: string;
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {emptyMessage}
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
                {formatUserDateTime(
                  item.scheduledFor!,
                  getScheduleTimezone(item, timezone),
                  dateFormat,
                  timeFormat,
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
  const authContext = await getAuthContext();
  const data = await getSchedulePageData(authContext.user.id);
  const preferences = data.preferences ?? DEFAULT_USER_PREFERENCES;
  const profileTimezoneValue = authContext.profile?.timezone;
  const profileTimezone =
    typeof profileTimezoneValue === "string" &&
    isValidTimeZone(profileTimezoneValue)
      ? profileTimezoneValue
      : null;
  const timezone = normalizeTimeZone(profileTimezone);
  const { today, upcoming, past } = groupScheduledMovies(
    data.scheduledMovies,
    timezone,
  );
  const hasScheduledMovies =
    today.length + upcoming.length + past.length > 0;

  if (data.movieOptions.length === 0) {
    return (
      <div className="mt-8 rounded-xl border bg-card px-4 py-8 text-center shadow-sm sm:p-10">
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
    <div className="mt-8 grid min-w-0 gap-8 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <div>
        <ScheduleMovieForm
          movies={data.movieOptions}
          profileTimezone={profileTimezone}
          defaultDate={getLocalDateInput(new Date().toISOString(), timezone)}
        />
      </div>
      <div className="space-y-8">
        {hasScheduledMovies ? (
          <>
            <ScheduleSection
              title="Today"
              emptyMessage="Nothing is planned for today."
              items={today}
              timezone={timezone}
              dateFormat={preferences.dateFormat}
              timeFormat={preferences.timeFormat}
            />
            <ScheduleSection
              title="Upcoming"
              emptyMessage="No upcoming plans yet."
              items={upcoming}
              timezone={timezone}
              dateFormat={preferences.dateFormat}
              timeFormat={preferences.timeFormat}
            />
            <ScheduleSection
              title="Past"
              emptyMessage="Past plans will appear here."
              items={past}
              timezone={timezone}
              dateFormat={preferences.dateFormat}
              timeFormat={preferences.timeFormat}
            />
          </>
        ) : (
          <div className="rounded-xl border bg-card px-4 py-8 text-center shadow-sm sm:p-8">
            <CalendarClock
              className="mx-auto size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <h2 className="mt-4 text-lg font-semibold">
              You have no scheduled movies.
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Choose a movie, local date, time, and timezone in the form to add
              your first private schedule.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SchedulePage() {
  return (
    <PageContainer className="max-w-6xl">
      <PageHeader
        eyebrow="Your movies"
        title="Schedule"
        description="Plan a Library movie for a local date and time. Today, Upcoming, and Past follow the timezone you choose."
        className="mb-0"
      />
      <Suspense fallback={<ScheduleLoading />}>
        <ScheduleWorkspace />
      </Suspense>
    </PageContainer>
  );
}
