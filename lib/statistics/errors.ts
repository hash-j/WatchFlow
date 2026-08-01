export class StatisticsAuthenticationError extends Error {
  constructor(message = "Please sign in again to view your statistics.") {
    super(message);
    this.name = "StatisticsAuthenticationError";
  }
}

export class StatisticsSchemaError extends Error {
  constructor(message = "Statistics are not configured for this library yet.") {
    super(message);
    this.name = "StatisticsSchemaError";
  }
}

export class StatisticsRelationshipError extends Error {
  constructor(message = "Movie metadata could not be linked to your library.") {
    super(message);
    this.name = "StatisticsRelationshipError";
  }
}

export class StatisticsAuthorizationError extends Error {
  constructor(message = "Your private statistics could not be accessed.") {
    super(message);
    this.name = "StatisticsAuthorizationError";
  }
}

export class StatisticsPersistenceError extends Error {
  constructor(message = "Your statistics could not be loaded. Please try again.") {
    super(message);
    this.name = "StatisticsPersistenceError";
  }
}

export function getSafeStatisticsErrorMessage(error: unknown) {
  if (error instanceof StatisticsAuthenticationError) {
    return "Please sign in again to view your statistics.";
  }

  if (error instanceof StatisticsSchemaError) {
    return "Statistics are unavailable because required library fields are missing.";
  }

  if (error instanceof StatisticsRelationshipError) {
    return "Movie metadata could not be linked to your library. Please try again.";
  }

  if (error instanceof StatisticsAuthorizationError) {
    return "Your private statistics could not be accessed. Please sign in again.";
  }

  if (error instanceof StatisticsPersistenceError) {
    return "Your statistics could not be loaded. Please try again.";
  }

  return "WatchFlow could not load this private Statistics page. Please try again.";
}
