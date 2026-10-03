import "server-only";

const PROJECT_REF_PATTERN = /^[a-z0-9]{8,64}$/;

export function supabaseProjectRef(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) {
      return null;
    }

    const match = url.hostname.match(/^([a-z0-9]{8,64})\.supabase\.co$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function isExpectedSchedulerTarget() {
  const expected = process.env.WATCHFLOW_EXPECTED_SUPABASE_PROJECT_REF?.trim();
  if (!expected || !PROJECT_REF_PATTERN.test(expected)) return false;

  return supabaseProjectRef(process.env.NEXT_PUBLIC_SUPABASE_URL) === expected;
}
