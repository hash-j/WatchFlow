import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logSupabaseError } from "@/lib/supabase/error-logging";
import { createClient } from "@/lib/supabase/server";
import {
  createMovieStatusTransitionNotification,
  isMovieStatusNotificationTarget,
  readOwnedMovieStatusTransitionSnapshots,
  type MovieStatusTransitionSnapshot,
} from "@/lib/notifications/supabase-notifications";

import {
  LibraryAuthorizationError,
  LibraryConstraintError,
  LibraryPersistenceError,
  LibrarySchemaError,
  LibraryValidationError,
} from "./errors";
import type {
  BulkLibraryMutationResult,
  BulkLibraryStatus,
  LibraryMutationDependencies,
} from "./mutations";
import type { AuthenticatedLibrarySession } from "./service";

type MutationSession = AuthenticatedLibrarySession & {
  client: SupabaseClient;
};

type SupabaseMutationError = {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function count(value: unknown) {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : null;
}

function mutationClient(session: AuthenticatedLibrarySession) {
  return session as MutationSession;
}

async function authenticate(): Promise<MutationSession | null> {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    return null;
  }

  return { userId: user.id, client };
}

function throwMutationError(
  operation: string,
  error: SupabaseMutationError,
): never {
  logSupabaseError(operation, error);

  if (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    error.code === "42703"
  ) {
    throw new LibrarySchemaError(
      "Library improvements are not configured yet. Apply the Part 12 migration.",
    );
  }

  if (error.code === "42501") {
    throw new LibraryAuthorizationError();
  }

  if (error.code === "22023") {
    throw new LibraryValidationError("The bulk library request is invalid.");
  }

  if (typeof error.code === "string" && error.code.startsWith("23")) {
    throw new LibraryConstraintError();
  }

  throw new LibraryPersistenceError(
    "Your selected movies could not be updated. Please try again.",
  );
}

function mapBulkResult(
  value: unknown,
  affectedKey: "updated" | "deleted",
): BulkLibraryMutationResult {
  if (!isRecord(value)) {
    throw new LibraryPersistenceError(
      "The library update returned an invalid response. Please try again.",
    );
  }

  const requested = count(value.requested);
  const matched = count(value.matched);
  const affected = count(value[affectedKey]);
  const skipped = count(value.skipped);
  const failed = count(value.failed);

  if (
    requested === null ||
    matched === null ||
    affected === null ||
    skipped === null ||
    failed === null
  ) {
    throw new LibraryPersistenceError(
      "The library update returned an invalid response. Please try again.",
    );
  }

  return {
    success: value.success === true,
    requested,
    matched,
    affected,
    skipped,
    failed,
    reason: typeof value.reason === "string" ? value.reason : null,
  };
}

async function setFavourite(
  session: AuthenticatedLibrarySession,
  libraryId: string,
  favourite: boolean,
) {
  const { client, userId } = mutationClient(session);
  const { data, error } = await client
    .from("user_movies")
    .update({ favourite })
    .eq("id", libraryId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    throwMutationError("user_movies favourite update failed", error);
  }

  return Boolean(data);
}

async function bulkUpdateStatus(
  session: AuthenticatedLibrarySession,
  libraryIds: string[],
  status: BulkLibraryStatus,
) {
  const { client, userId } = mutationClient(session);
  let snapshots: MovieStatusTransitionSnapshot[] = [];
  if (isMovieStatusNotificationTarget(status)) {
    try {
      snapshots = await readOwnedMovieStatusTransitionSnapshots(
        client,
        userId,
        libraryIds,
      );
    } catch {
      // Notification production is best-effort and must not block the bulk update.
    }
  }
  const { data, error } = await client.rpc(
    "watchflow_bulk_update_library_status",
    {
      p_user_movie_ids: libraryIds,
      p_status: status,
    },
  );

  if (error) {
    throwMutationError("user_movies bulk status update failed", error);
  }

  const result = mapBulkResult(data, "updated");
  if (result.success && snapshots.length > 0) {
    await Promise.allSettled(
      snapshots.map((snapshot) =>
        createMovieStatusTransitionNotification({
          verifiedUserId: userId,
          snapshot,
          nextStatus: status,
        }),
      ),
    );
  }

  return result;
}

async function removeUserMovies(
  session: AuthenticatedLibrarySession,
  userMovieIds: string[],
) {
  const { client } = mutationClient(session);
  const { data, error } = await client.rpc(
    "watchflow_bulk_remove_library_movies",
    {
      p_user_movie_ids: userMovieIds,
    },
  );

  if (error) {
    throwMutationError("user_movies bulk removal failed", error);
  }

  return mapBulkResult(data, "deleted");
}

export function createSupabaseLibraryMutationDependencies(): LibraryMutationDependencies {
  return {
    authenticate,
    setFavourite,
    bulkUpdateStatus,
    removeUserMovies,
  };
}
