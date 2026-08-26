"use client";

import Link from "next/link";
import { useActionState } from "react";

import { saveOnboardingPreferencesAction } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { INITIAL_ONBOARDING_ACTION_STATE, type OnboardingPreferences } from "@/lib/onboarding/types";
import { SUPPORTED_LANGUAGES } from "@/lib/settings/types";
import { PendingButton } from "./pending-button";
import { SkipSetupForm } from "./skip-setup-form";

const COMMON_TIMEZONES = [
  "Asia/Karachi",
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const;

const languageLabels = {
  en: "English",
  ur: "Urdu",
  es: "Spanish",
  fr: "French",
  de: "German",
} as const;

const selectClassName =
  "flex min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function FieldError({ errors, id }: { errors?: string[]; id: string }) {
  return errors?.length ? (
    <p id={id} className="text-sm text-destructive" role="alert">
      {errors[0]}
    </p>
  ) : null;
}

export function PersonalizeForm({
  preferences,
}: {
  preferences: OnboardingPreferences;
}) {
  const [state, action] = useActionState(
    saveOnboardingPreferencesAction,
    INITIAL_ONBOARDING_ACTION_STATE,
  );

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="onboarding-timezone">Timezone</Label>
            <Input
              id="onboarding-timezone"
              name="timezone"
              required
              list="onboarding-timezones"
              defaultValue={preferences.timezone}
              autoComplete="off"
              placeholder="Search or enter an IANA timezone"
              aria-invalid={Boolean(state.fieldErrors.timezone)}
              aria-describedby="onboarding-timezone-help onboarding-timezone-error"
            />
            <datalist id="onboarding-timezones">
              {COMMON_TIMEZONES.map((timezone) => (
                <option key={timezone} value={timezone} />
              ))}
            </datalist>
            <p id="onboarding-timezone-help" className="text-xs leading-5 text-muted-foreground">
              Used for new schedules. You can type any valid IANA timezone.
            </p>
            <FieldError errors={state.fieldErrors.timezone} id="onboarding-timezone-error" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="onboarding-library-view">Default Library view</Label>
            <select
              id="onboarding-library-view"
              name="defaultLibraryView"
              defaultValue={preferences.defaultLibraryView}
              className={selectClassName}
              aria-invalid={Boolean(state.fieldErrors.defaultLibraryView)}
              aria-describedby="onboarding-library-view-error"
            >
              <option value="grid">Grid</option>
              <option value="list">List</option>
            </select>
            <FieldError errors={state.fieldErrors.defaultLibraryView} id="onboarding-library-view-error" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="onboarding-language">Preferred movie language</Label>
            <select
              id="onboarding-language"
              name="preferredLanguage"
              defaultValue={preferences.preferredLanguage}
              className={selectClassName}
              aria-invalid={Boolean(state.fieldErrors.preferredLanguage)}
              aria-describedby="onboarding-language-help onboarding-language-error"
            >
              {SUPPORTED_LANGUAGES.map((language) => (
                <option key={language} value={language}>
                  {languageLabels[language]}
                </option>
              ))}
            </select>
            <p id="onboarding-language-help" className="text-xs leading-5 text-muted-foreground">
              Used when searching TMDB. Movie details stay in WatchFlow&apos;s canonical format.
            </p>
            <FieldError errors={state.fieldErrors.preferredLanguage} id="onboarding-language-error" />
          </div>
        </div>

        {state.status === "error" && state.message ? (
          <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {state.message}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-3 border-t pt-5 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
          <Button asChild variant="outline" className="w-full min-[420px]:w-auto">
            <Link href="/onboarding?step=1">Back</Link>
          </Button>
          <PendingButton
            type="submit"
            idleLabel="Save and continue"
            pendingLabel="Saving..."
            className="w-full min-[420px]:w-auto"
          />
        </div>
      </form>

      <div className="flex justify-center">
        <SkipSetupForm />
      </div>
    </div>
  );
}
