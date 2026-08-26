import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import { logSupabaseError } from "@/lib/supabase/error-logging";
import { createClient } from "@/lib/supabase/server";
import { mapOnboardingProfile } from "./state";
import { OnboardingPersistenceError } from "./errors";

export type OnboardingSession = {
  user: User;
  client: SupabaseClient;
};

export async function authenticateOnboarding(): Promise<OnboardingSession | null> {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) return null;
  return { user, client };
}

export function hasVerifiedEmail(user: User) {
  return Boolean(user.email && user.email_confirmed_at);
}

export async function readOnboardingProfile(
  client: SupabaseClient,
  userId: string,
) {
  const { data, error } = await client
    .from("profiles")
    .select("onboarding_completed_at, timezone")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    logSupabaseError("onboarding profile read failed", error);
    throw new OnboardingPersistenceError(
      "Your onboarding status could not be loaded. Apply the onboarding migration or try again.",
    );
  }

  return mapOnboardingProfile(data);
}

export async function getPostVerificationDestination(
  client: SupabaseClient,
  userId: string,
) {
  try {
    const state = await readOnboardingProfile(client, userId);
    return state.profileExists && !state.completed
      ? "/onboarding"
      : "/dashboard";
  } catch {
    // Verification itself must remain usable during a staggered deployment.
    // The protected onboarding route will fail closed until its migration is
    // installed, while established authentication still reaches Dashboard.
    return "/dashboard";
  }
}

export async function completeOwnedOnboarding(
  client: SupabaseClient,
  userId: string,
  completedAt = new Date().toISOString(),
) {
  const { data, error } = await client
    .from("profiles")
    .update({ onboarding_completed_at: completedAt })
    .eq("id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    logSupabaseError("onboarding completion update failed", error);
    throw new OnboardingPersistenceError();
  }

  if (!data) {
    throw new OnboardingPersistenceError(
      "Your profile is not ready yet. Please try again in a moment.",
    );
  }

  return completedAt;
}

export async function updateOwnedOnboardingTimezone(
  client: SupabaseClient,
  userId: string,
  timezone: string,
) {
  const { data, error } = await client
    .from("profiles")
    .update({ timezone })
    .eq("id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    logSupabaseError("onboarding timezone update failed", error);
    throw new OnboardingPersistenceError();
  }

  if (!data) {
    throw new OnboardingPersistenceError(
      "Your profile is not ready yet. Please try again in a moment.",
    );
  }
}

export async function findOwnedLibraryMovieByTmdbId(
  client: SupabaseClient,
  userId: string,
  tmdbId: number,
) {
  const { data, error } = await client
    .from("user_movies")
    .select("id, status, movies!inner(tmdb_id)")
    .eq("user_id", userId)
    .eq("movies.tmdb_id", tmdbId)
    .maybeSingle();

  if (error) {
    logSupabaseError("onboarding library lookup failed", error);
    throw new OnboardingPersistenceError(
      "That movie was saved, but its onboarding status could not be confirmed.",
    );
  }

  if (!data || typeof data.id !== "string") return null;
  return {
    libraryId: data.id,
    status: typeof data.status === "string" ? data.status : null,
  };
}

export async function readOwnedOnboardingMovieStates(
  client: SupabaseClient,
  userId: string,
  tmdbIds: number[],
) {
  if (tmdbIds.length === 0) return new Map<number, string>();

  const { data, error } = await client
    .from("user_movies")
    .select("status, movies!inner(tmdb_id)")
    .eq("user_id", userId)
    .in("movies.tmdb_id", tmdbIds);

  if (error) {
    logSupabaseError("onboarding movie-state read failed", error);
    return new Map<number, string>();
  }

  const states = new Map<number, string>();
  for (const row of Array.isArray(data) ? data : []) {
    const movieValue = (row as { movies?: unknown }).movies;
    const movie = Array.isArray(movieValue) ? movieValue[0] : movieValue;
    if (
      movie &&
      typeof movie === "object" &&
      typeof (movie as { tmdb_id?: unknown }).tmdb_id === "number" &&
      typeof (row as { status?: unknown }).status === "string"
    ) {
      states.set(
        (movie as { tmdb_id: number }).tmdb_id,
        (row as { status: string }).status,
      );
    }
  }
  return states;
}

export async function countOwnedOnboardingMovies(
  client: SupabaseClient,
  userId: string,
) {
  const { count, error } = await client
    .from("user_movies")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) {
    logSupabaseError("onboarding library count failed", error);
    throw new OnboardingPersistenceError(
      "Your movie progress could not be loaded. Please try again.",
    );
  }

  return count ?? 0;
}
