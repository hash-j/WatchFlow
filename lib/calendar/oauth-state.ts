import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const GOOGLE_OAUTH_COOKIE = "watchflow_google_calendar_oauth";
export const GOOGLE_OAUTH_TTL_SECONDS = 10 * 60;

export function hashOAuthValue(value: string) {
  return createHash("sha256").update(value).digest();
}

export function hashOAuthSessionBinding(
  binding: string,
  userId: string,
  lastSignInAt?: string,
) {
  return hashOAuthValue(`${binding}\0${userId}\0${lastSignInAt ?? ""}`);
}

export function createOAuthAttempt() {
  return {
    state: randomBytes(32).toString("base64url"),
    binding: randomBytes(32).toString("base64url"),
    codeVerifier: randomBytes(48).toString("base64url"),
  };
}

export function serializeOAuthCookie(binding: string, codeVerifier: string) {
  return Buffer.from(JSON.stringify({ binding, codeVerifier }), "utf8").toString("base64url");
}

export function parseOAuthCookie(value: string | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    if (
      typeof parsed.binding !== "string" || parsed.binding.length < 32 ||
      typeof parsed.codeVerifier !== "string" || parsed.codeVerifier.length < 43
    ) return null;
    return { binding: parsed.binding, codeVerifier: parsed.codeVerifier };
  } catch {
    return null;
  }
}

export function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
