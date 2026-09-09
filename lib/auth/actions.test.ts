import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getPending: vi.fn(),
  setPending: vi.fn(),
  clearPending: vi.fn(),
  getPostVerificationDestination: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/onboarding/supabase-onboarding", () => ({
  getPostVerificationDestination: mocks.getPostVerificationDestination,
}));
vi.mock("./pending-verification", async () => {
  const actual = await vi.importActual<typeof import("./pending-verification")>("./pending-verification");
  return {
    ...actual,
    getPendingVerification: mocks.getPending,
    setPendingVerification: mocks.setPending,
    clearPendingVerification: mocks.clearPending,
  };
});

import { changeVerificationEmailAction, resendVerificationAction, signUpAction, verifyEmailAction } from "./actions";
import { INITIAL_SIGN_UP_STATE, INITIAL_VERIFICATION_STATE } from "./types";

const pending = {
  email: "user@example.com",
  expiresAt: Date.now() + 60_000,
  resendAvailableAt: Date.now() - 1,
};

function form(values: Record<string, string>) {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

function validSignupForm() {
  return form({
    fullName: "Aisha Khan",
    email: " USER@Example.com ",
    password: "long-password",
    confirmPassword: "long-password",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPending.mockResolvedValue(pending);
  mocks.getPostVerificationDestination.mockResolvedValue("/onboarding");
});

describe("signup action", () => {
  it("creates pending verification with normalized email and profile metadata", async () => {
    const signUp = vi.fn().mockResolvedValue({ data: { user: {}, session: null }, error: null });
    mocks.createClient.mockResolvedValue({ auth: { signUp } });

    await expect(signUpAction(INITIAL_SIGN_UP_STATE, validSignupForm())).rejects.toThrow("REDIRECT:/auth/verify-email");
    expect(signUp).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "long-password",
      options: { data: { full_name: "Aisha Khan" } },
    });
    expect(mocks.setPending).toHaveBeenCalledWith("user@example.com");
  });

  it.each(["user_already_exists", "email_exists"])(
    "keeps %s on signup without creating pending verification",
    async (code) => {
      mocks.createClient.mockResolvedValue({
        auth: {
          signUp: vi.fn().mockResolvedValue({
            data: null,
            error: { code, message: "provider detail must stay private" },
          }),
        },
      });

      const result = await signUpAction(
        INITIAL_SIGN_UP_STATE,
        validSignupForm(),
      );

      expect(result).toMatchObject({
        error: "An account with this email already exists.",
        errorKind: "account_exists",
        values: { fullName: "Aisha Khan", email: "user@example.com" },
      });
      expect(mocks.setPending).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    },
  );

  it("supports the legacy registered-user message without exposing it", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "User already registered" },
        }),
      },
    });

    const result = await signUpAction(
      INITIAL_SIGN_UP_STATE,
      validSignupForm(),
    );

    expect(result.errorKind).toBe("account_exists");
    expect(result.error).toBe("An account with this email already exists.");
    expect(mocks.setPending).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("treats an obfuscated existing-user-compatible response like a new signup", async () => {
    const signUp = vi.fn().mockResolvedValue({
      data: { user: { identities: [] }, session: null },
      error: null,
    });
    mocks.createClient.mockResolvedValue({ auth: { signUp } });

    await expect(
      signUpAction(INITIAL_SIGN_UP_STATE, validSignupForm()),
    ).rejects.toThrow("REDIRECT:/auth/verify-email");
    expect(mocks.setPending).toHaveBeenCalledWith("user@example.com");
  });

  it("maps generic signup failures without exposing provider details", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "unexpected_provider_error", message: "private" },
        }),
      },
    });

    const result = await signUpAction(
      INITIAL_SIGN_UP_STATE,
      validSignupForm(),
    );

    expect(result).toMatchObject({
      error: "WatchFlow could not complete signup. Please try again.",
      errorKind: null,
    });
    expect(result.error).not.toContain("private");
    expect(mocks.setPending).not.toHaveBeenCalled();
  });

  it("refuses a provider session when email confirmation is disabled", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({ auth: { signUp: vi.fn().mockResolvedValue({ data: { session: {} }, error: null }), signOut } });
    const result = await signUpAction(INITIAL_SIGN_UP_STATE, validSignupForm());
    expect(result.error).toContain("not configured correctly");
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.setPending).not.toHaveBeenCalled();
  });
});

