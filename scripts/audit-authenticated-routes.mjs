import { createServerClient } from "@supabase/ssr";

import { loadLocalTestEnvironment } from "../lib/testing/local-environment.mjs";

loadLocalTestEnvironment();

function value(name) {
  const result = process.env[name]?.trim();
  if (!result) throw new Error(`Missing required QA variable ${name}.`);
  return result;
}

function normalizeUrl(input) {
  return new URL(input).href.replace(/\/$/, "");
}

const configuredUrl = normalizeUrl(value("NEXT_PUBLIC_SUPABASE_URL"));
const expectedUrl = normalizeUrl(value("E2E_EXPECTED_SUPABASE_URL"));
const baseUrl = normalizeUrl(
  process.env.E2E_BASE_URL?.trim() ||
    process.env.PLAYWRIGHT_BASE_URL?.trim() ||
    "http://localhost:3000",
);
if (
  value("E2E_TARGET_ENV") !== "development" ||
  configuredUrl !== expectedUrl ||
  !["localhost", "127.0.0.1", "::1"].includes(new URL(baseUrl).hostname)
) {
  throw new Error("Development route-audit guard failed; no login was attempted.");
}

const root = await fetch(baseUrl, { redirect: "manual" });
if (
  root.status !== 200 ||
  !(root.headers.get("content-security-policy") ?? "").includes(
    new URL(expectedUrl).host,
  )
) {
  throw new Error("The local application is not pinned to the expected development project.");
}

const routes = [
  "/dashboard",
  "/search",
  "/library",
  "/watch-next",
  "/schedule",
  "/lists",
  "/picker",
  "/recommendations",
  "/statistics",
  "/import",
  "/settings",
  "/settings/profile",
  "/settings/preferences",
  "/settings/notifications",
  "/settings/data",
];

async function auditUser(label, emailName, passwordName) {
  let cookies = [];
  const client = createServerClient(
    configuredUrl,
    value("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll: () => cookies,
        setAll: (updates) => {
          for (const update of updates) {
            cookies = cookies.filter((cookie) => cookie.name !== update.name);
            cookies.push({ name: update.name, value: update.value });
          }
        },
      },
    },
  );

  const login = await client.auth.signInWithPassword({
    email: value(emailName),
    password: value(passwordName),
  });
  if (login.error || !login.data.user) {
    throw new Error(`${label} authentication failed safely (${login.error?.code ?? "unknown"}).`);
  }

  const cookieHeader = () =>
    cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  let passed = 0;
  for (const route of routes) {
    const response = await fetch(`${baseUrl}${route}`, {
      headers: { cookie: cookieHeader() },
      redirect: "manual",
    });
    const body = await response.text();
    if (response.status !== 200 || /Application error|Internal Server Error/i.test(body)) {
      throw new Error(`${label} route audit failed for ${route} (${response.status}).`);
    }
    passed += 1;
  }

  const movie = await client
    .from("user_movies")
    .select("movie_id")
    .eq("user_id", login.data.user.id)
    .limit(1)
    .maybeSingle();
  if (movie.error) throw new Error(`${label} owned movie lookup failed (${movie.error.code}).`);
  if (movie.data?.movie_id) {
    const response = await fetch(`${baseUrl}/library/${movie.data.movie_id}`, {
      headers: { cookie: cookieHeader() },
      redirect: "manual",
    });
    if (response.status !== 200) throw new Error(`${label} movie detail returned ${response.status}.`);
  }

  const list = await client
    .from("lists")
    .select("id")
    .eq("user_id", login.data.user.id)
    .limit(1)
    .maybeSingle();
  if (list.error) throw new Error(`${label} owned list lookup failed (${list.error.code}).`);
  if (list.data?.id) {
    const response = await fetch(`${baseUrl}/lists/${list.data.id}`, {
      headers: { cookie: cookieHeader() },
      redirect: "manual",
    });
    if (response.status !== 200) throw new Error(`${label} list detail returned ${response.status}.`);
  }

  await client.auth.signOut({ scope: "local" });
  console.log(`${label}: ${passed}/${routes.length} protected routes passed`);
  console.log(`${label}: owned movie detail ${movie.data?.movie_id ? "passed" : "not available"}`);
  console.log(`${label}: owned list detail ${list.data?.id ? "passed" : "not available"}`);
}

await auditUser("QA A", "E2E_USER_A_EMAIL", "E2E_USER_A_PASSWORD");
await auditUser("QA B", "E2E_USER_B_EMAIL", "E2E_USER_B_PASSWORD");
