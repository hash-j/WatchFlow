import "server-only";

import { createClient } from "@supabase/supabase-js";

export function createAdminClient(verifiedUserId: string) {
  if (!verifiedUserId) {
    throw new Error("An authenticated user is required for admin operations.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error("The server database client is not configured.");
  }

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
