// SCRIPT_A1: controlled QA User A calendar pause. PREPARED ONLY; DO NOT RUN YET.
// Requires SUPABASE_ACCESS_TOKEN (migration read), QSTASH_TOKEN_EU (schedule
// read), and GH_TOKEN (repository variable read) at execution time.
// signInWithPassword creates an Auth session. The only WatchFlow application-data
// mutation is QA User A's authenticated sync-toggle RPC. On any failure after
// that call, this script stops and deliberately does not resume sync.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";

import { loadLocalTestEnvironment } from "../lib/testing/local-environment.mjs";

const PIN = "ckwadpmvxieekjlsfcks";
const BRANCH = "codex/part-18-production-operations";
const CONNECTION_ID = "e652e5c8-f08c-4736-88d8-073bce772ccc";
const JOB_ID = "b9eb8a77-0723-675b-3f2b-8503a0781ab8";
const SOURCE_KEY = "589038a338f409210b819e6a7e0e871c";
const SOURCE_VERSION = "8ca7b4e9cabaac13bdda45d0089f3169";
const USER_MOVIE_ID = "9152882e-291a-47a2-b964-c1a4a6dd9630";
const CALENDAR_SCHEDULE = "watchflow-dev-part18-ops-unit2d-calendar";
const REMINDER_SCHEDULE = "watchflow-dev-part18-ops-unit2d-reminders";
const ACTIONABLE_STATES = ["pending", "retryable", "leased"];
const MIGRATIONS = [
  ["202609300002", "part_18j_c_pause_claim_guard"],
  ["202609300004", "part_18j_c_preserve_paused_desired_state"],
  ["202609300005", "part_18j_d_disconnect_reconciliation"],
];

let pauseAttempted = false;
let stage = "PRECHECK";

class SafeFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function requireCondition(condition, code) {
  if (!condition) throw new SafeFailure(code);
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  requireCondition(Boolean(value), `MISSING_${name}`);
  return value;
}

async function readJson(url, token, code, extraHeaders = {}) {
  const response = await fetch(url, {
    method: "GET",
    headers: { authorization: `Bearer ${token}`, ...extraHeaders },
    cache: "no-store",
  });
  requireCondition(response.ok, `${code}_HTTP_${response.status}`);
  return response.json();
}

function assertQuery(result, code) {
  requireCondition(!result.error, code);
  return result;
}

function assertOne(result, code) {
  assertQuery(result, code);
  requireCondition(result.data?.length === 1, code);
  return result.data[0];
}

function verifyLocalTarget() {
  loadLocalTestEnvironment();

  const top = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
  const branch = execFileSync("git", ["branch", "--show-current"], {
    encoding: "utf8",
  }).trim();
  requireCondition(resolve(top).toLowerCase() === "e:\\watchflow", "WRONG_REPOSITORY");
  requireCondition(branch === BRANCH, "WRONG_BRANCH");

  const origin = new URL(requiredEnv("NEXT_PUBLIC_SUPABASE_URL")).origin;
  const expected = new URL(requiredEnv("E2E_EXPECTED_SUPABASE_URL")).origin;
  const linked = readFileSync("supabase/.temp/project-ref", "utf8").trim();
  const linkedInfo = JSON.parse(
    readFileSync("supabase/.temp/linked-project.json", "utf8"),
  );
  requireCondition(origin === `https://${PIN}.supabase.co`, "WRONG_SUPABASE_ORIGIN");
  requireCondition(expected === origin, "EXPECTED_ORIGIN_MISMATCH");
  requireCondition(linked === PIN && linkedInfo.ref === PIN, "WRONG_LINKED_PROJECT");
  requireCondition(
    process.env.E2E_EXPECTED_SUPABASE_PROJECT_REF === PIN &&
      process.env.E2E_TARGET_ENV === "development",
    "WRONG_E2E_TARGET",
  );
  return origin;
}

async function verifyMigrations(token) {
  for (const [version, name] of MIGRATIONS) {
    const row = await readJson(
      `https://api.supabase.com/v1/projects/${PIN}/database/migrations/${version}`,
      token,
      `MIGRATION_${version}_UNVERIFIED`,
    );
    requireCondition(
      row.version === version && row.name === name,
      `MIGRATION_${version}_MISMATCH`,
    );
  }
}

