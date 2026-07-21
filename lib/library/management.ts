import type { LibraryMovieStatus } from "../movies/types";
import { LIBRARY_MOVIE_STATUSES } from "../movies/types";
import {
  AuthenticationRequiredError,
  LibraryValidationError,
} from "./errors";
import { isDatabaseIdentifier } from "./mapping";
import type { QueueDirection } from "./queue";
import {
  isValidDateInput,
  isValidTimeZone,
  zonedDateTimeToIso,
} from "./timezone";
import type { AuthenticatedLibrarySession } from "./service";

const MAX_REVIEW_LENGTH = 5_000;
const MAX_SCHEDULE_NOTE_LENGTH = 1_000;

export type MovieManagementInput = {
  status: unknown;
  personalRating: unknown;
  review: unknown;
  priority: unknown;
  wouldWatchAgain: unknown;
  watchedDate: unknown;
  scheduledDate: unknown;
  scheduledTime: unknown;
  timezone: unknown;
  scheduleNote: unknown;
};

export type ValidatedMovieManagement = {
  status: LibraryMovieStatus;
  personalRating: number | null;
  review: string | null;
  priority: number;
  wouldWatchAgain: boolean;
  watchedAt: string | null;
  scheduledFor: string | null;
  timezone: string | null;
  scheduleNote: string | null;
};

export type ScheduleInput = {
  scheduledDate: unknown;
  scheduledTime: unknown;
  timezone: unknown;
  scheduleNote: unknown;
};

export interface MovieManagementDependencies {
  authenticate(): Promise<AuthenticatedLibrarySession | null>;
  updateMovie(
    session: AuthenticatedLibrarySession,
    libraryId: string,
    input: ValidatedMovieManagement,
  ): Promise<boolean>;
  moveQueueMovie(
    session: AuthenticatedLibrarySession,
    libraryId: string,
    direction: QueueDirection,
  ): Promise<boolean>;
  scheduleMovie(
    session: AuthenticatedLibrarySession,
    libraryId: string,
    input: {
      scheduledFor: string;
      timezone: string;
      scheduleNote: string | null;
    },
  ): Promise<{ movieId: string } | null>;
}

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function requireSession(dependencies: MovieManagementDependencies) {
  return dependencies.authenticate().then((session) => {
    if (!session?.userId) {
      throw new AuthenticationRequiredError();
    }

    return session;
  });
}

function validateLibraryId(libraryId: string) {
  if (!isDatabaseIdentifier(libraryId)) {
    throw new LibraryValidationError("That library item is invalid.");
  }
}

function validateUserMovieId(libraryId: string) {
  if (!libraryId) {
    throw new LibraryValidationError("Select a movie to schedule.");
  }

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      libraryId,
    )
  ) {
    throw new LibraryValidationError("The selected movie is invalid.");
  }
}

export function validatePersonalRating(value: unknown) {
  const input = asTrimmedString(value);

  if (!input) {
    return null;
  }

  const rating = Number(input);

  if (!Number.isFinite(rating) || rating < 0 || rating > 10) {
    throw new LibraryValidationError(
      "Personal rating must be between 0 and 10.",
    );
  }

  return rating;
}

function validatePriority(value: unknown) {
  const input = asTrimmedString(value);
  const priority = Number(input);

  if (
    !input ||
    !Number.isSafeInteger(priority) ||
    priority < 0 ||
    priority > 5
  ) {
    throw new LibraryValidationError("Priority must be a whole number from 0 to 5.");
  }

  return priority;
}

export function validateLibraryMovieStatus(value: unknown): LibraryMovieStatus {
  if (
    typeof value !== "string" ||
    !LIBRARY_MOVIE_STATUSES.includes(value as LibraryMovieStatus)
  ) {
    throw new LibraryValidationError("Choose a valid movie status.");
  }

  return value as LibraryMovieStatus;
}

export function validateWouldWatchAgain(value: unknown) {
  if (value === true || value === "true" || value === "on") {
    return true;
  }

  if (
    value === false ||
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return false;
  }

  throw new LibraryValidationError("Choose a valid rewatch preference.");
}

function validateOptionalText(value: unknown, maximum: number, label: string) {
  const text = asTrimmedString(value);

  if (text.length > maximum) {
    throw new LibraryValidationError(`${label} is too long.`);
  }

  return text || null;
}

function validateWatchedAt(value: unknown) {
  const date = asTrimmedString(value);

  if (!date) {
    return null;
  }

  if (!isValidDateInput(date)) {
    throw new LibraryValidationError("Choose a valid watched date.");
  }

  return `${date}T00:00:00.000Z`;
}

export function validateScheduleInput(
  input: ScheduleInput,
  now = new Date(),
) {
  const scheduledDate = asTrimmedString(input.scheduledDate);
  const scheduledTime = asTrimmedString(input.scheduledTime);
  const timezone = asTrimmedString(input.timezone);

  if (!scheduledDate) {
    throw new LibraryValidationError("Choose a scheduled date.");
  }

  if (!scheduledTime) {
    throw new LibraryValidationError("Choose a scheduled time.");
  }

  if (!isValidTimeZone(timezone)) {
    throw new LibraryValidationError("Choose a valid IANA timezone.");
  }

  const scheduledFor = zonedDateTimeToIso(
    scheduledDate,
    scheduledTime,
    timezone,
  );

  if (new Date(scheduledFor).getTime() <= now.getTime()) {
    throw new LibraryValidationError("Choose a scheduled time in the future.");
  }

  return {
    scheduledFor,
    timezone,
    scheduleNote: validateOptionalText(
      input.scheduleNote,
      MAX_SCHEDULE_NOTE_LENGTH,
      "Schedule note",
    ),
  };
}

export function validateMovieManagementInput(
  input: MovieManagementInput,
): ValidatedMovieManagement {
  const status = validateLibraryMovieStatus(input.status);
  const schedule =
    status === "scheduled" ? validateScheduleInput(input) : null;

  return {
    status,
    personalRating: validatePersonalRating(input.personalRating),
    review: validateOptionalText(input.review, MAX_REVIEW_LENGTH, "Review"),
    priority: validatePriority(input.priority),
    wouldWatchAgain: validateWouldWatchAgain(input.wouldWatchAgain),
    watchedAt: validateWatchedAt(input.watchedDate),
    scheduledFor: schedule?.scheduledFor ?? null,
    timezone: schedule?.timezone ?? null,
    scheduleNote: schedule?.scheduleNote ?? null,
  };
}

export async function updateLibraryMovie(
  libraryId: string,
  input: MovieManagementInput,
  dependencies: MovieManagementDependencies,
) {
  const session = await requireSession(dependencies);
  validateLibraryId(libraryId);
  return dependencies.updateMovie(
    session,
    libraryId,
    validateMovieManagementInput(input),
  );
}

export async function moveLibraryQueueMovie(
  libraryId: string,
  direction: unknown,
  dependencies: MovieManagementDependencies,
) {
  const session = await requireSession(dependencies);
  validateLibraryId(libraryId);

  if (direction !== "up" && direction !== "down") {
    throw new LibraryValidationError("Choose a valid queue direction.");
  }

  return dependencies.moveQueueMovie(session, libraryId, direction);
}

export async function scheduleLibraryMovie(
  libraryId: string,
  input: ScheduleInput,
  dependencies: MovieManagementDependencies,
) {
  const session = await requireSession(dependencies);
  validateUserMovieId(libraryId);
  return dependencies.scheduleMovie(
    session,
    libraryId,
    validateScheduleInput(input),
  );
}
