"use client";

import { useActionState, useEffect, useRef } from "react";
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
  "flex min-h-11 min-w-0 w-full max-w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ScheduleMovieForm({
  movies,
  profileTimezone,
  defaultDate,
}: ScheduleMovieFormProps) {
  const scheduledDateRef = useRef<HTMLInputElement>(null);
  const timezoneRef = useRef<HTMLInputElement>(null);
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
      if (timezoneRef.current) {
        timezoneRef.current.value = browserTimezone;
      }
      if (scheduledDateRef.current) {
        scheduledDateRef.current.value = getLocalDateInput(
          new Date().toISOString(),
          browserTimezone,
        );
      }
    }
  }, [profileTimezone]);

  return (
    <form action={action} className="min-w-0 space-y-5 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
      <div>
        <h2 className="text-lg font-semibold">Schedule a movie</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          WatchFlow keeps the same moment even when you view it from another timezone.
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="schedule-date">Date</Label>
          <Input
            id="schedule-date"
            name="scheduledDate"
            type="date"
            required
            ref={scheduledDateRef}
            defaultValue={defaultDate}
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
          ref={timezoneRef}
          defaultValue={profileTimezone ?? "UTC"}
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
          className="min-w-0 max-w-full w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Movie night details"
        />
      </div>

      <Button type="submit" disabled={isPending || movies.length === 0} className="w-full sm:w-auto xl:w-full 2xl:w-auto">
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
