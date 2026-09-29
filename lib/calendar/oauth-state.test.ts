import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createOAuthAttempt,
  hashOAuthValue,
  hashOAuthSessionBinding,
  parseOAuthCookie,
  safeEqual,
  serializeOAuthCookie,
} from "./oauth-state";

describe("calendar OAuth state", () => {
  it("creates independent high-entropy state, binding, and PKCE material", () => {
    const first = createOAuthAttempt();
    const second = createOAuthAttempt();
    expect(first.state).not.toBe(second.state);
    expect(first.binding).not.toBe(first.state);
    expect(first.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(hashOAuthValue(first.state)).toHaveLength(32);
    expect(hashOAuthSessionBinding(first.binding, "owner-a", "login-1"))
      .not.toEqual(hashOAuthSessionBinding(first.binding, "owner-a", "login-2"));
  });

  it("round trips the HttpOnly-cookie payload and rejects malformed values", () => {
    const attempt = createOAuthAttempt();
    expect(parseOAuthCookie(serializeOAuthCookie(attempt.binding, attempt.codeVerifier))).toEqual({
      binding: attempt.binding,
      codeVerifier: attempt.codeVerifier,
    });
    expect(parseOAuthCookie("invalid")).toBeNull();
    expect(safeEqual("same", "same")).toBe(true);
    expect(safeEqual("same", "other")).toBe(false);
  });
});
