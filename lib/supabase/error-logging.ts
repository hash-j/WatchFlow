import "server-only";

type SafeSupabaseError = {
  message: string;
  code: string | null;
  details: string | null;
  hint: string | null;
};

export function logSupabaseError(
  operation: string,
  error: {
    message?: unknown;
    code?: unknown;
    details?: unknown;
    hint?: unknown;
  },
) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  const safeError: SafeSupabaseError = {
    message:
      typeof error.message === "string"
        ? error.message
        : "Unknown Supabase error",
    code: typeof error.code === "string" ? error.code : null,
    details: typeof error.details === "string" ? error.details : null,
    hint: typeof error.hint === "string" ? error.hint : null,
  };

  console.error(`[WatchFlow] ${operation} ${JSON.stringify(safeError)}`);
}
