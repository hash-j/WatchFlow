type AuthErrorShape = {
  code?: unknown;
  message?: unknown;
  status?: unknown;
};

function shape(error: unknown): AuthErrorShape {
  return typeof error === "object" && error !== null
    ? (error as AuthErrorShape)
    : {};
}

function code(error: unknown) {
  const value = shape(error).code;
  return typeof value === "string" ? value.toLocaleLowerCase("en-US") : "";
}

function message(error: unknown) {
  const value = shape(error).message;
  return typeof value === "string"
    ? value.toLocaleLowerCase("en-US")
    : "";
}

function isRateLimited(error: unknown) {
  const normalizedCode = code(error);
  const normalizedMessage = message(error);
  return (
    shape(error).status === 429 ||
    normalizedCode === "over_request_rate_limit" ||
    normalizedCode === "over_email_send_rate_limit" ||
    normalizedCode === "email_rate_limit_exceeded" ||
    normalizedMessage.includes("rate limit") ||
    normalizedMessage.includes("too many requests")
  );
}

function isNetworkFailure(error: unknown) {
  const normalizedMessage = message(error);
  return (
    error instanceof TypeError ||
    normalizedMessage.includes("failed to fetch") ||
    normalizedMessage.includes("network request") ||
    normalizedMessage.includes("networkerror")
  );
}

export function isExistingAccountError(error: unknown) {
  const normalizedCode = code(error);
  if (
    normalizedCode === "user_already_exists" ||
    normalizedCode === "email_exists"
  ) {
    return true;
  }

  const normalizedMessage = message(error);
  return (
    normalizedMessage.includes("already registered") ||
    normalizedMessage.includes("already exists")
  );
}

export function getSignUpErrorMessage(error: unknown) {
  if (isRateLimited(error)) {
    return "Too many signup attempts. Please wait and try again.";
  }
  if (isNetworkFailure(error)) {
    return "WatchFlow could not reach the authentication service. Check your connection and try again.";
  }
  if (code(error) === "weak_password" || message(error).includes("password should be")) {
    return "That password does not meet the current security requirements.";
  }
  if (code(error) === "signup_disabled") {
    return "New account creation is unavailable right now.";
  }
  return "WatchFlow could not complete signup. Please try again.";
}

export function getVerificationErrorMessage(error: unknown) {
  const normalizedCode = code(error);
  const normalizedMessage = message(error);

  if (isRateLimited(error)) {
    return "Too many attempts. Please wait and try again.";
  }
  if (isNetworkFailure(error)) {
    return "We could not reach the verification service. Check your connection and try again.";
  }
  if (
    normalizedMessage.includes("already used") ||
    normalizedCode === "refresh_token_already_used"
  ) {
    return "That code has already been used. Return to login or request a new code.";
  }
  if (
    normalizedCode === "otp_expired" ||
    normalizedCode === "flow_state_expired" ||
    normalizedMessage.includes("expired")
  ) {
    return "This code has expired. Request a new one.";
  }
  if (
    normalizedMessage.includes("already confirmed") ||
    normalizedMessage.includes("already verified")
  ) {
    return "This account is already verified. Return to login to continue.";
  }
  if (
    normalizedCode === "invalid_credentials" ||
    normalizedCode === "verification_failed" ||
    normalizedMessage.includes("invalid token") ||
    normalizedMessage.includes("token is invalid")
  ) {
    return "That code doesn’t look right. Check the email and try again.";
  }
  return "We could not verify that code. Check it and try again.";
}

export function getResendErrorMessage(error: unknown) {
  if (isRateLimited(error)) {
    return "Too many requests. Please wait before requesting another code, or sign in or reset your password.";
  }
  if (isNetworkFailure(error)) {
    return "We could not reach the email service. Check your connection, try again, or use sign in or password reset.";
  }
  return "We could not send a new code. Try again later, sign in, or reset your password.";
}
