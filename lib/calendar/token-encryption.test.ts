import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { decryptCalendarRefreshToken, encryptCalendarRefreshToken } from "./token-encryption";

describe("calendar refresh-token encryption", () => {
  beforeEach(() => {
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY_VERSION = "3";
  });
  afterEach(() => {
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY_VERSION;
  });

  it("round trips with AES-256-GCM and owner-bound AAD", () => {
    const encrypted = encryptCalendarRefreshToken("refresh-secret", "owner-a");
    expect(encrypted.nonce).toHaveLength(12);
    expect(encrypted.authTag).toHaveLength(16);
    expect(encrypted.keyVersion).toBe(3);
    expect(decryptCalendarRefreshToken(encrypted, "owner-a")).toBe("refresh-secret");
    expect(() => decryptCalendarRefreshToken(encrypted, "owner-b")).toThrow();
  });

  it("rejects malformed keys and tampered ciphertext", () => {
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = "not-a-key";
    expect(() => encryptCalendarRefreshToken("token", "owner-a")).toThrow();
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const encrypted = encryptCalendarRefreshToken("token", "owner-a");
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
    expect(() => decryptCalendarRefreshToken(encrypted, "owner-a")).toThrow();
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    encrypted.ciphertext[0] ^= 1;
    expect(() => decryptCalendarRefreshToken(encrypted, "owner-a")).toThrow();
  });

  it("rejects a malformed encrypted envelope", () => {
    expect(() => decryptCalendarRefreshToken({
      ciphertext: Buffer.from("cipher"),
      nonce: Buffer.alloc(11),
      authTag: Buffer.alloc(16),
      keyVersion: 3,
    }, "owner-a")).toThrow("envelope");
  });
});

