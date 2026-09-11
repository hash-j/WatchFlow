"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";

import { updateNotificationPreferencesAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  INITIAL_SETTINGS_ACTION_STATE,
  REMINDER_OFFSET_OPTIONS,
  type UserPreferences,
} from "@/lib/settings/types";
import { FieldError, FormMessage } from "./form-message";

const reminderLabels: Record<number, string> = {
  15: "15 minutes before",
  30: "30 minutes before",
  60: "1 hour before",
  180: "3 hours before",
  1440: "1 day before",
};

function NotificationToggle({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border p-3 focus-within:ring-2 focus-within:ring-ring">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-4 rounded border-input accent-foreground"
      />
      <span className="text-sm font-medium">{label}</span>
    </label>
  );
}

export function NotificationSettingsForm({
  preferences,
}: {
  preferences: UserPreferences;
}) {
  const [state, action, isPending] = useActionState(
    updateNotificationPreferencesAction,
    INITIAL_SETTINGS_ACTION_STATE,
  );

  return (
    <form action={action} className="space-y-6">
      <div className="space-y-3">
        <NotificationToggle
          name="emailNotificationsEnabled"
          label="Enable email notifications when delivery launches"
          defaultChecked={preferences.emailNotificationsEnabled}
        />
        <NotificationToggle
          name="scheduleRemindersEnabled"
          label="Enable schedule reminders when delivery launches"
          defaultChecked={preferences.scheduleRemindersEnabled}
        />
        <NotificationToggle
          name="weeklySummaryEnabled"
          label="Enable a weekly summary when delivery launches"
          defaultChecked={preferences.weeklySummaryEnabled}
        />
      </div>

      <div className="max-w-sm space-y-2">
        <Label htmlFor="reminder-offset">Reminder time</Label>
        <Select
          id="reminder-offset"
          name="reminderOffsetMinutes"
          defaultValue={String(preferences.reminderOffsetMinutes)}
        >
          {REMINDER_OFFSET_OPTIONS.map((offset) => (
            <option key={offset} value={offset}>
              {reminderLabels[offset]}
            </option>
          ))}
        </Select>
        <FieldError
          errors={state.fieldErrors.reminderOffsetMinutes}
          id="reminder-offset-error"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          <Save className="size-4" aria-hidden="true" />
          {isPending ? "Saving..." : "Save notification preferences"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
