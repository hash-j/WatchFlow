import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logSupabaseError } from "../supabase/error-logging";
import { createClient } from "../supabase/server";
import {
  LibraryAuthorizationError,
  LibraryConstraintError,
  LibraryPersistenceError,
  LibrarySchemaError,
} from "./errors";
import type {
  MovieManagementDependencies,
  ValidatedMovieManagement,
} from "./management";
import type { QueueDirection } from "./queue";
import type { AuthenticatedLibrarySession } from "./service";

type SupabaseManagementSession = AuthenticatedLibrarySession & {
  client: SupabaseClient;
};

function getSessionClient(session: AuthenticatedLibrarySession) {
  return session as SupabaseManagementSession;
}

async function authenticate(): Promise<SupabaseManagementSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return { userId: user.id, client: supabase };
}

type SupabaseMutationError = {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
};

function throwUserMovieUpdateError(
  operation: string,
  error: SupabaseMutationError,
): never {
  logSupabaseError(operation, error);

  if (error.code === "42501") {
    throw new LibraryAuthorizationError();
  }

  if (typeof error.code === "string" && error.code.startsWith("23")) {
    throw new LibraryConstraintError();
  }

  throw new LibraryPersistenceError(
    "Your movie changes could not be saved. Please try again.",
  );
}

export async function updateAuthenticatedUserMovie(
  client: SupabaseClient,
  userId: string,
  libraryId: string,
  input: ValidatedMovieManagement,
) {
  if (!userId) {
    return false;
  }

  let personalRating = input.personalRating;
  let priority = input.priority;
  let wouldWatchAgain = input.wouldWatchAgain;
  if (
    input.preservePersonalRating ||
    input.preservePriority ||
    input.preserveWouldWatchAgain
  ) {
    const { data: current, error: currentError } = await client
      .from("user_movies")
      .select("personal_rating,priority,would_watch_again")
      .eq("id", libraryId)
      .eq("user_id", userId)
      .maybeSingle();

    if (currentError) {
      throwUserMovieUpdateError(
        "user_movies hidden metadata preservation lookup failed",
        currentError,
      );
    }
    if (!current) return false;

    if (input.preservePersonalRating) {
      personalRating =
        typeof current.personal_rating === "number"
          ? current.personal_rating
          : null;
    }
    if (input.preservePriority) {
      priority =
        typeof current.priority === "number" ? current.priority : 0;
    }
    if (input.preserveWouldWatchAgain) {
      wouldWatchAgain = current.would_watch_again === true;
    }
  }

  const { data, error } = await client.rpc(
    "watchflow_update_library_movie_v2",
    {
      p_library_id: libraryId,
      p_status: input.status,
      p_personal_rating: personalRating,
      p_review: input.review,
      p_priority: priority,
      p_would_watch_again: wouldWatchAgain,
      p_watched_at: input.watchedAt,
      p_watched_at_provided: input.watchedAtProvided,
      p_scheduled_for: input.scheduledFor,
      p_timezone: input.timezone,
      p_schedule_note: input.scheduleNote,
    },
  );

  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      logSupabaseError("atomic user_movies management RPC missing", error);
      throw new LibrarySchemaError(
        "Movie management is not configured yet. Apply the schedule and queue migration.",
      );
    }
    throwUserMovieUpdateError("atomic user_movies management update failed", error);
  }

  return data === true;
}

async function updateMovie(
  session: AuthenticatedLibrarySession,
  libraryId: string,
  input: ValidatedMovieManagement,
) {
  const { client, userId } = getSessionClient(session);
  return updateAuthenticatedUserMovie(client, userId, libraryId, input);
}

async function moveQueueMovie(
  session: AuthenticatedLibrarySession,
  libraryId: string,
  direction: QueueDirection,
) {
  const { client } = getSessionClient(session);
  const { data, error } = await client.rpc("move_watch_queue_item", {
    p_user_movie_id: libraryId,
    p_direction: direction,
  });

  if (error) {
    logSupabaseError("watch_next queue move failed", error);

    if (error.code === "PGRST202" || error.code === "42883") {
      throw new LibrarySchemaError(
        "The Watch Next queue migration has not been applied.",
      );
    }

    if (error.code === "42501") {
      throw new LibraryAuthorizationError();
    }

    if (typeof error.code === "string" && error.code.startsWith("23")) {
      throw new LibraryConstraintError();
    }

    throw new LibraryPersistenceError(
      "The Watch Next queue could not be reordered. Please try again.",
    );
  }

  return (
    typeof data === "object" &&
    data !== null &&
    "success" in data &&
    data.success === true
  );
}

export async function scheduleAuthenticatedUserMovie(
  client: SupabaseClient,
  _userId: string,
  libraryId: string,
  input: {
    scheduledFor: string;
    timezone: string;
    scheduleNote: string | null;
  },
) {
  const { data, error } = await client.rpc("watchflow_schedule_movie", {
    p_library_id: libraryId,
    p_scheduled_for: input.scheduledFor,
    p_timezone: input.timezone,
    p_schedule_note: input.scheduleNote,
  });

  if (error) {
    logSupabaseError("user_movies scheduling failed", error);

    if (
      error.code === "PGRST204" ||
      error.code === "42703" ||
      error.code === "PGRST202" ||
      error.code === "42883"
    ) {
      throw new LibrarySchemaError(
        "Scheduling is not configured yet. Apply the schedule and queue migration.",
      );
    }

    if (error.code === "42501") {
      throw new LibraryAuthorizationError();
    }

    if (typeof error.code === "string" && error.code.startsWith("23")) {
      throw new LibraryConstraintError();
    }

    throw new LibraryPersistenceError(
      "The movie could not be scheduled. Please try again.",
    );
  }

  if (data !== true) {
    return null;
  }

  return { movieId: "" };
}

async function scheduleMovie(
  session: AuthenticatedLibrarySession,
  libraryId: string,
  input: {
    scheduledFor: string;
    timezone: string;
    scheduleNote: string | null;
  },
) {
  const { client, userId } = getSessionClient(session);
  return scheduleAuthenticatedUserMovie(client, userId, libraryId, input);
}

export function createSupabaseManagementDependencies(): MovieManagementDependencies {
  return {
    authenticate,
    updateMovie,
    moveQueueMovie,
    scheduleMovie,
  };
}
