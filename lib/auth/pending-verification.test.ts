import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { decodePendingVerification, PENDING_VERIFICATION_TTL_SECONDS } from "./pending-verification";

function encoded(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

describe("pending email state", () => {
  it("decodes normalized, unexpired pending state", () => {
    const now = 1_000_000;
    expect(decodePendingVerification(encoded({
      email: " USER@Example.com ",
      expiresAt: now + 10_000,
      resendAvailableAt: now + 1_000,
    }), now)).toEqual({
      email: "user@example.com",
      expiresAt: now + 10_000,
      resendAvailableAt: now + 1_000,
    });
  });

  it("rejects expired and malformed pending state", () => {
    const now = 1_000_000;
    expect(decodePendingVerification(encoded({ email: "user@example.com", expiresAt: now, resendAvailableAt: now }), now)).toBeNull();
    expect(decodePendingVerification("not-json", now)).toBeNull();
  });

  it("uses a short, HttpOnly, path-scoped cookie with no credential fields", () => {
    const source = readFileSync(resolve("lib/auth/pending-verification.ts"), "utf8");
    expect(PENDING_VERIFICATION_TTL_SECONDS).toBe(15 * 60);
    expect(source).toContain("httpOnly: true");
    expect(source).toContain('sameSite: "lax"');
    expect(source).toContain('path: "/auth"');
    expect(source).not.toMatch(/password|access_token|refresh_token|otp:/i);
  });

  it("cannot create an authenticated session or grant protected access", () => {
    const source = readFileSync(
      resolve("lib/auth/pending-verification.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/createClient|\.auth\.|getSession|getUser|getClaims/);
    expect(source).not.toMatch(/userId|user_id|session|authenticated/i);
  });
});
