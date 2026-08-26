import { z } from "zod";

import {
  applicationPreferencesSchema,
  profileSettingsSchema,
} from "@/lib/settings/validation";
import { ONBOARDING_MOVIE_STATUSES } from "./types";

export const onboardingPreferencesSchema = z.object({
  timezone: profileSettingsSchema.shape.timezone,
  defaultLibraryView:
    applicationPreferencesSchema.shape.defaultLibraryView,
  preferredLanguage: applicationPreferencesSchema.shape.preferredLanguage,
});

export const onboardingMovieStatusSchema = z.enum(
  ONBOARDING_MOVIE_STATUSES,
  { error: "Choose Want to Watch or Watched." },
);

export function validateOnboardingMovieStatus(value: unknown) {
  return onboardingMovieStatusSchema.safeParse(value);
}
