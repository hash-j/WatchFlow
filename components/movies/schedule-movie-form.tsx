"use client";

import { useActionState, useEffect, useState } from "react";
import { CalendarPlus } from "lucide-react";

import { scheduleMovieAction } from "@/app/(app)/actions/management";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialLibraryActionState } from "@/lib/library/action-state";
import { getLocalDateInput } from "@/lib/library/timezone";

type ScheduleMovieFormProps = {
  movies: Array<{ libraryId: string; title: string }>;
  profileTimezone: string | null;
  defaultDate: string;
};

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function ScheduleMovieForm({
  movies,
  profileTimezone,
  defaultDate,
}: ScheduleMovieFormProps) {
  const [timezone, setTimezone] = useState(profileTimezone ?? "UTC");
  const [scheduledDate, setScheduledDate] = useState(defaultDate);
  const [state, action, isPending] = useActionState(
    scheduleMovieAction,
    initialLibraryActionState,
  );

  useEffect(() => {
    if (profileTimezone) {
      return;
    }

    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (browserTimezone) {
      setTimezone(browserTimezone);
      setScheduledDate(
        getLocalDateInput(new Date().toISOString(), browserTimezone),
      );
    }
  }, [profileTimezone]);

  return (
    <form action={action} className="space-y-5 rounded-xl border bg-card p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Schedule a movie</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Times are converted to a timezone-aware database timestamp.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="schedule-library-id">Movie</Label>
        <select
          id="schedule-library-id"
          name="libraryId"
          required
          disabled={movies.length === 0}
          defaultValue=""
          className={selectClassName}
        >
          <option value="" disabled>
            Select a movie
          </option>
          {movies.map((movie) => (
            <option key={movie.libraryId} value={movie.libraryId}>
              {movie.title}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="schedule-date">Date</Label>
          <Input
            id="schedule-date"
            name="scheduledDate"
            type="date"
            required
            value={scheduledDate}
            onChange={(event) => setScheduledDate(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="schedule-time">Time</Label>
          <Input
            id="schedule-time"
            name="scheduledTime"
            type="time"
            required
            defaultValue="19:00"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="schedule-timezone">Timezone</Label>
        <Input
          id="schedule-timezone"
          name="timezone"
          required
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
          placeholder="UTC"
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          Use an IANA timezone such as Asia/Karachi or America/New_York.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="schedule-note">Optional note</Label>
        <textarea
          id="schedule-note"
          name="scheduleNote"
          rows={3}
          maxLength={1000}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="Movie night details"
        />
      </div>

      <Button type="submit" disabled={isPending || movies.length === 0}>
        <CalendarPlus className="size-4" aria-hidden="true" />
        {isPending ? "Scheduling..." : "Save schedule"}
      </Button>

      {state.message ? (
        <p
          className={`text-sm ${state.status === "error" ? "text-destructive" : "text-muted-foreground"}`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
