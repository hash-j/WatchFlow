import { pathToFileURL } from "node:url";

export const PART18H_COLUMNS = [
  "notification_movie_status_enabled",
  "notification_watch_next_enabled",
  "notification_custom_lists_enabled",
  "notification_imports_enabled",
];

const REQUIRED_VARIABLES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "E2E_EXPECTED_SUPABASE_URL",
  "E2E_EXPECTED_SUPABASE_PROJECT_REF",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "TMDB_READ_ACCESS_TOKEN",
  "E2E_USER_A_EMAIL",
  "E2E_USER_A_PASSWORD",
  "E2E_USER_B_EMAIL",
  "E2E_USER_B_PASSWORD",
];

export class Part18hPreflightError extends Error {
  constructor(reason) {
    super(`Part 18H CI preflight failed: ${reason}`);
    this.name = "Part18hPreflightError";
  }
}

function environmentValue(environment, name) {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Part18hPreflightError(`missing environment variable ${name}.`);
  }
  return value;
}

export function validatePart18hEnvironment(environment = process.env) {
  for (const name of REQUIRED_VARIABLES) environmentValue(environment, name);

  if (environmentValue(environment, "E2E_TARGET_ENV") !== "development") {
    throw new Part18hPreflightError("target environment is not development.");
  }

  let configured;
  let expected;
  try {
    configured = new URL(environmentValue(environment, "NEXT_PUBLIC_SUPABASE_URL"));
    expected = new URL(environmentValue(environment, "E2E_EXPECTED_SUPABASE_URL"));
  } catch {
    throw new Part18hPreflightError("Supabase URL configuration is invalid.");
  }

  const expectedRef = environmentValue(
    environment,
    "E2E_EXPECTED_SUPABASE_PROJECT_REF",
  );
  if (
    configured.protocol !== "https:" ||
    configured.href.replace(/\/$/, "") !== expected.href.replace(/\/$/, "") ||
    configured.hostname !== `${expectedRef}.supabase.co`
  ) {
    throw new Part18hPreflightError(
      "wrong Supabase project; the target is not pinned watchflow-dev.",
    );
  }

  return {
    origin: configured.origin,
    secretKey: environmentValue(environment, "SUPABASE_SECRET_KEY"),
  };
}

function responseFailure(status, column) {
  if (status === 401) {
    return new Part18hPreflightError(
      "authentication failure for the watchflow-dev server credential.",
    );
  }
  if (status === 403) {
    return new Part18hPreflightError(
      "permission failure while reading the watchflow-dev schema contract.",
    );
  }
  if (status === 400) {
    return new Part18hPreflightError(`missing Part 18H column ${column}.`);
  }
  if (status === 404) {
    return new Part18hPreflightError(
      "user_preferences is unavailable from the watchflow-dev REST schema.",
    );
  }
  if (status >= 500) {
    return new Part18hPreflightError(
      "watchflow-dev REST service returned a server failure.",
    );
  }
  return new Part18hPreflightError(
    `watchflow-dev REST service returned unexpected HTTP status ${status}.`,
  );
}

export async function verifyPart18hCiTarget({
  environment = process.env,
  fetchImpl = fetch,
} = {}) {
  const { origin, secretKey } = validatePart18hEnvironment(environment);

  for (const column of PART18H_COLUMNS) {
    const endpoint = new URL("/rest/v1/user_preferences", origin);
    endpoint.searchParams.set("select", column);
    endpoint.searchParams.set("limit", "0");

    let response;
    try {
      response = await fetchImpl(endpoint, {
        headers: {
          Accept: "application/json",
          apikey: secretKey,
        },
      });
    } catch {
      throw new Part18hPreflightError(
        "network failure while contacting the pinned watchflow-dev project.",
      );
    }

    if (!response.ok) throw responseFailure(response.status, column);
  }
}

async function main() {
  try {
    await verifyPart18hCiTarget();
    console.log("Guarded target verified: watchflow-dev with Part 18H schema.");
  } catch (error) {
    console.error(
      error instanceof Part18hPreflightError
        ? error.message
        : "Part 18H CI preflight failed: unexpected internal failure.",
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
