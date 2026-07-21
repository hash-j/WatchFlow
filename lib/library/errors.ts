export class AuthenticationRequiredError extends Error {
  constructor() {
    super("You must be signed in to manage your library.");
    this.name = "AuthenticationRequiredError";
  }
}

export class LibraryPersistenceError extends Error {
  constructor(message = "Your library could not be updated. Please try again.") {
    super(message);
    this.name = "LibraryPersistenceError";
  }
}

export class LibraryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LibraryValidationError";
  }
}

export class LibraryAuthorizationError extends Error {
  constructor() {
    super("You do not have permission to update that library item.");
    this.name = "LibraryAuthorizationError";
  }
}

export class LibraryConstraintError extends Error {
  constructor() {
    super("Those movie details conflict with a database rule.");
    this.name = "LibraryConstraintError";
  }
}

export class LibrarySchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LibrarySchemaError";
  }
}
