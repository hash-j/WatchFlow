import { pathToFileURL } from "node:url";

export const PART18I_SCHEMA_PROBES = [
  ["scheduled_notification_jobs", "id,user_id,schedule_key,notification_id,state,reminder_at,available_at,attempts,lease_token,lease_expires_at"],
  ["scheduled_notification_deliveries", "id,job_id,subscription_id,state,available_at,attempts,lease_token,lease_expires_at"],
  ["user_preferences", "schedule_reminders_enabled,reminder_offset_minutes,push_notifications_enabled"],
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
  "WATCHFLOW_SCHEDULER_SECRET",
];

export class Part18iPreflightError extends Error {
  constructor(reason) {
    super(`Part 18I CI preflight failed: ${reason}`);
    this.name = "Part18iPreflightError";
  }
}

function environmentValue(environment, name) {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Part18iPreflightError(`missing environment variable ${name}.`);
  }
  return value;
}

export function validatePart18iEnvironment(environment = process.env) {
  for (const name of REQUIRED_VARIABLES) environmentValue(environment, name);

  if (environmentValue(environment, "E2E_TARGET_ENV") !== "development") {
    throw new Part18iPreflightError("target environment is not development.");
  }

  if (environmentValue(environment, "WATCHFLOW_SCHEDULER_SECRET").length < 32) {
    throw new Part18iPreflightError(
      "WATCHFLOW_SCHEDULER_SECRET must contain at least 32 characters.",
    );
  }

  let configured;
  let expected;
  try {
    configured = new URL(environmentValue(environment, "NEXT_PUBLIC_SUPABASE_URL"));
    expected = new URL(environmentValue(environment, "E2E_EXPECTED_SUPABASE_URL"));
  } catch {
    throw new Part18iPreflightError("Supabase URL configuration is invalid.");
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
    throw new Part18iPreflightError(
      "wrong Supabase project; the target is not pinned watchflow-dev.",
    );
  }

  return {
    origin: configured.origin,
    secretKey: environmentValue(environment, "SUPABASE_SECRET_KEY"),
  };
}

function responseFailure(status, relation) {
  if (status === 401) {
    return new Part18iPreflightError(
      "authentication failure for the watchflow-dev server credential.",
    );
  }
  if (status === 403) {
    return new Part18iPreflightError(
      "permission failure while reading the watchflow-dev schema contract.",
    );
  }
  if (status === 400) {
    return new Part18iPreflightError(
      `missing Part 18I column or incompatible schema on ${relation}.`,
    );
  }
  if (status === 404) {
    return new Part18iPreflightError(
      `${relation} is unavailable from the watchflow-dev REST schema.`,
    );
  }
  if (status >= 500) {
    return new Part18iPreflightError(
      "watchflow-dev REST service returned a server failure.",
    );
  }
  return new Part18iPreflightError(
    `watchflow-dev REST service returned unexpected HTTP status ${status}.`,
  );
}

export async function verifyPart18iCiTarget({
  environment = process.env,
  fetchImpl = fetch,
} = {}) {
  const { origin, secretKey } = validatePart18iEnvironment(environment);

  for (const [relation, columns] of PART18I_SCHEMA_PROBES) {
    const endpoint = new URL(`/rest/v1/${relation}`, origin);
    endpoint.searchParams.set("select", columns);
    endpoint.searchParams.set("limit", "0");

    let response;
    try {
      response = await fetchImpl(endpoint, {
        headers: { Accept: "application/json", apikey: secretKey },
      });
    } catch {
      throw new Part18iPreflightError(
        "network failure while contacting the pinned watchflow-dev project.",
      );
    }
    if (!response.ok) throw responseFailure(response.status, relation);
  }

  const requiredRpcs = [
    "watchflow_claim_scheduled_reminders",
    "watchflow_finalize_scheduled_reminder",
  ];
  const openApiEndpoint = new URL("/rest/v1/", origin);
  let openApiResponse;
  try {
    openApiResponse = await fetchImpl(openApiEndpoint, {
      headers: { Accept: "application/openapi+json", apikey: secretKey },
    });
  } catch {
    throw new Part18iPreflightError(
      "network failure while contacting the pinned watchflow-dev project.",
    );
  }
  if (!openApiResponse.ok) {
    throw responseFailure(openApiResponse.status, "Part 18I RPC contract");
  }
  let openApi;
  try {
    openApi = await openApiResponse.json();
  } catch {
    throw new Part18iPreflightError(
      "watchflow-dev returned an invalid REST schema contract.",
    );
  }
  for (const rpc of requiredRpcs) {
    if (!openApi?.paths?.[`/rpc/${rpc}`]) {
      throw new Part18iPreflightError(
        `required Part 18I RPC ${rpc} is unavailable on watchflow-dev.`,
      );
    }
  }
}

async function main() {
  try {
    await verifyPart18iCiTarget();
    console.log("Guarded target verified: watchflow-dev with Part 18I schema.");
  } catch (error) {
    console.error(
      error instanceof Part18iPreflightError
        ? error.message
        : "Part 18I CI preflight failed: unexpected internal failure.",
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