async function verifyQStash(token) {
  const base = "https://qstash-eu-central-1.upstash.io/v2/schedules/";
  const calendar = await readJson(
    base + encodeURIComponent(CALENDAR_SCHEDULE),
    token,
    "CALENDAR_SCHEDULE_UNVERIFIED",
  );
  const reminder = await readJson(
    base + encodeURIComponent(REMINDER_SCHEDULE),
    token,
    "REMINDER_SCHEDULE_UNVERIFIED",
  );
  requireCondition(
    calendar.scheduleId === CALENDAR_SCHEDULE &&
      calendar.isPaused === true &&
      calendar.cron === "0 0 1 1 *" &&
      calendar.method === "GET" &&
      calendar.retries === 0 &&
      calendar.timeout === 55000 &&
      calendar.destination ===
        "https://watchflow-dev-ops.vercel.app/api/internal/calendar/sync",
    "CALENDAR_SCHEDULE_MISMATCH",
  );
  requireCondition(
    reminder.scheduleId === REMINDER_SCHEDULE &&
      reminder.isPaused === true &&
      reminder.destination ===
        "https://watchflow-dev-ops.vercel.app/api/internal/notifications/scheduled-reminders",
    "REMINDER_SCHEDULE_MISMATCH",
  );
}

async function verifyGitHubGates(token) {
  for (const name of [
    "WATCHFLOW_DEV_REMINDER_SCHEDULER_ENABLED",
    "WATCHFLOW_DEV_CALENDAR_SCHEDULER_ENABLED",
  ]) {
    const row = await readJson(
      `https://api.github.com/repos/hash-j/WatchFlow/actions/variables/${name}`,
      token,
      `GITHUB_${name}_UNVERIFIED`,
      { accept: "application/vnd.github+json" },
    );
    requireCondition(row.name === name && row.value === "false", `${name}_NOT_FALSE`);
  }
}

async function readFixture(qa, admin, ownerId, expectedSyncEnabled) {
  const [ownerConnections, exactConnection, exactJob, connectionJobs,
    credential, mapping, cleanup, unrelated] = await Promise.all([
    qa.from("calendar_connections").select("id").eq("provider", "google"),
    qa.from("calendar_connections")
      .select("id,user_id,provider,status,sync_enabled,provider_calendar_id")
      .eq("id", CONNECTION_ID),
    admin.from("calendar_sync_jobs").select("*").eq("id", JOB_ID),
    admin.from("calendar_sync_jobs").select("*")
      .eq("connection_id", CONNECTION_ID).order("id"),
    admin.from("calendar_credentials").select("connection_id")
      .eq("connection_id", CONNECTION_ID),
    admin.from("calendar_event_mappings").select("id")
      .eq("connection_id", CONNECTION_ID).eq("source_key", SOURCE_KEY),
    admin.from("calendar_sync_jobs").select("id", { count: "exact", head: true })
      .eq("connection_id", CONNECTION_ID)
      .eq("desired_operation", "connection_cleanup")
      .in("state", ACTIONABLE_STATES),
    admin.from("calendar_sync_jobs").select("id", { count: "exact", head: true })
      .in("state", ACTIONABLE_STATES).neq("id", JOB_ID),
  ]);

  assertQuery(ownerConnections, "OWNER_CONNECTION_READ_FAILED");
  requireCondition(
    ownerConnections.data?.length === 1 &&
      ownerConnections.data[0].id === CONNECTION_ID,
    "OWNER_CONNECTION_COUNT_MISMATCH",
  );
  const connection = assertOne(exactConnection, "CONNECTION_MISMATCH");
  requireCondition(
    connection.id === CONNECTION_ID &&
      connection.user_id === ownerId &&
      connection.provider === "google" &&
      connection.provider_calendar_id === "primary" &&
      connection.status === "connected" &&
      connection.sync_enabled === expectedSyncEnabled,
    "CONNECTION_STATE_MISMATCH",
  );

  const job = assertOne(exactJob, "CONTROLLED_JOB_MISSING");
  requireCondition(
    job.id === JOB_ID &&
      job.user_id === ownerId &&
      job.connection_id === CONNECTION_ID &&
      job.user_movie_id === USER_MOVIE_ID &&
      job.source_key === SOURCE_KEY &&
      job.source_version === SOURCE_VERSION &&
      job.desired_operation === "upsert" &&
      job.state === "pending" &&
      job.attempt_count === 0 &&
      job.lease_token === null &&
      job.lease_expires_at === null,
    "CONTROLLED_JOB_STATE_MISMATCH",
  );

  assertQuery(connectionJobs, "CONNECTION_JOBS_READ_FAILED");
  requireCondition(
    connectionJobs.data?.length === 1 && connectionJobs.data[0].id === JOB_ID,
    "REPLACEMENT_DELETE_OR_EXTRA_JOB",
  );
  assertQuery(credential, "CREDENTIAL_EXISTENCE_READ_FAILED");
  requireCondition(credential.data?.length === 1, "CREDENTIAL_COUNT_MISMATCH");
  assertQuery(mapping, "MAPPING_READ_FAILED");
  requireCondition(mapping.data?.length === 0, "CONTROLLED_MAPPING_PRESENT");
  assertQuery(cleanup, "CLEANUP_READ_FAILED");
  requireCondition(cleanup.count === 0, "ACTIONABLE_CLEANUP_PRESENT");
  assertQuery(unrelated, "UNRELATED_WORK_READ_FAILED");
  requireCondition(unrelated.count === 0, "UNRELATED_ACTIONABLE_WORK_PRESENT");

  return { jobSnapshot: JSON.stringify(job) };
}

