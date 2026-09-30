import "server-only";

import { getGoogleCalendarConfig } from "./google-config";
import type { CalendarSyncOutcome } from "./types";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const PROVIDER_TIMEOUT_MS = 10_000;

type GoogleTokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  error?: unknown;
};

type GoogleEventResponse = {
  id?: unknown;
  etag?: unknown;
};

export type GoogleCalendarEventPayload = {
  id: string;
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  extendedProperties: {
    private: {
      watchflowSourceKey: string;
      watchflowSourceVersion: string;
    };
  };
};

export type GoogleAccessToken = {
  accessToken: string;
  replacementRefreshToken: string | null;
};

export type GoogleCalendarMutationResult = {
  providerEventId: string;
  providerEtag: string | null;
  providerStatusCode: number;
};

export class GoogleCalendarTransportError extends Error {
  constructor(
    readonly outcome: Exclude<CalendarSyncOutcome, "succeeded" | "skipped">,
    readonly errorCode: string,
    readonly providerStatusCode: number | null = null,
  ) {
    super("Google Calendar synchronization failed.");
    this.name = "GoogleCalendarTransportError";
  }
}

function validTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function movieContext(movieId: number) {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (!configured) return `View movie: /library/${movieId}`;
  try {
    const origin = new URL(configured);
    const local = origin.hostname === "localhost" || origin.hostname === "127.0.0.1";
    if (
      origin.username ||
      origin.password ||
      origin.search ||
      origin.hash ||
      origin.pathname !== "/" ||
      (origin.protocol !== "https:" && !(local && origin.protocol === "http:"))
    ) {
      return `View movie: /library/${movieId}`;
    }
    return `View movie: ${new URL(`/library/${movieId}`, origin).toString()}`;
  } catch {
    return `View movie: /library/${movieId}`;
  }
}

export function buildGoogleCalendarEvent(input: {
  providerEventId: string;
  sourceKey: string;
  sourceVersion: string;
  movieTitle: string;
  movieId: number;
  scheduledFor: string;
  scheduleTimezone: string;
  runtimeMinutes: number;
}): GoogleCalendarEventPayload {
  const start = new Date(input.scheduledFor);
  if (
    !Number.isFinite(start.getTime()) ||
    !validTimeZone(input.scheduleTimezone) ||
    !Number.isInteger(input.runtimeMinutes) ||
    input.runtimeMinutes < 1 ||
    input.runtimeMinutes > 1_440 ||
    !/^a[0-9a-f]{32}$/.test(input.providerEventId) ||
    !/^[0-9a-f]{32}$/.test(input.sourceKey) ||
    !/^[0-9a-f]{32}$/.test(input.sourceVersion) ||
    !Number.isSafeInteger(input.movieId) ||
    input.movieId < 1 ||
    input.movieTitle.trim().length === 0
  ) {
    throw new GoogleCalendarTransportError("failed", "calendar_payload_invalid");
  }

  const end = new Date(start.getTime() + input.runtimeMinutes * 60_000);
  return {
    id: input.providerEventId,
    summary: input.movieTitle,
    description: `Scheduled in WatchFlow. ${movieContext(input.movieId)}`,
    start: {
      dateTime: start.toISOString(),
      timeZone: input.scheduleTimezone,
    },
    end: {
      dateTime: end.toISOString(),
      timeZone: input.scheduleTimezone,
    },
    extendedProperties: {
      private: {
        watchflowSourceKey: input.sourceKey,
        watchflowSourceVersion: input.sourceVersion,
      },
    },
  };
}

