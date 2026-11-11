"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";

import { updateApplicationPreferencesAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  isLegacyLibraryMovieStatus,
  LIBRARY_MOVIE_STATUS_LABELS,
} from "@/lib/movies/types";
import {
  DATE_FORMATS,
  INITIAL_SETTINGS_ACTION_STATE,
  MOVIES_PER_PAGE_OPTIONS,
  SELECTABLE_DEFAULT_MOVIE_STATUSES,
  TIME_FORMATS,
  type UserPreferences,
} from "@/lib/settings/types";
import { createNonResettingSubmitHandler } from "@/lib/forms/non-resetting-submit";
import { FieldError, FormMessage } from "./form-message";

function Toggle({
  name,
  label,
  description,
  defaultChecked,
}: {
  name: string;
  label: string;
  description: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border p-3 focus-within:ring-2 focus-within:ring-ring">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 rounded border-input accent-foreground"
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
    </label>
  );
}

export function PreferencesForm({ preferences }: { preferences: UserPreferences }) {
  const [state, action, isPending] = useActionState(
    updateApplicationPreferencesAction,
    INITIAL_SETTINGS_ACTION_STATE,
  );

  return (
    <form onSubmit={createNonResettingSubmitHandler(action)} className="space-y-6">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="default-status">Default movie status</Label>
          <Select
            id="default-status"
            name="defaultMovieStatus"
            defaultValue={preferences.defaultMovieStatus}
          >
            {isLegacyLibraryMovieStatus(preferences.defaultMovieStatus) ? (
              <option value={preferences.defaultMovieStatus} hidden>
                {LIBRARY_MOVIE_STATUS_LABELS[preferences.defaultMovieStatus]}
              </option>
            ) : null}
            {SELECTABLE_DEFAULT_MOVIE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {LIBRARY_MOVIE_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
          <FieldError
            errors={state.fieldErrors.defaultMovieStatus}
            id="default-status-error"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="default-priority">Default priority</Label>
          <Select
            id="default-priority"
            name="defaultPriority"
            defaultValue={String(preferences.defaultPriority)}
          >
            {Array.from({ length: 6 }, (_, priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </Select>
          <FieldError
            errors={state.fieldErrors.defaultPriority}
            id="default-priority-error"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="library-view">Default library view</Label>
          <Select
            id="library-view"
            name="defaultLibraryView"
            defaultValue={preferences.defaultLibraryView}
          >
            <option value="grid">Grid</option>
            <option value="list">List</option>
          </Select>
          <FieldError
            errors={state.fieldErrors.defaultLibraryView}
            id="library-view-error"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="movies-per-page">Movies per page</Label>
          <Select
            id="movies-per-page"
            name="moviesPerPage"
            defaultValue={String(preferences.moviesPerPage)}
          >
            {MOVIES_PER_PAGE_OPTIONS.map((amount) => (
              <option key={amount} value={amount}>
                {amount}
              </option>
            ))}
          </Select>
          <FieldError errors={state.fieldErrors.moviesPerPage} id="page-size-error" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="date-format">Date format</Label>
          <Select
            id="date-format"
            name="dateFormat"
            defaultValue={preferences.dateFormat}
          >
            {DATE_FORMATS.map((format) => (
              <option key={format} value={format}>
                {format}
              </option>
            ))}
          </Select>
          <FieldError errors={state.fieldErrors.dateFormat} id="date-format-error" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="time-format">Time format</Label>
          <Select
            id="time-format"
            name="timeFormat"
            defaultValue={preferences.timeFormat}
          >
            {TIME_FORMATS.map((format) => (
              <option key={format} value={format}>
                {format === "12h" ? "12-hour" : "24-hour"}
              </option>
            ))}
          </Select>
          <FieldError errors={state.fieldErrors.timeFormat} id="time-format-error" />
        </div>

      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Toggle
          name="showAdultResults"
          label="Show adult movie results"
          description="Off by default. TMDB adult titles remain excluded unless enabled."
          defaultChecked={preferences.showAdultResults}
        />
        <Toggle
          name="includeUnreleasedMovies"
          label="Include unreleased movies"
          description="Show announced and upcoming titles in movie search."
          defaultChecked={preferences.includeUnreleasedMovies}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          <Save className="size-4" aria-hidden="true" />
          {isPending ? "Saving..." : "Save preferences"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
