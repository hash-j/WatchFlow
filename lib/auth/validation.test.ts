import { describe, expect, it } from "vitest";

import { maskEmail, normalizeEmail, normalizeOtp, validateOtp, validateSignUpForm } from "./validation";

function signupData(values: Partial<Record<string, string>> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) form.set(key, value);
  }
  return form;
}

describe("signup validation", () => {
  it("requires every signup field", () => {
    const result = validateSignUpForm(signupData());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fields).toMatchObject({
        fullName: expect.any(String),
        email: expect.any(String),
        password: expect.any(String),
        confirmPassword: expect.any(String),
      });
    }
  });

  it("normalizes email and trims the full name", () => {
    const result = validateSignUpForm(signupData({
      fullName: "  Aisha Khan  ",
      email: "  AISHA@Example.COM ",
      password: "long-password",
      confirmPassword: "long-password",
    }));
    expect(result).toEqual({
      success: true,
      data: {
        fullName: "Aisha Khan",
        email: "aisha@example.com",
        password: "long-password",
      },
    });
    expect(normalizeEmail("  USER@EXAMPLE.COM ")).toBe("user@example.com");
  });

  it("rejects password confirmation mismatch", () => {
    const result = validateSignUpForm(signupData({
      fullName: "Aisha Khan",
      email: "aisha@example.com",
      password: "long-password",
      confirmPassword: "other-password",
    }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.fields.confirmPassword).toBe("Passwords do not match.");
  });
});

describe("six-digit OTP validation", () => {
  it("accepts exactly six numeric digits", () => {
    expect(validateOtp("123456")).toEqual({ success: true, code: "123456" });
  });

  it.each(["12a456", "abcdef"])("rejects non-numeric input %s", (value) => {
    expect(validateOtp(value).success).toBe(false);
  });

  it("rejects a short code", () => {
    expect(validateOtp("12345").success).toBe(false);
  });

  it("rejects a long code", () => {
    expect(validateOtp("1234567").success).toBe(false);
  });

  it("normalizes pasted characters for the input without exceeding six digits", () => {
    expect(normalizeOtp(" 12-34 56 78 ")).toBe("123456");
  });

  it("masks pending email context", () => {
    expect(maskEmail("hashim@gmail.com")).toBe("ha***@gmail.com");
  });
});