async function main() {
  const origin = verifyLocalTarget();
  const managementToken = requiredEnv("SUPABASE_ACCESS_TOKEN");
  const qstashToken = requiredEnv("QSTASH_TOKEN_EU");
  const githubToken = requiredEnv("GH_TOKEN");
  const publicKey = requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const secretKey = requiredEnv("SUPABASE_SECRET_KEY");
  const qaEmail = requiredEnv("E2E_USER_A_EMAIL");
  const qaPassword = requiredEnv("E2E_USER_A_PASSWORD");

  // PRECHECK: all remote reads complete before the pause RPC.
  await verifyMigrations(managementToken);
  await verifyQStash(qstashToken);
  await verifyGitHubGates(githubToken);

  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const qa = createClient(origin, publicKey, options);
  const signIn = await qa.auth.signInWithPassword({
    email: qaEmail,
    password: qaPassword,
  });
  requireCondition(!signIn.error && signIn.data.user, "QA_A_AUTH_FAILED");
  const verified = await qa.auth.getUser();
  requireCondition(!verified.error && verified.data.user, "QA_A_USER_UNVERIFIED");
  requireCondition(
    verified.data.user.id === signIn.data.user.id &&
      verified.data.user.email?.toLowerCase() === qaEmail.toLowerCase(),
    "QA_A_IDENTITY_MISMATCH",
  );
  const ownerId = verified.data.user.id;

  // Service role is restricted to pre/post reads. The pause uses qa.rpc below.
  const admin = createClient(origin, secretKey, options);
  const before = await readFixture(qa, admin, ownerId, true);
  await verifyQStash(qstashToken);
  await verifyGitHubGates(githubToken);

  // Re-read the controlled fixture and external holds at the pause boundary.
  stage = "PRE_MUTATION_RECHECK";
  const immediatelyBefore = await readFixture(qa, admin, ownerId, true);
  requireCondition(
    immediatelyBefore.jobSnapshot === before.jobSnapshot,
    "JOB_CHANGED_BEFORE_PAUSE",
  );
  await verifyQStash(qstashToken);
  await verifyGitHubGates(githubToken);

  stage = "CONFIRMATION";
  requireCondition(process.stdin.isTTY && process.stdout.isTTY, "TTY_REQUIRED");
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  let confirmation;
  try {
    confirmation = await prompt.question(
      "Type APPROVE_QA_USER_A_CALENDAR_PAUSE to pause QA User A calendar sync: ",
    );
  } finally {
    prompt.close();
  }
  requireCondition(
    confirmation === "APPROVE_QA_USER_A_CALENDAR_PAUSE",
    "CONFIRMATION_MISMATCH",
  );

  // PAUSE: the single WatchFlow data write, through QA User A's authenticated client.
  stage = "PAUSE_RPC";
  pauseAttempted = true;
  const result = await qa.rpc("watchflow_set_calendar_sync_enabled", {
    p_enabled: false,
  });
  requireCondition(!result.error && result.data === true, "OWNER_PAUSE_RPC_FAILED");

  // POSTCHECK: prove the same upsert is pending and all external holds remain.
  stage = "POSTCHECK";
  const after = await readFixture(qa, admin, ownerId, false);
  requireCondition(after.jobSnapshot === before.jobSnapshot, "JOB_CHANGED_DURING_PAUSE");
  await verifyQStash(qstashToken);
  await verifyGitHubGates(githubToken);

  console.log("SCRIPT_A1_PASS: owner-bound pause verified; controlled upsert preserved.");
}

try {
  await main();
} catch (error) {
  const code = error instanceof SafeFailure ? error.code : "UNEXPECTED_FAILURE";
  console.error(
    `SCRIPT_A1_FAIL stage=${stage} error=${code} pause_attempted=${pauseAttempted}`,
  );
  process.exitCode = 1;
}
