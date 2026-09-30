import "server-only";

import { createClient } from "@supabase/supabase-js";

export class BackgroundClientConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackgroundClientConfigurationError";
  }
}

export function createScheduledReminderBackgroundClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url) {
    throw new BackgroundClientConfigurationError(
      "The scheduled reminder database URL is not configured.",
    );
  }
  if (!secretKey) {
    throw new BackgroundClientConfigurationError(
      "The scheduled reminder database credential is not configured.",
    );
  }

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Server-only client for the bounded calendar executor. Callers may use only
 * the calendar claim/finalize RPCs and the owner-bound credential-rotation RPC.
 * Normal application code must continue to use the cookie-bound SSR client.
 */
export function createCalendarSyncBackgroundClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url) {
    throw new BackgroundClientConfigurationError(
      "The calendar sync database URL is not configured.",
    );
  }
  if (!secretKey) {
    throw new BackgroundClientConfigurationError(
      "The calendar sync database credential is not configured.",
    );
  }

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
