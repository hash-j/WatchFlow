import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  GoogleCalendarTransportError,
  refreshGoogleCalendarAccessToken,
  upsertGoogleCalendarEvent,
} from "./google-calendar-transport";

const eventInput = {
  providerEventId: `a${"a".repeat(32)}`,
  sourceKey: "b".repeat(32),
  sourceVersion: "c".repeat(32),
  movieTitle: "Arrival",
  movieId: 42,
  scheduledFor: "2026-11-01T08:30:00.000Z",
  scheduleTimezone: "America/Los_Angeles",
  runtimeMinutes: 116,
};

beforeEach(() => {
  process.env.GOOGLE_CALENDAR_CLIENT_ID = "client-id";
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "client-secret";
  process.env.GOOGLE_CALENDAR_REDIRECT_URI =
    "http://localhost:3000/api/calendar/google/callback";
});

afterEach(() => {
  delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
  delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  delete process.env.GOOGLE_CALENDAR_REDIRECT_URI;
});

describe("Part 18J-C Google Calendar transport", () => {
  it.each([
    ["UTC", "2026-02-01T12:00:00.000Z"],
    ["Asia/Karachi", "2026-02-01T07:00:00.000Z"],
    ["America/Los_Angeles", "2026-07-01T19:00:00.000Z"],
    ["America/Los_Angeles", "2026-11-01T08:30:00.000Z"],
  ])("preserves the absolute instant and named timezone for %s", (timeZone, instant) => {
    const payload = buildGoogleCalendarEvent({
      ...eventInput,
      scheduledFor: instant,
      scheduleTimezone: timeZone,
    });
    expect(payload.start).toEqual({ dateTime: instant, timeZone });
    expect(Date.parse(payload.end.dateTime) - Date.parse(payload.start.dateTime)).toBe(
      116 * 60_000,
    );
    expect(payload.summary).toBe("Arrival");
    expect(payload.extendedProperties.private).toEqual({
      watchflowSourceKey: eventInput.sourceKey,
      watchflowSourceVersion: eventInput.sourceVersion,
    });
  });

  it("refreshes access in memory and reports an explicit refresh-token rotation", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "temporary-access",
          refresh_token: "replacement-refresh",
        }),
        { status: 200 },
      ),
    );
    await expect(
      refreshGoogleCalendarAccessToken("existing-refresh", fetcher),
    ).resolves.toEqual({
      accessToken: "temporary-access",
      replacementRefreshToken: "replacement-refresh",
    });
    const request = fetcher.mock.calls[0];
    expect(String(request[1].body)).toContain("refresh_token=existing-refresh");
  });

  it("includes a safe WatchFlow movie link when the application origin is valid", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://watchflow.example";
    expect(buildGoogleCalendarEvent(eventInput).description).toContain(
      "https://watchflow.example/library/42",
    );
    process.env.NEXT_PUBLIC_APP_URL = "https://user:password@evil.example";
    expect(buildGoogleCalendarEvent(eventInput).description).toBe(
      "Scheduled in WatchFlow. View movie: /library/42",
    );
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("preserves the current refresh credential when Google returns no replacement", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "temporary-access" }), {
        status: 200,
      }),
    );
    await expect(
      refreshGoogleCalendarAccessToken("existing-refresh", fetcher),
    ).resolves.toEqual({
      accessToken: "temporary-access",
      replacementRefreshToken: null,
    });
  });

  it.each([
    [400, { error: "invalid_grant" }, "auth_required", "google_authorization_required"],
    [401, { error: "invalid_client" }, "failed", "google_token_exchange_rejected"],
    [429, {}, "retryable", "google_rate_limited"],
    [503, {}, "retryable", "google_provider_unavailable"],
  ])("classifies token status %i without exposing provider data", async (
    status,
    body,
    outcome,
    errorCode,
  ) => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...body, token: "never-expose" }), { status }),
    );
    const error = (await refreshGoogleCalendarAccessToken(
      "refresh-secret",
      fetcher,
    ).catch((value) => value)) as GoogleCalendarTransportError;
    expect(error).toMatchObject({ outcome, errorCode, providerStatusCode: status });
    expect(error.message).not.toContain("never-expose");
    expect(error.message).not.toContain("refresh-secret");
  });

  it("creates with a deterministic ID after update proves the event absent", async () => {
    const payload = buildGoogleCalendarEvent(eventInput);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: payload.id, etag: "etag-create" }), {
          status: 200,
        }),
      );
    await expect(
      upsertGoogleCalendarEvent(
        { calendarId: "primary", accessToken: "access", payload },
        fetcher,
      ),
    ).resolves.toEqual({
      providerEventId: payload.id,
      providerEtag: "etag-create",
      providerStatusCode: 200,
    });
    expect(fetcher.mock.calls.map((call) => call[1].method)).toEqual([
      "PUT",
      "POST",
    ]);
    expect(JSON.parse(String(fetcher.mock.calls[1][1].body)).id).toBe(payload.id);
  });

  it("updates the same event and resolves an uncertain-create conflict without duplication", async () => {
    const payload = buildGoogleCalendarEvent(eventInput);
    const directUpdate = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: payload.id, etag: "etag-update" }), {
        status: 200,
      }),
    );
    await upsertGoogleCalendarEvent(
      { calendarId: "primary", accessToken: "access", payload },
      directUpdate,
    );
    expect(directUpdate).toHaveBeenCalledTimes(1);
    expect(directUpdate.mock.calls[0][1].method).toBe("PUT");

    const conflict = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: payload.id }), { status: 200 }),
      );
    await upsertGoogleCalendarEvent(
      { calendarId: "primary", accessToken: "access", payload },
      conflict,
    );
    expect(conflict.mock.calls.map((call) => call[1].method)).toEqual([
      "PUT",
      "POST",
      "PUT",
    ]);
  });

  it.each([404, 410])(
    "treats delete %i as success-equivalent convergence",
    async (status) => {
      await expect(
        deleteGoogleCalendarEvent(
          {
            calendarId: "primary",
            providerEventId: eventInput.providerEventId,
            accessToken: "access",
          },
          vi.fn().mockResolvedValue(new Response(null, { status })),
        ),
      ).resolves.toMatchObject({ providerStatusCode: status });
    },
  );

  it("classifies provider delete retries", async () => {
    const error = await deleteGoogleCalendarEvent(
      {
        calendarId: "primary",
        providerEventId: eventInput.providerEventId,
        accessToken: "access",
      },
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    ).catch((value) => value as GoogleCalendarTransportError);
    expect(error).toMatchObject({
      outcome: "retryable",
      errorCode: "google_provider_unavailable",
    });
  });

  it("classifies bounded network failures as retryable without leaking errors", async () => {
    const error = (await refreshGoogleCalendarAccessToken(
      "refresh-secret",
      vi.fn().mockRejectedValue(new Error("socket included secret")),
    ).catch((value) => value)) as GoogleCalendarTransportError;
    expect(error).toMatchObject({
      outcome: "retryable",
      errorCode: "google_network_failure",
      providerStatusCode: null,
    });
    expect(error.message).not.toContain("socket");
    expect(error.message).not.toContain("secret");
  });

  it("rejects malformed event responses and payloads", async () => {
    const payload = buildGoogleCalendarEvent(eventInput);
    await expect(
      upsertGoogleCalendarEvent(
        { calendarId: "primary", accessToken: "access", payload },
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ id: "wrong-event" }), { status: 200 }),
        ),
      ),
    ).rejects.toMatchObject({ errorCode: "google_event_response_invalid" });
    expect(() =>
      buildGoogleCalendarEvent({ ...eventInput, scheduleTimezone: "Invalid/Zone" }),
    ).toThrowError(GoogleCalendarTransportError);
  });
});