describe("verification action", () => {
  it("rejects missing pending verification state", async () => {
    mocks.getPending.mockResolvedValue(null);
    const result = await verifyEmailAction(INITIAL_VERIFICATION_STATE, form({ code: "123456" }));
    expect(result.error).toContain("expired");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("verifies the OTP, validates the Auth user, clears pending state, and redirects", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ data: { session: {}, user: {} }, error: null });
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "verified-user", email: pending.email, email_confirmed_at: "2026-08-15T00:00:00Z" } }, error: null });
    mocks.createClient.mockResolvedValue({ auth: { verifyOtp, getUser } });

    await expect(verifyEmailAction(INITIAL_VERIFICATION_STATE, form({ code: "123456", user_id: "attacker" }))).rejects.toThrow("REDIRECT:/onboarding");
    expect(verifyOtp).toHaveBeenCalledWith({ email: pending.email, token: "123456", type: "email" });
    expect(verifyOtp.mock.calls[0][0]).not.toHaveProperty("user_id");
    expect(mocks.getPostVerificationDestination).toHaveBeenCalledWith(
      expect.any(Object),
      "verified-user",
    );
    expect(mocks.clearPending).toHaveBeenCalledOnce();
  });

  it("sends an already-onboarded verified user to Dashboard", async () => {
    mocks.getPostVerificationDestination.mockResolvedValue("/dashboard");
    const verifyOtp = vi.fn().mockResolvedValue({ data: { session: {}, user: {} }, error: null });
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "existing-user", email: pending.email, email_confirmed_at: "2026-08-15T00:00:00Z" } }, error: null });
    mocks.createClient.mockResolvedValue({ auth: { verifyOtp, getUser } });

    await expect(
      verifyEmailAction(INITIAL_VERIFICATION_STATE, form({ code: "123456" })),
    ).rejects.toThrow("REDIRECT:/dashboard");
  });

  it.each([
    [{ code: "verification_failed", message: "invalid token" }, "doesn’t look right"],
    [{ code: "otp_expired", message: "expired" }, "expired"],
    [{ status: 429, message: "too many requests" }, "Too many attempts"],
  ])("maps provider verification failures safely", async (providerError, expected) => {
    mocks.createClient.mockResolvedValue({ auth: { verifyOtp: vi.fn().mockResolvedValue({ data: {}, error: providerError }) } });
    const result = await verifyEmailAction(INITIAL_VERIFICATION_STATE, form({ code: "123456" }));
    expect(result.error).toContain(expected);
    expect(mocks.clearPending).not.toHaveBeenCalled();
  });
});

describe("resend and change-email actions", () => {
  it("resends through Supabase signup confirmation and preserves pending email", async () => {
    const resend = vi.fn().mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({ auth: { resend } });
    const result = await resendVerificationAction(INITIAL_VERIFICATION_STATE, new FormData());
    expect(resend).toHaveBeenCalledWith({ type: "signup", email: pending.email });
    expect(mocks.setPending).toHaveBeenCalledWith(pending.email, expect.any(Number));
    expect(result.success).toBe("A new verification code was sent.");
  });

  it("maps resend rate limits", async () => {
    mocks.createClient.mockResolvedValue({ auth: { resend: vi.fn().mockResolvedValue({ error: { status: 429 } }) } });
    const result = await resendVerificationAction(INITIAL_VERIFICATION_STATE, new FormData());
    expect(result.error).toContain("Too many requests");
    expect(result.error).toContain("sign in or reset your password");
  });

  it("keeps ineligible resend errors privacy-safe", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        resend: vi.fn().mockResolvedValue({
          error: {
            code: "email_not_confirmed",
            message: "User with this email is already confirmed",
          },
        }),
      },
    });

    const result = await resendVerificationAction(
      INITIAL_VERIFICATION_STATE,
      new FormData(),
    );

    expect(result.error).toBe(
      "We could not send a new code. Try again later, sign in, or reset your password.",
    );
    expect(result.error).not.toContain("already confirmed");
  });

  it("clears pending state before returning to signup", async () => {
    await expect(changeVerificationEmailAction()).rejects.toThrow("REDIRECT:/auth/sign-up");
    expect(mocks.clearPending).toHaveBeenCalledOnce();
  });
});

describe("sensitive-data source contract", () => {
  it("does not log passwords, OTPs, cookies, or tokens", () => {
    for (const path of ["lib/auth/actions.ts", "lib/auth/pending-verification.ts"]) {
      const source = readFileSync(resolve(path), "utf8");
      expect(source, path).not.toMatch(/console\.|logSupabaseError|logger\./);
    }
  });
});
