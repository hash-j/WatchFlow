"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";

import { updateApplicationPreferencesAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  LIBRARY_MOVIE_STATUS_LABELS,
} from "@/lib/movies/types";
import {
  DATE_FORMATS,
  DEFAULT_MOVIE_STATUSES,
  INITIAL_SETTINGS_ACTION_STATE,
  MOVIES_PER_PAGE_OPTIONS,
  SUPPORTED_LANGUAGES,
  TIME_FORMATS,
  type UserPreferences,
} from "@/lib/settings/types";
import { FieldError, FormMessage } from "./form-message";

const selectClassName =
  "flex min-h-11 min-w-0 w-full max-w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const languageLabels = {
  en: "English",
  ur: "Urdu",
  es: "Spanish",
  fr: "French",
  de: "German",
} as const;

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
    <form action={action} className="space-y-6">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="default-status">Default movie status</Label>
          <select
            id="default-status"
            name="defaultMovieStatus"
            defaultValue={preferences.defaultMovieStatus}
            className={selectClassName}
          >
            {DEFAULT_MOVIE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {LIBRARY_MOVIE_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <FieldError
            errors={state.fieldErrors.defaultMovieStatus}
            id="default-status-error"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="default-priority">Default priority</Label>
          <select
            id="default-priority"
            name="defaultPriority"
            defaultValue={String(preferences.defaultPriority)}
            className={selectClassName}
          >
            {Array.from({ length: 6 }, (_, priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
          <FieldError
            errors={state.fieldErrors.defaultPriority}
            id="default-priority-error"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="library-view">Default library view</Label>
          <select
            id="library-view"
            name="defaultLibraryView"
            defaultValue={preferences.defaultLibraryView}
            className={selectClassName}
          >
            <option value="grid">Grid</option>
            <option value="list">List</option>
          </select>
          <FieldError
            errors={state.fieldErrors.defaultLibraryView}
            id="library-view-error"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="movies-per-page">Movies per page</Label>
          <select
            id="movies-per-page"
            name="moviesPerPage"
            defaultValue={String(preferences.moviesPerPage)}
            className={selectClassName}
          >
            {MOVIES_PER_PAGE_OPTIONS.map((amount) => (
              <option key={amount} value={amount}>
                {amount}
              </option>
            ))}
          </select>
          <FieldError errors={state.fieldErrors.moviesPerPage} id="page-size-error" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="date-format">Date format</Label>
          <select
            id="date-format"
            name="dateFormat"
            defaultValue={preferences.dateFormat}
            className={selectClassName}
          >
            {DATE_FORMATS.map((format) => (
              <option key={format} value={format}>
                {format}
              </option>
            ))}
          </select>
          <FieldError errors={state.fieldErrors.dateFormat} id="date-format-error" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="time-format">Time format</Label>
          <select
            id="time-format"
            name="timeFormat"
            defaultValue={preferences.timeFormat}
            className={selectClassName}
          >
            {TIME_FORMATS.map((format) => (
              <option key={format} value={format}>
                {format === "12h" ? "12-hour" : "24-hour"}
              </option>
            ))}
          </select>
          <FieldError errors={state.fieldErrors.timeFormat} id="time-format-error" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="preferred-language">Preferred TMDB language</Label>
          <select
            id="preferred-language"
            name="preferredLanguage"
            defaultValue={preferences.preferredLanguage}
            className={selectClassName}
          >
            {SUPPORTED_LANGUAGES.map((language) => (
              <option key={language} value={language}>
                {languageLabels[language]}
              </option>
            ))}
          </select>
          <FieldError
            errors={state.fieldErrors.preferredLanguage}
            id="preferred-language-error"
          />
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
