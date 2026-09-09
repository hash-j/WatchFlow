import { describe, expect, it } from "vitest";

import { SupabaseBrowserConfigurationError } from "@/lib/supabase/browser-config";

import {
  authErrorPath,
  getAuthCallbackFailureReason,
  getAuthErrorReasonMessage,
  getControlledAuthErrorMessage,
  getLoginErrorPresentation,
  parseAuthErrorReason,
  parseEmailOtpType,
} from "./errors";

describe("controlled authentication errors", () => {
  it("maps provider errors to known copy without returning raw messages", () => {
    const rawMessage =
      "Internal provider detail for user 11111111-1111-4111-8111-111111111111";

    const message = getControlledAuthErrorMessage(
      { code: "unexpected_provider_code", message: rawMessage },
      "login",
    );

    expect(message).toBe("WatchFlow could not sign you in. Please try again.");
    expect(message).not.toContain(rawMessage);
  });

  it("maps configuration and network failures explicitly", () => {
    expect(
      getControlledAuthErrorMessage(
        new SupabaseBrowserConfigurationError(),
        "login",
      ),
    ).toBe(
      "WatchFlow authentication is not configured. Please contact support.",
    );
    expect(
      getControlledAuthErrorMessage(
        new TypeError("Failed to fetch"),
        "password-reset-request",
      ),
    ).toBe(
      "WatchFlow could not reach the authentication service. Check your connection and try again.",
    );
  });

  it("maps known authentication codes to stable user-facing messages", () => {
    expect(
      getControlledAuthErrorMessage(
        { code: "invalid_credentials", message: "provider copy" },
        "login",
      ),
    ).toBe(
      "The email or password you entered doesn’t match our records. Check your details and try again.",
    );
    expect(
      getControlledAuthErrorMessage(
        { code: "email_not_confirmed", message: "provider copy" },
        "login",
      ),
    ).toBe("Confirm your email before signing in.");
    expect(
      getControlledAuthErrorMessage(
        { code: "email_rate_limit_exceeded", message: "provider copy" },
        "signup",
      ),
    ).toBe("Too many authentication attempts. Wait a moment and try again.");
    expect(
      getControlledAuthErrorMessage(
        { code: "user_already_exists", message: "provider copy" },
        "signup",
      ),
    ).toBe("An account with this email already exists. Try signing in.");
    expect(
      getControlledAuthErrorMessage(
        { code: "weak_password", message: "provider copy" },
        "signup",
      ),
    ).toBe("Use a stronger password with at least 8 characters.");
  });

  it("maps invalid credentials to professional private login feedback", () => {
    expect(
      getLoginErrorPresentation({
        code: "invalid_credentials",
        message: "provider copy",
      }),
    ).toEqual({
      kind: "invalid_credentials",
      title: "We couldn’t sign you in",
      message:
        "The email or password you entered doesn’t match our records. Check your details and try again.",
    });

    expect(
      getLoginErrorPresentation({ message: "Invalid login credentials" }),
    ).toMatchObject({
      kind: "invalid_credentials",
      title: "We couldn’t sign you in",
    });
  });

  it("preserves specialized non-credential login failures", () => {
    expect(
      getLoginErrorPresentation({ code: "email_not_confirmed" }),
    ).toEqual({
      kind: "other",
      title: null,
      message: "Confirm your email before signing in.",
    });
    expect(
      getLoginErrorPresentation({ code: "over_request_rate_limit" }),
    ).toEqual({
      kind: "other",
      title: null,
      message: "Too many authentication attempts. Wait a moment and try again.",
    });
  });

  it("allow-lists supported OTP types", () => {
    expect(parseEmailOtpType("signup")).toBe("signup");
    expect(parseEmailOtpType("recovery")).toBe("recovery");
    expect(parseEmailOtpType("email_change")).toBe("email_change");
    expect(parseEmailOtpType("service_role")).toBeNull();
    expect(parseEmailOtpType(null)).toBeNull();
  });

  it("uses stable callback reason codes and controlled copy", () => {
    expect(
      getAuthCallbackFailureReason({
        code: "otp_expired",
        message: "raw provider detail",
      }),
    ).toBe("expired_link");
    expect(parseAuthErrorReason("invalid_link")).toBe("invalid_link");
    expect(parseAuthErrorReason("raw-provider-message")).toBe(
      "verification_failed",
    );
    expect(authErrorPath("expired_link")).toBe(
      "/auth/error?reason=expired_link",
    );
    expect(getAuthErrorReasonMessage("raw-provider-message")).toBe(
      "WatchFlow could not verify this authentication link. Request a new link and try again.",
    );
  });
});
