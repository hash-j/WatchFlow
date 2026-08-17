import type { FieldErrors } from "./types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 100;

export function normalizeEmail(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLocaleLowerCase("en-US")
    : "";
}

export function normalizeOtp(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "").slice(0, 6) : "";
}

export type ValidSignUpInput = {
  fullName: string;
  email: string;
  password: string;
};

export type SignUpValidationResult =
  | { success: true; data: ValidSignUpInput }
  | {
      success: false;
      fields: FieldErrors;
      values: { fullName: string; email: string };
    };

export function validateSignUpForm(formData: FormData): SignUpValidationResult {
  const fullNameValue = formData.get("fullName");
  const emailValue = formData.get("email");
  const passwordValue = formData.get("password");
  const confirmPasswordValue = formData.get("confirmPassword");

  const fullName = typeof fullNameValue === "string" ? fullNameValue.trim() : "";
  const email = normalizeEmail(emailValue);
  const password = typeof passwordValue === "string" ? passwordValue : "";
  const confirmPassword =
    typeof confirmPasswordValue === "string" ? confirmPasswordValue : "";
  const fields: FieldErrors = {};

  if (!fullName) {
    fields.fullName = "Enter your full name.";
  } else if (fullName.length > MAX_NAME_LENGTH) {
    fields.fullName = "Full name must be 100 characters or fewer.";
  }

  if (!email) {
    fields.email = "Enter your email address.";
  } else if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    fields.email = "Enter a valid email address.";
  }

  if (!password) {
    fields.password = "Create a password.";
  } else if (password.length < 8) {
    fields.password = "Use at least 8 characters.";
  } else if (password.length > 72) {
    fields.password = "Use 72 characters or fewer.";
  }

  if (!confirmPassword) {
    fields.confirmPassword = "Confirm your password.";
  } else if (password !== confirmPassword) {
    fields.confirmPassword = "Passwords do not match.";
  }

  if (Object.keys(fields).length > 0) {
    return { success: false, fields, values: { fullName, email } };
  }

  return { success: true, data: { fullName, email, password } };
}

export function validateOtp(value: unknown) {
  const normalized = normalizeOtp(value);
  const original = typeof value === "string" ? value.trim() : "";

  if (!/^\d{6}$/.test(original) || normalized.length !== 6) {
    return {
      success: false as const,
      code: normalized,
      error: "Enter the complete 6-digit code.",
    };
  }

  return { success: true as const, code: normalized };
}

export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "your email";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}
