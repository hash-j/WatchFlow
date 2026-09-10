"use client";

import { useActionState, useState } from "react";
import { Save } from "lucide-react";

import { updateMovieAction } from "@/app/(app)/actions/management";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  initialLibraryActionState,
  type LibraryActionState,
} from "@/lib/library/action-state";
import { getWatchedDateInput } from "@/lib/library/timezone";
import {
  isLegacyLibraryMovieStatus,
  LIBRARY_MOVIE_STATUS_LABELS,
  SELECTABLE_LIBRARY_MOVIE_STATUSES,
  type LibraryMovie,
  type LibraryMovieStatus,
} from "@/lib/movies/types";

type MovieManagementFormProps = {
  item: LibraryMovie;
  timezone: string;
  scheduledDate: string;
  scheduledTime: string;
};

type MovieManagementFieldsProps = MovieManagementFormProps & {
  action: (payload: FormData) => void;
  state: LibraryActionState;
  isPending: boolean;
};

function MovieManagementFields({
  item,
  timezone,
  scheduledDate,
  scheduledTime,
  action,
  state,
  isPending,
}: MovieManagementFieldsProps) {
  const [status, setStatus] = useState<LibraryMovieStatus>(item.status);
  const persistedWatchedDate = getWatchedDateInput(item.watchedAt);
  const [watchedDate, setWatchedDate] = useState(persistedWatchedDate);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="libraryId" value={item.libraryId} />
      <input type="hidden" name="movieId" value={item.movie.id} />

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="movie-status">Status</Label>
          <Select
            id="movie-status"
            name="status"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as LibraryMovieStatus)
            }
          >
            {isLegacyLibraryMovieStatus(item.status) ? (
              <option value={item.status} hidden>
                {LIBRARY_MOVIE_STATUS_LABELS[item.status]}
              </option>
            ) : null}
            {SELECTABLE_LIBRARY_MOVIE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {LIBRARY_MOVIE_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="movie-priority">Priority</Label>
          <Select
            id="movie-priority"
            name="priority"
            defaultValue={String(item.priority)}
          >
            {Array.from({ length: 6 }).map((_, priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </Select>
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

        {status === "watched" ? (
          <div className="space-y-2">
            <Label htmlFor="watched-date">Watched date</Label>
            <Input
              id="watched-date"
              name="watchedDate"
              type="date"
              value={watchedDate}
              onChange={(event) => setWatchedDate(event.target.value)}
            />
          </div>
        ) : null}
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

export function MovieManagementForm(props: MovieManagementFormProps) {
  const [state, action, isPending] = useActionState(
    updateMovieAction,
    initialLibraryActionState,
  );
  const formVersion = [
    props.item.updatedAt,
    props.item.status,
    props.item.watchedAt,
  ].join(":");

  return (
    <MovieManagementFields
      key={formVersion}
      {...props}
      action={action}
      state={state}
      isPending={isPending}
    />
  );
}
