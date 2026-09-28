import "server-only";

import { createClient } from "@supabase/supabase-js";

export class BackgroundClientConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackgroundClientConfigurationError";
  }
}

/**
 * The only unauthenticated privileged client in WatchFlow. Its callers are
 * restricted to the scheduled-reminder claim/finalize RPCs; normal application
 * code must continue to use the cookie-bound SSR client and RLS.
 */
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
