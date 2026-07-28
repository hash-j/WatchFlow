import { z } from "zod";

import type { LibraryMovieStatus } from "@/lib/movies/types";

import {
  AuthenticationRequiredError,
  LibraryValidationError,
} from "./errors";
import type { AuthenticatedLibrarySession } from "./service";

export const MAX_LIBRARY_BULK_SIZE = 100;

export const BULK_LIBRARY_STATUSES = [
  "want_to_watch",
  "watch_next",
  "currently_watching",
  "watched",
  "on_hold",
  "dropped",
] as const satisfies readonly LibraryMovieStatus[];

export type BulkLibraryStatus = (typeof BULK_LIBRARY_STATUSES)[number];

export type BulkLibraryMutationResult = {
  success: boolean;
  requested: number;
  matched: number;
  affected: number;
  skipped: number;
  failed: number;
  reason: string | null;
};

export interface LibraryMutationDependencies {
  authenticate(): Promise<AuthenticatedLibrarySession | null>;
  setFavourite(
    session: AuthenticatedLibrarySession,
    libraryId: string,
    favourite: boolean,
  ): Promise<boolean>;
  bulkUpdateStatus(
    session: AuthenticatedLibrarySession,
    libraryIds: string[],
    status: BulkLibraryStatus,
  ): Promise<BulkLibraryMutationResult>;
  removeUserMovies(
    session: AuthenticatedLibrarySession,
    userMovieIds: string[],
  ): Promise<BulkLibraryMutationResult>;
}

const uuidSchema = z.string().uuid();
const favouriteSchema = z.union([z.boolean(), z.enum(["true", "false"])]);
const bulkStatusSchema = z.enum(BULK_LIBRARY_STATUSES);

function validationMessage(error: z.ZodError) {
  const first = error.issues[0];
  return first?.message || "The selected library data is invalid.";
}

export function validateLibrarySelection(value: unknown) {
  const result = z
    .array(uuidSchema)
    .min(1, "Select at least one movie.")
    .max(
      MAX_LIBRARY_BULK_SIZE,
      `Select no more than ${MAX_LIBRARY_BULK_SIZE} movies at once.`,
    )
    .safeParse(value);

  if (!result.success) {
    throw new LibraryValidationError(validationMessage(result.error));
  }

  if (new Set(result.data).size !== result.data.length) {
    throw new LibraryValidationError(
      "The movie selection contains duplicate records.",
    );
  }

  return result.data;
}

export function validateBulkLibraryStatus(value: unknown) {
  const result = bulkStatusSchema.safeParse(value);
  if (!result.success) {
    throw new LibraryValidationError(
      "Choose a supported bulk status. Scheduled movies require a date and time.",
    );
  }

  return result.data;
}

export function validateFavourite(value: unknown) {
  const result = favouriteSchema.safeParse(value);
  if (!result.success) {
    throw new LibraryValidationError("Choose a valid favourite state.");
  }

  return result.data === true || result.data === "true";
}

export function validateUserMovieId(value: unknown) {
  const result = uuidSchema.safeParse(value);
  if (!result.success) {
    throw new LibraryValidationError("The selected library record was invalid.");
  }

  return result.data;
}

async function requireMutationSession(
  dependencies: LibraryMutationDependencies,
) {
  const session = await dependencies.authenticate();
  if (!session?.userId) {
    throw new AuthenticationRequiredError();
  }

  return session;
}

export async function setLibraryMovieFavourite(
  libraryId: unknown,
  favourite: unknown,
  dependencies: LibraryMutationDependencies,
) {
  const session = await requireMutationSession(dependencies);
  return dependencies.setFavourite(
    session,
    validateUserMovieId(libraryId),
    validateFavourite(favourite),
  );
}

export async function bulkUpdateLibraryStatus(
  libraryIds: unknown,
  status: unknown,
  dependencies: LibraryMutationDependencies,
) {
  const session = await requireMutationSession(dependencies);
  return dependencies.bulkUpdateStatus(
    session,
    validateLibrarySelection(libraryIds),
    validateBulkLibraryStatus(status),
  );
}

export async function bulkRemoveLibraryMovies(
  libraryIds: unknown,
  dependencies: LibraryMutationDependencies,
) {
  const session = await requireMutationSession(dependencies);
  return dependencies.removeUserMovies(
    session,
    validateLibrarySelection(libraryIds),
  );
}

export async function removeLibraryMovie(
  userMovieId: unknown,
  dependencies: LibraryMutationDependencies,
) {
  const session = await requireMutationSession(dependencies);
  return dependencies.removeUserMovies(session, [
    validateUserMovieId(userMovieId),
  ]);
}
