"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";

import { updateProfileSettingsAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProfileSettings } from "@/lib/settings/types";
import { INITIAL_SETTINGS_ACTION_STATE } from "@/lib/settings/types";
import { createNonResettingSubmitHandler } from "@/lib/forms/non-resetting-submit";
import { FieldError, FormMessage } from "./form-message";

const COMMON_TIMEZONES = [
  "Asia/Karachi",
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Dubai",
  "Asia/Tokyo",
] as const;

export function ProfileSettingsForm({ profile }: { profile: ProfileSettings }) {
  const [state, action, isPending] = useActionState(
    updateProfileSettingsAction,
    INITIAL_SETTINGS_ACTION_STATE,
  );

  return (
    <form onSubmit={createNonResettingSubmitHandler(action)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="full-name">Full name</Label>
        <Input
          id="full-name"
          name="fullName"
          required
          maxLength={100}
          defaultValue={profile.fullName}
          autoComplete="name"
          aria-invalid={Boolean(state.fieldErrors.fullName)}
          aria-describedby={state.fieldErrors.fullName ? "full-name-error" : undefined}
        />
        <FieldError errors={state.fieldErrors.fullName} id="full-name-error" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="country">Country</Label>
        <Input
          id="country"
          name="country"
          maxLength={80}
          defaultValue={profile.country}
          autoComplete="country-name"
          placeholder="Optional"
          aria-invalid={Boolean(state.fieldErrors.country)}
          aria-describedby={state.fieldErrors.country ? "country-error" : undefined}
        />
        <FieldError errors={state.fieldErrors.country} id="country-error" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="timezone">Timezone</Label>
        <Input
          id="timezone"
          name="timezone"
          required
          list="watchflow-timezones"
          defaultValue={profile.timezone}
          autoComplete="off"
          placeholder="Search or enter an IANA timezone"
          aria-invalid={Boolean(state.fieldErrors.timezone)}
          aria-describedby="timezone-help timezone-error"
        />
        <datalist id="watchflow-timezones">
          {COMMON_TIMEZONES.map((timezone) => (
            <option key={timezone} value={timezone} />
          ))}
        </datalist>
        <p id="timezone-help" className="text-xs text-muted-foreground">
          Used as the default for new schedules. Existing schedules keep their
          saved timezone.
        </p>
        <FieldError errors={state.fieldErrors.timezone} id="timezone-error" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          <Save className="size-4" aria-hidden="true" />
          {isPending ? "Saving..." : "Save profile"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
