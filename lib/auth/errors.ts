import type { EmailOtpType } from "@supabase/supabase-js";

import {
  SUPABASE_BROWSER_CONFIGURATION_ERROR,
  SupabaseBrowserConfigurationError,
} from "@/lib/supabase/browser-config";

export const AUTH_ERROR_REASONS = [
  "invalid_link",
  "expired_link",
  "verification_failed",
  "recovery_session_required",
  "service_unavailable",
] as const;

export type AuthErrorReason = (typeof AUTH_ERROR_REASONS)[number];

export type AuthOperation =
  | "login"
  | "signup"
  | "password-reset-request"
  | "password-update";

const AUTH_ERROR_REASON_MESSAGES: Record<AuthErrorReason, string> = {
  invalid_link:
    "This authentication link is invalid or incomplete. Request a new link and try again.",
  expired_link:
    "This authentication link has expired. Request a new link and try again.",
  verification_failed:
    "WatchFlow could not verify this authentication link. Request a new link and try again.",
  recovery_session_required:
    "This password-reset session is missing or has expired. Request a new password-reset link.",
  service_unavailable:
    "WatchFlow could not reach the authentication service. Please try again shortly.",
};

const OPERATION_FALLBACKS: Record<AuthOperation, string> = {
  login: "WatchFlow could not sign you in. Please try again.",
  signup: "WatchFlow could not create your account. Please try again.",
  "password-reset-request":
    "WatchFlow could not send a password-reset request. Please try again.",
  "password-update":
    "WatchFlow could not update your password. Request a new reset link and try again.",
};

const EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

type ErrorShape = {
  code?: unknown;
  message?: unknown;
};

function errorShape(error: unknown): ErrorShape {
  return typeof error === "object" && error !== null
    ? (error as ErrorShape)
    : {};
}

function normalizedCode(error: unknown) {
  const code = errorShape(error).code;
  return typeof code === "string" ? code.toLocaleLowerCase("en-US") : "";
}

function normalizedMessage(error: unknown) {
  const message = errorShape(error).message;
  return typeof message === "string"
    ? message.toLocaleLowerCase("en-US")
    : "";
}

function isBrowserConfigurationError(error: unknown) {
  return (
    error instanceof SupabaseBrowserConfigurationError ||
    normalizedCode(error) ===
      SUPABASE_BROWSER_CONFIGURATION_ERROR.toLocaleLowerCase("en-US")
  );
}

function isNetworkError(error: unknown) {
  const message = normalizedMessage(error);
  return (
    error instanceof TypeError ||
    message.includes("failed to fetch") ||
    message.includes("network request") ||
    message.includes("networkerror")
  );
}

export function getControlledAuthErrorMessage(
  error: unknown,
  operation: AuthOperation,
) {
  if (isBrowserConfigurationError(error)) {
    return "WatchFlow authentication is not configured. Please contact support.";
  }

  if (isNetworkError(error)) {
    return "WatchFlow could not reach the authentication service. Check your connection and try again.";
  }

  const code = normalizedCode(error);
  const message = normalizedMessage(error);

  if (
    code === "invalid_credentials" ||
    message.includes("invalid login credentials")
  ) {
    return "Email or password is incorrect.";
  }

  if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
    return "Confirm your email before signing in.";
  }

  if (
    code === "user_already_exists" ||
    message.includes("already registered") ||
    message.includes("already exists")
  ) {
    return "An account with this email already exists. Try signing in.";
  }

  if (code === "weak_password" || message.includes("password should be at least")) {
    return "Use a stronger password with at least 8 characters.";
  }

  if (
    code === "over_request_rate_limit" ||
    code === "email_rate_limit_exceeded" ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  ) {
    return "Too many authentication attempts. Wait a moment and try again.";
  }

  if (code === "signup_disabled") {
    return "New account creation is unavailable right now.";
  }

  if (code === "same_password") {
    return "Choose a password you have not used for this account.";
  }

  return OPERATION_FALLBACKS[operation];
}

export function parseEmailOtpType(value: string | null): EmailOtpType | null {
  return value && EMAIL_OTP_TYPES.has(value as EmailOtpType)
    ? (value as EmailOtpType)
    : null;
}

export function parseAuthErrorReason(value: unknown): AuthErrorReason {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" &&
    (AUTH_ERROR_REASONS as readonly string[]).includes(candidate)
    ? (candidate as AuthErrorReason)
    : "verification_failed";
}

export function getAuthErrorReasonMessage(value: unknown) {
  return AUTH_ERROR_REASON_MESSAGES[parseAuthErrorReason(value)];
}

export function getAuthCallbackFailureReason(error: unknown): AuthErrorReason {
  if (isBrowserConfigurationError(error) || isNetworkError(error)) {
    return "service_unavailable";
  }

  const code = normalizedCode(error);
  const message = normalizedMessage(error);
  if (
    code === "otp_expired" ||
    code === "flow_state_expired" ||
    message.includes("expired")
  ) {
    return "expired_link";
  }

  return "verification_failed";
}

export function authErrorPath(reason: AuthErrorReason) {
  return `/auth/error?reason=${reason}`;
}
