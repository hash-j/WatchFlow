import { PART_13_MIGRATION } from "./types";

export class ListsAuthenticationError extends Error {
  constructor(message = "Please sign in again.") {
    super(message);
    this.name = "ListsAuthenticationError";
  }
}

export class ListsValidationError extends Error {
  constructor(message = "The custom-list request was invalid.") {
    super(message);
    this.name = "ListsValidationError";
  }
}

export class ListsNotFoundError extends Error {
  constructor(message = "This list is no longer available.") {
    super(message);
    this.name = "ListsNotFoundError";
  }
}

export class ListsConflictError extends Error {
  constructor(message = "You already have a list with that name.") {
    super(message);
    this.name = "ListsConflictError";
  }
}

export class ListsAuthorizationError extends Error {
  constructor(
    message = "You do not have permission to change that custom list.",
  ) {
    super(message);
    this.name = "ListsAuthorizationError";
  }
}

export class ListsMissingTableError extends Error {
  constructor(
    message = `Custom lists are not configured yet. Apply ${PART_13_MIGRATION}.`,
  ) {
    super(message);
    this.name = "ListsMissingTableError";
  }
}

export class ListsMissingColumnError extends Error {
  constructor(
    message = `The custom-list schema is incomplete. Verify ${PART_13_MIGRATION}.`,
  ) {
    super(message);
    this.name = "ListsMissingColumnError";
  }
}

export class ListsMissingRpcError extends Error {
  constructor(
    message = `Custom-list ordering is not configured yet. Apply ${PART_13_MIGRATION}.`,
  ) {
    super(message);
    this.name = "ListsMissingRpcError";
  }
}

export class ListsSchemaCacheError extends Error {
  constructor(
    message = "Supabase has not refreshed the custom-list schema yet. Reload the PostgREST schema.",
  ) {
    super(message);
    this.name = "ListsSchemaCacheError";
  }
}

export class ListsPersistenceError extends Error {
  constructor(message = "Custom lists could not be updated. Please try again.") {
    super(message);
    this.name = "ListsPersistenceError";
  }
}

