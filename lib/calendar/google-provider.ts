import "server-only";

import { createHash } from "node:crypto";
import { getGoogleCalendarConfig } from "./google-config";

export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
] as const;

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
};

type GoogleIdentityResponse = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
};

export class GoogleCalendarProviderError extends Error {
  constructor() {
    super("Google Calendar could not be connected.");
    this.name = "GoogleCalendarProviderError";
  }
}

export function createPkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function buildGoogleAuthorizationUrl(input: {
  state: string;
  codeChallenge: string;
}) {
  const config = getGoogleCalendarConfig();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES.join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}

async function safeJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new GoogleCalendarProviderError();
  try {
    return (await response.json()) as T;
  } catch {
    throw new GoogleCalendarProviderError();
  }
}

export async function exchangeGoogleAuthorizationCode(
  code: string,
  codeVerifier: string,
  fetcher: typeof fetch = fetch,
) {
  const config = getGoogleCalendarConfig();
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      code_verifier: codeVerifier,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const tokens = await safeJson<GoogleTokenResponse>(response);
  const grantedScopes = (tokens.scope ?? "").split(/\s+/).filter(Boolean);
  if (
    !tokens.access_token ||
    !tokens.refresh_token ||
    !grantedScopes.includes("https://www.googleapis.com/auth/calendar.events")
  ) throw new GoogleCalendarProviderError();

  const identityResponse = await fetcher("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const identity = await safeJson<GoogleIdentityResponse>(identityResponse);
  if (!identity.sub || !identity.email || identity.email_verified !== true) {
    throw new GoogleCalendarProviderError();
  }
  return {
    refreshToken: tokens.refresh_token,
    grantedScopes,
    providerSubject: identity.sub,
    displayEmail: identity.email,
  };
}

export async function revokeGoogleRefreshToken(token: string, fetcher: typeof fetch = fetch) {
  try {
    const response = await fetcher("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}
