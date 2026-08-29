import { loadLocalTestEnvironment } from "../lib/testing/local-environment.mjs";

loadLocalTestEnvironment();

function value(name) {
  const result = process.env[name]?.trim();
  if (!result) throw new Error(`Missing required audit variable ${name}.`);
  return result;
}

function normalizeUrl(input) {
  return new URL(input).href.replace(/\/$/, "");
}

const configuredUrl = normalizeUrl(value("NEXT_PUBLIC_SUPABASE_URL"));
const expectedUrl = normalizeUrl(value("E2E_EXPECTED_SUPABASE_URL"));

if (
  value("E2E_TARGET_ENV") !== "development" ||
  configuredUrl !== expectedUrl
) {
  throw new Error("Development target guard failed; no request was sent.");
}

const expectedTables = {
  profiles: [
    "id",
    "full_name",
    "avatar_url",
    "country",
    "timezone",
    "subscription_plan",
    "onboarding_completed_at",
    "created_at",
    "updated_at",
  ],
  movies: [
    "id",
    "tmdb_id",
    "title",
    "genres",
    "main_cast",
    "production_countries",
    "metadata_updated_at",
    "tmdb_adult",
    "metadata_language",
    "created_at",
    "updated_at",
  ],
  user_movies: [
    "id",
    "user_id",
    "movie_id",
    "status",
    "personal_rating",
    "priority",
    "queue_position",
    "scheduled_for",
    "schedule_timezone",
    "schedule_note",
    "watched_at",
    "favourite",
    "created_at",
    "updated_at",
  ],
  user_preferences: [
    "user_id",
    "default_movie_status",
    "default_priority",
    "default_library_view",
    "date_format",
    "time_format",
    "preferred_language",
    "movies_per_page",
    "created_at",
    "updated_at",
  ],
  lists: [
    "id",
    "user_id",
    "name",
    "description",
    "visibility",
    "created_at",
    "updated_at",
  ],
  list_movies: [
    "id",
    "list_id",
    "user_movie_id",
    "position",
    "created_at",
    "updated_at",
  ],
  watchflow_tmdb_rate_limits: [
    "user_id",
    "operation",
    "window_started_at",
    "request_count",
    "updated_at",
  ],
};

const expectedRpcs = [
  "move_watch_queue_item",
  "watchflow_add_movies_to_list",
  "watchflow_add_user_movie",
  "watchflow_bulk_remove_library_movies",
  "watchflow_bulk_update_library_status",
  "watchflow_library_filter_options",
  "watchflow_library_rows",
  "watchflow_list_summaries",
  "watchflow_move_list_item",
  "watchflow_normalize_queue",
  "watchflow_remove_movie_from_list",
  "watchflow_schedule_movie",
  "watchflow_set_movie_list_memberships",
  "watchflow_take_tmdb_rate_limit",
  "watchflow_update_library_movie",
];

const response = await fetch(`${configuredUrl}/rest/v1/`, {
  headers: { apikey: value("SUPABASE_SECRET_KEY") },
});
if (!response.ok) {
  throw new Error(`Development OpenAPI inspection failed (${response.status}).`);
}

const document = await response.json();
const failures = [];

console.log("TABLE_AND_COLUMN_CONTRACTS");
for (const [table, columns] of Object.entries(expectedTables)) {
  const properties = document.definitions?.[table]?.properties ?? null;
  const missing = properties
    ? columns.filter((column) => !(column in properties))
    : columns;
  const status = missing.length === 0 ? "PASS" : "FAIL";
  console.log(
    `${table}: ${status}${missing.length ? ` (missing ${missing.join(", ")})` : ""}`,
  );
  if (missing.length) failures.push(`table:${table}`);
}

console.log("RPC_OPENAPI_CONTRACTS");
for (const rpc of expectedRpcs) {
  const status = document.paths?.[`/rpc/${rpc}`] ? "PASS" : "FAIL";
  console.log(`${rpc}: ${status}`);
  if (status === "FAIL") failures.push(`rpc:${rpc}`);
}

if (failures.length) {
  throw new Error(
    `Development OpenAPI audit found ${failures.length} missing contract(s).`,
  );
}
