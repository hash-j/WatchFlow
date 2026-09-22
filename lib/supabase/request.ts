import "server-only";

import { cache } from "react";

import { createClient } from "./server";

/**
 * Returns one cookie-bound Supabase client for the current React server render.
 * React owns the memoization lifetime; this is not a process-wide singleton.
 * Mutations and Server Actions must continue to call createClient() directly so
 * they perform authorization against their own request.
 */
export const getRequestSupabaseClient = cache(createClient);
