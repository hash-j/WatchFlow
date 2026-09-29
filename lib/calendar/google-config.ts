import "server-only";

import { z } from "zod";

const configSchema = z.object({
  clientId: z.string().trim().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.string().url(),
});

export class GoogleCalendarConfigurationError extends Error {
  constructor() {
    super("Google Calendar connection is not configured.");
    this.name = "GoogleCalendarConfigurationError";
  }
}

export function getGoogleCalendarConfig() {
  const parsed = configSchema.safeParse({
    clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI,
  });
  if (!parsed.success) throw new GoogleCalendarConfigurationError();

  const redirect = new URL(parsed.data.redirectUri);
  const local = redirect.hostname === "localhost" || redirect.hostname === "127.0.0.1";
  if (
    redirect.pathname !== "/api/calendar/google/callback" ||
    redirect.username ||
    redirect.password ||
    redirect.search ||
    redirect.hash ||
    (redirect.protocol !== "https:" && !(local && redirect.protocol === "http:"))
  ) {
    throw new GoogleCalendarConfigurationError();
  }
  return { ...parsed.data, redirectUrl: redirect };
}

