export class OnboardingPersistenceError extends Error {
  constructor(
    message = "WatchFlow could not save your onboarding progress. Please try again.",
  ) {
    super(message);
    this.name = "OnboardingPersistenceError";
  }
}