async function jsonRecord(response: Response) {
  try {
    const value = await response.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function providerFailure(status: number, tokenError?: unknown) {
  if (tokenError === "invalid_grant") {
    return new GoogleCalendarTransportError(
      "auth_required",
      "google_authorization_required",
      status,
    );
  }
  if (status === 429 || status >= 500) {
    return new GoogleCalendarTransportError(
      "retryable",
      status === 429 ? "google_rate_limited" : "google_provider_unavailable",
      status,
    );
  }
  if (tokenError !== undefined) {
    return new GoogleCalendarTransportError(
      "failed",
      "google_token_exchange_rejected",
      status,
    );
  }
  if (status === 401 || status === 403) {
    return new GoogleCalendarTransportError(
      "auth_required",
      "google_authorization_required",
      status,
    );
  }
  return new GoogleCalendarTransportError(
    "failed",
    "google_provider_rejected",
    status,
  );
}

async function providerFetch(
  url: string,
  init: RequestInit,
  fetcher: typeof fetch,
) {
  try {
    return await fetcher(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch {
    throw new GoogleCalendarTransportError(
      "retryable",
      "google_network_failure",
    );
  }
}

export async function refreshGoogleCalendarAccessToken(
  refreshToken: string,
  fetcher: typeof fetch = fetch,
): Promise<GoogleAccessToken> {
  if (!refreshToken) {
    throw new GoogleCalendarTransportError(
      "auth_required",
      "google_authorization_required",
    );
  }
  const config = getGoogleCalendarConfig();
  const response = await providerFetch(
    GOOGLE_TOKEN_URL,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    },
    fetcher,
  );
  const body = (await jsonRecord(response)) as GoogleTokenResponse | null;
  if (!response.ok) throw providerFailure(response.status, body?.error);
  if (typeof body?.access_token !== "string" || body.access_token.length === 0) {
    throw new GoogleCalendarTransportError(
      "failed",
      "google_token_response_invalid",
      response.status,
    );
  }
  return {
    accessToken: body.access_token,
    replacementRefreshToken:
      typeof body.refresh_token === "string" && body.refresh_token.length > 0
        ? body.refresh_token
        : null,
  };
}

function eventUrl(calendarId: string, eventId?: string) {
  const base = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`;
  return eventId ? `${base}/${encodeURIComponent(eventId)}` : base;
}

function eventHeaders(accessToken: string) {
  return {
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
  };
}

async function parseEventMutation(
  response: Response,
  expectedEventId: string,
): Promise<GoogleCalendarMutationResult> {
  if (!response.ok) throw providerFailure(response.status);
  const body = (await jsonRecord(response)) as GoogleEventResponse | null;
  if (body?.id !== expectedEventId) {
    throw new GoogleCalendarTransportError(
      "failed",
      "google_event_response_invalid",
      response.status,
    );
  }
  return {
    providerEventId: expectedEventId,
    providerEtag: typeof body.etag === "string" ? body.etag : null,
    providerStatusCode: response.status,
  };
}

async function updateGoogleEvent(
  calendarId: string,
  payload: GoogleCalendarEventPayload,
  accessToken: string,
  fetcher: typeof fetch,
) {
  return providerFetch(
    eventUrl(calendarId, payload.id),
    {
      method: "PUT",
      headers: eventHeaders(accessToken),
      body: JSON.stringify(payload),
    },
    fetcher,
  );
}

export async function upsertGoogleCalendarEvent(
  input: {
    calendarId: string;
    accessToken: string;
    payload: GoogleCalendarEventPayload;
  },
  fetcher: typeof fetch = fetch,
): Promise<GoogleCalendarMutationResult> {
  const update = await updateGoogleEvent(
    input.calendarId,
    input.payload,
    input.accessToken,
    fetcher,
  );
  if (update.status !== 404) {
    return parseEventMutation(update, input.payload.id);
  }

  const insert = await providerFetch(
    eventUrl(input.calendarId),
    {
      method: "POST",
      headers: eventHeaders(input.accessToken),
      body: JSON.stringify(input.payload),
    },
    fetcher,
  );
  if (insert.status === 409) {
    const retryUpdate = await updateGoogleEvent(
      input.calendarId,
      input.payload,
      input.accessToken,
      fetcher,
    );
    return parseEventMutation(retryUpdate, input.payload.id);
  }
  return parseEventMutation(insert, input.payload.id);
}

export async function deleteGoogleCalendarEvent(
  input: { calendarId: string; providerEventId: string; accessToken: string },
  fetcher: typeof fetch = fetch,
): Promise<GoogleCalendarMutationResult> {
  const response = await providerFetch(
    eventUrl(input.calendarId, input.providerEventId),
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${input.accessToken}` },
    },
    fetcher,
  );
  if (response.status === 404 || response.status === 410) {
    return {
      providerEventId: input.providerEventId,
      providerEtag: null,
      providerStatusCode: response.status,
    };
  }
  if (!response.ok) throw providerFailure(response.status);
  return {
    providerEventId: input.providerEventId,
    providerEtag: null,
    providerStatusCode: response.status,
  };
}
