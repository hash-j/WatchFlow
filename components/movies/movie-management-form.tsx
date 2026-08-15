"use client";

import { useActionState, useState } from "react";
import { Save } from "lucide-react";

import { updateMovieAction } from "@/app/(app)/actions/management";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialLibraryActionState } from "@/lib/library/action-state";
import {
  LIBRARY_MOVIE_STATUSES,
  LIBRARY_MOVIE_STATUS_LABELS,
  type LibraryMovie,
  type LibraryMovieStatus,
} from "@/lib/movies/types";

type MovieManagementFormProps = {
  item: LibraryMovie;
  timezone: string;
  scheduledDate: string;
  scheduledTime: string;
};

const fieldClassName =
  "flex min-h-11 min-w-0 w-full max-w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function MovieManagementForm({
  item,
  timezone,
  scheduledDate,
  scheduledTime,
}: MovieManagementFormProps) {
  const [status, setStatus] = useState<LibraryMovieStatus>(item.status);
  const [state, action, isPending] = useActionState(
    updateMovieAction,
    initialLibraryActionState,
  );

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="libraryId" value={item.libraryId} />
      <input type="hidden" name="movieId" value={item.movie.id} />

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="movie-status">Status</Label>
          <select
            id="movie-status"
            name="status"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as LibraryMovieStatus)
            }
            className={fieldClassName}
          >
            {LIBRARY_MOVIE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {LIBRARY_MOVIE_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="movie-priority">Priority</Label>
          <select
            id="movie-priority"
            name="priority"
            defaultValue={String(item.priority)}
            className={fieldClassName}
          >
            {Array.from({ length: 6 }).map((_, priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">0 is lowest; 5 is highest.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="personal-rating">Personal rating</Label>
          <Input
            id="personal-rating"
            name="personalRating"
            type="number"
            min="0"
            max="10"
            step="0.1"
            defaultValue={item.personalRating ?? ""}
            placeholder="0 to 10"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="watched-date">Watched date</Label>
          <Input
            id="watched-date"
            name="watchedDate"
            type="date"
            defaultValue={item.watchedAt?.slice(0, 10) ?? ""}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="movie-review">Review</Label>
        <textarea
          id="movie-review"
          name="review"
          rows={5}
          maxLength={5000}
          defaultValue={item.review ?? ""}
          className="min-w-0 max-w-full w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Your private thoughts about this movie"
        />
      </div>

      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border p-3 text-sm font-medium">
        <input
          type="checkbox"
          name="wouldWatchAgain"
          value="true"
          defaultChecked={item.wouldWatchAgain}
          className="size-4 rounded border-input accent-foreground"
        />
        I would watch this movie again
      </label>

      {status === "scheduled" ? (
        <fieldset className="space-y-4 rounded-lg border p-4">
          <legend className="px-1 text-sm font-semibold">Viewing schedule</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="scheduled-date">Date</Label>
              <Input
                id="scheduled-date"
                name="scheduledDate"
                type="date"
                required
                defaultValue={scheduledDate}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scheduled-time">Time</Label>
              <Input
                id="scheduled-time"
                name="scheduledTime"
                type="time"
                required
                defaultValue={scheduledTime}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="movie-timezone">Timezone</Label>
            <Input
              id="movie-timezone"
              name="timezone"
              required
              defaultValue={timezone}
              placeholder="UTC"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Use an IANA timezone such as Asia/Karachi or America/New_York.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="movie-schedule-note">Optional note</Label>
            <textarea
              id="movie-schedule-note"
              name="scheduleNote"
              rows={3}
              maxLength={1000}
              defaultValue={item.scheduleNote ?? ""}
              className="min-w-0 max-w-full w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Movie night, venue, or anything else to remember"
            />
          </div>
        </fieldset>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          <Save className="size-4" aria-hidden="true" />
          {isPending ? "Saving..." : "Save changes"}
        </Button>
        {state.message ? (
          <p
            className={`text-sm ${state.status === "error" ? "text-destructive" : "text-muted-foreground"}`}
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
