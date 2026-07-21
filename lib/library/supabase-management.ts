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

function asQueuePosition(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

async function getNextQueuePosition(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from("user_movies")
    .select("queue_position")
    .eq("user_id", userId)
    .eq("status", "watch_next")
    .not("queue_position", "is", null)
    .order("queue_position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throwUserMovieUpdateError("watch_next position lookup failed", error);
  }

  return (asQueuePosition(data?.queue_position) ?? 0) + 1;
}

async function normalizeAuthenticatedQueue(
  client: SupabaseClient,
  userId: string,
) {
  const { data, error } = await client
    .from("user_movies")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "watch_next")
    .order("queue_position", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    throwUserMovieUpdateError("watch_next queue lookup failed", error);
  }

  const queueIds = (data ?? [])
    .map((row) => (typeof row.id === "string" ? row.id : null))
    .filter((id): id is string => Boolean(id));

  if (queueIds.length === 0) {
    return;
  }

  const { error: clearError } = await client
    .from("user_movies")
    .update({ queue_position: null })
    .eq("user_id", userId)
    .eq("status", "watch_next");

  if (clearError) {
    throwUserMovieUpdateError("watch_next queue reset failed", clearError);
  }

  for (const [index, queueId] of queueIds.entries()) {
    const { error: positionError } = await client
      .from("user_movies")
      .update({ queue_position: index + 1 })
      .eq("id", queueId)
      .eq("user_id", userId);

    if (positionError) {
      throwUserMovieUpdateError(
        "watch_next queue resequencing failed",
        positionError,
      );
    }
  }
}

export async function updateAuthenticatedUserMovie(
  client: SupabaseClient,
  userId: string,
  libraryId: string,
  input: ValidatedMovieManagement,
) {
  const { data: current, error: lookupError } = await client
    .from("user_movies")
    .select("id, status, queue_position")
    .eq("id", libraryId)
    .eq("user_id", userId)
    .maybeSingle();

  if (lookupError) {
    throwUserMovieUpdateError("user_movies ownership lookup failed", lookupError);
  }

  if (!current) {
    return false;
  }

  const currentQueuePosition = asQueuePosition(current.queue_position);
  const queuePosition =
    input.status === "watch_next"
      ? current.status === "watch_next" && currentQueuePosition
        ? currentQueuePosition
        : await getNextQueuePosition(client, userId)
      : null;
  const payload = {
    status: input.status,
    personal_rating: input.personalRating,
    review: input.review,
    priority: input.priority,
    watched_at: input.watchedAt,
    would_watch_again: input.wouldWatchAgain,
    queue_position: queuePosition,
    scheduled_for:
      input.status === "scheduled" ? input.scheduledFor : null,
  };
  const { data, error } = await client
    .from("user_movies")
    .update(payload)
    .eq("id", libraryId)
    .eq("user_id", userId)
    .select(
      "id, status, personal_rating, review, priority, watched_at, would_watch_again",
    )
    .maybeSingle();

  if (error) {
    throwUserMovieUpdateError("user_movies management update failed", error);
  }

  if (!data) {
    return false;
  }

  if (current.status === "watch_next" || input.status === "watch_next") {
    await normalizeAuthenticatedQueue(client, userId);
  }

  return true;
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
  userId: string,
  libraryId: string,
  input: {
    scheduledFor: string;
    timezone: string;
    scheduleNote: string | null;
  },
) {
  const { data: current, error: lookupError } = await client
    .from("user_movies")
    .select("id, movie_id, status")
    .eq("id", libraryId)
    .eq("user_id", userId)
    .maybeSingle();

  if (lookupError) {
    throwUserMovieUpdateError("scheduled movie ownership lookup failed", lookupError);
  }

  if (!current) {
    return null;
  }

  const { data, error } = await client
    .from("user_movies")
    .update({
      status: "scheduled",
      scheduled_for: input.scheduledFor,
      schedule_timezone: input.timezone,
      schedule_note: input.scheduleNote,
      queue_position: null,
    })
    .eq("id", libraryId)
    .eq("user_id", userId)
    .select(
      "id, movie_id, status, scheduled_for, schedule_timezone, schedule_note",
    )
    .maybeSingle();

  if (error) {
    logSupabaseError("user_movies scheduling failed", error);

    if (
      error.code === "PGRST204" ||
      error.code === "42703" ||
      error.code === "PGRST202"
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

  if (!data) {
    return null;
  }

  const { error: profileError } = await client
    .from("profiles")
    .update({ timezone: input.timezone })
    .eq("id", userId);

  if (profileError) {
    logSupabaseError("profile timezone update failed", profileError);
  }

  if (current.status === "watch_next") {
    await normalizeAuthenticatedQueue(client, userId);
  }

  return {
    movieId:
      typeof data.movie_id === "string" || typeof data.movie_id === "number"
        ? String(data.movie_id)
        : "",
  };
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
