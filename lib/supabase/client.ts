import { createBrowserClient } from "@supabase/ssr";

import { getBrowserSupabaseConfiguration } from "./browser-config";

export function createClient() {
  const { url, publishableKey } = getBrowserSupabaseConfiguration();
  return createBrowserClient(url, publishableKey);
}
