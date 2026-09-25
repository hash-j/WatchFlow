export class NotificationsPersistenceError extends Error {
  constructor(
    message = "Your notifications could not be updated. Please try again.",
  ) {
    super(message);
    this.name = "NotificationsPersistenceError";
  }
}

export class NotificationsAuthenticationError extends Error {
  constructor() {
    super("You must be signed in to manage notifications.");
    this.name = "NotificationsAuthenticationError";
  }
}

export class NotificationProducerError extends Error {
  constructor() {
    super("The system notification could not be created.");
    this.name = "NotificationProducerError";
  }
}
