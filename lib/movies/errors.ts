export class EmptyMovieQueryError extends Error {
  constructor() {
    super("Enter a movie title to search.");
    this.name = "EmptyMovieQueryError";
  }
}

export class InvalidMovieIdError extends Error {
  constructor() {
    super("The selected movie ID is invalid.");
    this.name = "InvalidMovieIdError";
  }
}

export class MovieNotFoundError extends Error {
  constructor() {
    super("That movie could not be found.");
    this.name = "MovieNotFoundError";
  }
}

export class AdultMovieExcludedError extends Error {
  constructor() {
    super("Adult titles are not available in WatchFlow search.");
    this.name = "AdultMovieExcludedError";
  }
}

export class MovieProviderTimeoutError extends Error {
  constructor() {
    super("The movie service took too long to respond. Please try again.");
    this.name = "MovieProviderTimeoutError";
  }
}

export class MovieProviderError extends Error {
  constructor(message = "The movie service is unavailable. Please try again.") {
    super(message);
    this.name = "MovieProviderError";
  }
}
