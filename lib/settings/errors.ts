export class SettingsAuthenticationError extends Error {
  constructor() {
    super("You must be signed in to manage settings.");
    this.name = "SettingsAuthenticationError";
  }
}

export class SettingsPersistenceError extends Error {
  constructor(message = "Your settings could not be saved. Please try again.") {
    super(message);
    this.name = "SettingsPersistenceError";
  }
}
