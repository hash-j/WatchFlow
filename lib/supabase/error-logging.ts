import "server-only";

type SafeSupabaseError = {
  code: string | null;
  category:
    | "authorization"
    | "constraint"
    | "postgrest"
    | "schema"
    | "validation"
    | "database";
};

function safeDatabaseCode(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.toUpperCase();
  return /^(?:PGRST\d{3}|[0-9A-Z]{5})$/.test(normalized)
    ? normalized
    : null;
}

function errorCategory(code: string | null): SafeSupabaseError["category"] {
  if (code === "42501") return "authorization";
  if (code?.startsWith("23")) return "constraint";
  if (code?.startsWith("PGRST")) return "postgrest";
  if (code?.startsWith("42")) return "schema";
  if (code?.startsWith("22")) return "validation";
  return "database";
}

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

  const code = safeDatabaseCode(error.code);
  const safeError: SafeSupabaseError = {
    code,
    category: errorCategory(code),
  };

  console.error(`[WatchFlow] ${operation} ${JSON.stringify(safeError)}`);
}
