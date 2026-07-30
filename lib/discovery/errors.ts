export class DiscoveryAuthenticationError extends Error {
  constructor(message = "Please sign in again.") {
    super(message);
    this.name = "DiscoveryAuthenticationError";
  }
}

export class DiscoverySchemaError extends Error {
  constructor(
    message = "Your movie library is not configured for discovery yet.",
  ) {
    super(message);
    this.name = "DiscoverySchemaError";
  }
}

export class DiscoveryRelationshipError extends Error {
  constructor(
    message = "Movie metadata could not be linked to your library. Please try again.",
  ) {
    super(message);
    this.name = "DiscoveryRelationshipError";
  }
}

export class DiscoveryAuthorizationError extends Error {
  constructor(
    message = "Your private movie library could not be accessed. Please sign in again.",
  ) {
    super(message);
    this.name = "DiscoveryAuthorizationError";
  }
}

export class DiscoveryPersistenceError extends Error {
  constructor(message = "Your movie library could not be loaded. Please try again.") {
    super(message);
    this.name = "DiscoveryPersistenceError";
  }
}
