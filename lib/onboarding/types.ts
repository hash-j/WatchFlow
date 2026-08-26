import type { LibraryMovieStatus } from "@/lib/movies/types";
import type { LibraryView, SupportedLanguage } from "@/lib/settings/types";

export const ONBOARDING_STEPS = [1, 2, 3] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_MOVIE_STATUSES = [
  "want_to_watch",
  "watched",
] as const satisfies readonly LibraryMovieStatus[];
export type OnboardingMovieStatus =
  (typeof ONBOARDING_MOVIE_STATUSES)[number];

export type OnboardingPreferences = {
  timezone: string;
  defaultLibraryView: LibraryView;
  preferredLanguage: SupportedLanguage;
};

export type OnboardingActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  fieldErrors: Record<string, string[]>;
};

export const INITIAL_ONBOARDING_ACTION_STATE: OnboardingActionState = {
  status: "idle",
  message: null,
  fieldErrors: {},
};

export function parseOnboardingStep(value: unknown): OnboardingStep {
  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed = typeof candidate === "string" ? Number(candidate) : 1;
  return ONBOARDING_STEPS.includes(parsed as OnboardingStep)
    ? (parsed as OnboardingStep)
    : 1;
}
