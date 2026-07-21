import "server-only";

import { createClient } from "@supabase/supabase-js";

export class SupabaseAdminConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseAdminConfigurationError";
  }
}

export function createAdminClient(verifiedUserId: string) {
  if (!verifiedUserId) {
    throw new SupabaseAdminConfigurationError(
      "A verified authenticated user is required for admin operations.",
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url) {
    throw new SupabaseAdminConfigurationError(
      "NEXT_PUBLIC_SUPABASE_URL is not configured on the server.",
    );
  }

  if (!secretKey) {
    throw new SupabaseAdminConfigurationError(
      "SUPABASE_SECRET_KEY is not configured on the server.",
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
