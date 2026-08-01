export const SUPABASE_BROWSER_CONFIGURATION_ERROR =
  "SUPABASE_BROWSER_CONFIGURATION_ERROR" as const;

export class SupabaseBrowserConfigurationError extends Error {
  readonly code = SUPABASE_BROWSER_CONFIGURATION_ERROR;

  constructor() {
    super("WatchFlow authentication configuration is unavailable.");
    this.name = "SupabaseBrowserConfigurationError";
  }
}

export function getBrowserSupabaseConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    throw new SupabaseBrowserConfigurationError();
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new SupabaseBrowserConfigurationError();
    }
  } catch {
    throw new SupabaseBrowserConfigurationError();
  }

  return { url, publishableKey };
}
