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
