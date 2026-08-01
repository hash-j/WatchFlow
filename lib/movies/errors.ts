export class EmptyMovieQueryError extends Error {
  constructor() {
    super("Enter a movie title to search.");
    this.name = "EmptyMovieQueryError";
  }
}

export class MovieSearchValidationError extends Error {
  constructor() {
    super("Search titles must be 120 characters or fewer.");
    this.name = "MovieSearchValidationError";
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

export class MovieProviderError extends Error {
  constructor(message = "The movie service is unavailable. Please try again.") {
    super(message);
    this.name = "MovieProviderError";
  }
}

export class MovieProviderTimeoutError extends MovieProviderError {
  constructor() {
    super("The movie service took too long to respond. Please try again.");
    this.name = "MovieProviderTimeoutError";
  }
}

export class MovieProviderRateLimitError extends MovieProviderError {
  readonly retryAfterSeconds: number | null;

  constructor(retryAfterSeconds: number | null = null) {
    super(
      retryAfterSeconds && retryAfterSeconds > 0
        ? `Too many movie requests. Try again in ${retryAfterSeconds} seconds.`
        : "Too many movie requests. Wait a moment, then try again.",
    );
    this.name = "MovieProviderRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class MovieRateLimitConfigurationError extends MovieProviderError {
  constructor() {
    super(
      "Movie requests are temporarily unavailable because request protection is not configured.",
    );
    this.name = "MovieRateLimitConfigurationError";
  }
}
