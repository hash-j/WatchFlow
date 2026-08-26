import { isValidTimeZone } from "@/lib/library/timezone";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validTimestamp(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : null;
}

export type OnboardingProfileState = {
  profileExists: boolean;
  completed: boolean;
  completedAt: string | null;
  timezone: string;
};

export function mapOnboardingProfile(value: unknown): OnboardingProfileState {
  // A missing legacy profile cannot persist onboarding state. Treat it as
  // compatible/completed so an established account is never trapped.
  if (!isRecord(value)) {
    return {
      profileExists: false,
      completed: true,
      completedAt: null,
      timezone: "UTC",
    };
  }

  const completedAt = validTimestamp(value.onboarding_completed_at);
  const timezone =
    typeof value.timezone === "string" && isValidTimeZone(value.timezone)
      ? value.timezone
      : "UTC";

  return {
    profileExists: true,
    completed: completedAt !== null,
    completedAt,
    timezone,
  };
}
