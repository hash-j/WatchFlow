import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildGoogleAuthorizationUrl,
  exchangeGoogleAuthorizationCode,
  GOOGLE_CALENDAR_SCOPES,
} from "./google-provider";

describe("Google Calendar OAuth provider", () => {
  beforeEach(() => {
    process.env.GOOGLE_CALENDAR_CLIENT_ID = "client-id";
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_CALENDAR_REDIRECT_URI = "http://localhost:3000/api/calendar/google/callback";
  });
  afterEach(() => {
    delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
    delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    delete process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  });

  it("builds a state-bound offline PKCE request with least scopes", () => {
    const url = buildGoogleAuthorizationUrl({ state: "state", codeChallenge: "challenge" });
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual(GOOGLE_CALENDAR_SCOPES);
  });

  it("exchanges server-side and returns only durable identity and refresh data", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "ephemeral-access",
        refresh_token: "durable-refresh",
        scope: GOOGLE_CALENDAR_SCOPES.join(" "),
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        sub: "google-subject", email: "owner@example.com", email_verified: true,
      }), { status: 200 }));
    const result = await exchangeGoogleAuthorizationCode("code", "verifier", fetcher);
    expect(result).toEqual({
      refreshToken: "durable-refresh",
      grantedScopes: [...GOOGLE_CALENDAR_SCOPES],
      providerSubject: "google-subject",
      displayEmail: "owner@example.com",
    });
    expect(JSON.stringify(result)).not.toContain("ephemeral-access");
  });

  it("fails closed without offline refresh access or verified identity", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "access", scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    }), { status: 200 }));
    await expect(exchangeGoogleAuthorizationCode("code", "verifier", fetcher)).rejects.toThrow();
  });

  it("rejects missing or unsafe callback configuration", () => {
    delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    expect(() => buildGoogleAuthorizationUrl({ state: "state", codeChallenge: "challenge" })).toThrow();
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_CALENDAR_REDIRECT_URI = "https://watchflow.example/api/calendar/google/callback?next=evil";
    expect(() => buildGoogleAuthorizationUrl({ state: "state", codeChallenge: "challenge" })).toThrow();
  });
});

