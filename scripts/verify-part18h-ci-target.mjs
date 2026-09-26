const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "E2E_EXPECTED_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "TMDB_READ_ACCESS_TOKEN",
  "E2E_USER_A_EMAIL",
  "E2E_USER_A_PASSWORD",
  "E2E_USER_B_EMAIL",
  "E2E_USER_B_PASSWORD",
];

for (const name of required) {
  if (!process.env[name]?.trim()) {
    throw new Error(`Required guarded CI variable is missing: ${name}`);
  }
}

if (process.env.E2E_TARGET_ENV !== "development") {
  throw new Error("Guarded CI acceptance requires E2E_TARGET_ENV=development.");
}

const configured = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const expected = new URL(process.env.E2E_EXPECTED_SUPABASE_URL);
const expectedRef = process.env.E2E_EXPECTED_SUPABASE_PROJECT_REF?.trim();

if (
  configured.protocol !== "https:" ||
  configured.href.replace(/\/$/, "") !== expected.href.replace(/\/$/, "") ||
  !expectedRef ||
  configured.hostname !== `${expectedRef}.supabase.co`
) {
  throw new Error("Supabase target does not match the pinned watchflow-dev project.");
}

const schemaResponse = await fetch(`${configured.origin}/rest/v1/`, {
  headers: {
    apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}`,
  },
});

if (!schemaResponse.ok) {
  throw new Error("The guarded CI preflight could not read the development schema.");
}

const schema = await schemaResponse.json();
const properties = schema?.definitions?.user_preferences?.properties ?? {};
const part18hColumns = [
  "notification_movie_status_enabled",
  "notification_watch_next_enabled",
  "notification_custom_lists_enabled",
  "notification_imports_enabled",
];

if (part18hColumns.some((column) => !Object.hasOwn(properties, column))) {
  throw new Error("Part 18H migration objects are missing from watchflow-dev.");
}

console.log("Guarded target verified: watchflow-dev with Part 18H schema.");
