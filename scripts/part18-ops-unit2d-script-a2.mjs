// SCRIPT_A2: reconfigure only the paused watchflow-dev calendar QStash schedule.
// PREPARED ONLY. Do not run without separate human approval.
// signInWithPassword creates a QA User A Auth session; all WatchFlow data calls
// are reads. The only durable configuration mutation is the exact QStash
// calendar schedule replacement and its fail-safe pause. Google Calendar calls
// are exact-event GETs; the approved OAuth refresh grant is used in memory.
// Explicit --postcheck-only mode performs reads only and never enters the
// replacement/pause path or creates a Supabase Auth session.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { loadLocalTestEnvironment } from "../lib/testing/local-environment.mjs";
import { CALENDAR_CONTRACT, decodeEventPage, summarizeEvents, SafeFailure as EventFailure } from "./part18-ops-unit2d-qstash-events.mjs";

const PIN = "ckwadpmvxieekjlsfcks";
const BRANCH = "codex/part-18-production-operations";
const CONNECTION_ID = "e652e5c8-f08c-4736-88d8-073bce772ccc";
const JOB_ID = "b9eb8a77-0723-675b-3f2b-8503a0781ab8";
const USER_MOVIE_ID = "9152882e-291a-47a2-b964-c1a4a6dd9630";
const SOURCE_KEY = "589038a338f409210b819e6a7e0e871c";
const SOURCE_VERSION = "8ca7b4e9cabaac13bdda45d0089f3169";
const EVENT_ID = "a2ab6758f9fedbb0344d416ac00f2ca7d";
const CALENDAR_SCHEDULE = "watchflow-dev-part18-ops-unit2d-calendar";
const REMINDER_SCHEDULE = "watchflow-dev-part18-ops-unit2d-reminders";
const DESTINATION = "https://watchflow-dev-ops.vercel.app/api/internal/calendar/sync";
const REMINDER_DESTINATION =
  "https://watchflow-dev-ops.vercel.app/api/internal/notifications/scheduled-reminders";
const QSTASH = "https://qstash-eu-central-1.upstash.io/v2";
const OLD_CRON = "0 0 1 1 *";
const NEW_CRON = "4-59/5 * * * *";
const LABELS = ["watchflow-dev", "part18-ops-unit2d", "calendar"];
const ACTIONABLE_STATES = ["pending", "retryable", "leased"];
const DELIVERY_ATTEMPT_STATES = new Set([
  "ACTIVE", "RETRY", "ERROR", "DELIVERED", "FAILED",
]);

let stage = "PRECHECK";
let replacementAttempted = false;
let pauseAttempted = false;

class SafeFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function requireCondition(condition, code) {
  if (!condition) throw new SafeFailure(code);
}

function safeCode(error) {
  return error instanceof SafeFailure || error instanceof EventFailure ? error.code : "UNEXPECTED_FAILURE";
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  requireCondition(Boolean(value), `MISSING_${name}`);
  return value;
}

async function readJson(url, token, code, extraHeaders = {}) {
  const response = await fetch(url, {
    method: "GET",
    redirect: "error",
    headers: { authorization: `Bearer ${token}`, ...extraHeaders },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  requireCondition(response.ok, code);
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

async function loadApprovedCalendarPath() {
  // jiti loads the existing server-only TypeScript modules in this Node CLI.
  // Disable its transpilation cache so no module output is written to disk.
  const { default: createJITI } = await import("jiti");
  const load = createJITI(import.meta.url, {
    alias: { "server-only": resolve("node_modules/server-only/empty.js") },
    cache: false,
  });
  const store = load("../lib/calendar/oauth-store.ts");
  const crypto = load("../lib/calendar/token-encryption.ts");
  const transport = load("../lib/calendar/google-calendar-transport.ts");
  requireCondition(
    typeof store.readGoogleCalendarCredential === "function" &&
      typeof crypto.decryptCalendarRefreshToken === "function" &&
      typeof transport.refreshGoogleCalendarAccessToken === "function",
    "APPROVED_CALENDAR_PATH_UNAVAILABLE",
  );
  return {
    readCredential: store.readGoogleCalendarCredential,
    decryptCredential: crypto.decryptCalendarRefreshToken,
    refreshAccess: transport.refreshGoogleCalendarAccessToken,
  };
}

function verifyRedactedAuthorization(schedule, schedulerSecret) {
  const entries = Object.entries(schedule.header ?? {});
  const auth = entries.filter(([name]) => /^(Upstash-Forward-)?Authorization$/i.test(name));
  const contentType = entries.filter(([name]) => /^Content-Type$/i.test(name));
  requireCondition(
    auth.length === 1 &&
      contentType.length <= 1 &&
      entries.length === auth.length + contentType.length,
    "SCHEDULE_HEADERS_MISMATCH",
  );
  const values = auth[0][1];
  const expectedHash = createHash("sha256")
    .update(`Bearer ${schedulerSecret}`)
    .digest("hex");
  requireCondition(
    Array.isArray(values) &&
      values.length === 1 &&
      values[0] === `REDACTED:${expectedHash}`,
    "REDACTED_AUTHORIZATION_MISMATCH",
  );
}

export function verifyCalendarSchedule(schedule, expectedCron, schedulerSecret) {
  requireCondition(
    schedule.scheduleId === CALENDAR_SCHEDULE &&
      schedule.destination === DESTINATION &&
      schedule.method === "GET" &&
      schedule.cron === expectedCron &&
      schedule.retries === 0 &&
      schedule.timeout === 55000 &&
      schedule.isPaused === true,
    "CALENDAR_SCHEDULE_MISMATCH",
  );
  requireCondition(
    Array.isArray(schedule.labels) &&
      schedule.labels.length === LABELS.length &&
      [...schedule.labels].sort().join(",") === [...LABELS].sort().join(","),
    "CALENDAR_LABELS_MISMATCH",
  );
  verifyRedactedAuthorization(schedule, schedulerSecret);
}

async function getCalendarSchedule(token) {
  return readJson(
    `${QSTASH}/schedules/${encodeURIComponent(CALENDAR_SCHEDULE)}`,
    token,
    "CALENDAR_SCHEDULE_READ_FAILED",
  );
}

async function verifyReminderSchedule(token) {
  const reminder = await readJson(
    `${QSTASH}/schedules/${encodeURIComponent(REMINDER_SCHEDULE)}`,
    token,
    "REMINDER_SCHEDULE_READ_FAILED",
  );
  requireCondition(
    reminder.scheduleId === REMINDER_SCHEDULE &&
      reminder.isPaused === true &&
      reminder.destination === REMINDER_DESTINATION,
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
      "GITHUB_GATE_READ_FAILED",
      { accept: "application/vnd.github+json" },
    );
    requireCondition(row.name === name && row.value === "false", "GITHUB_GATE_NOT_FALSE");
  }
}

async function readFixture(qa, admin, ownerId) {
  const [ownerConnections, exactConnection, exactJob, connectionJobs,
    mapping, cleanup, unrelated] = await Promise.all([
    qa.from("calendar_connections").select("id").eq("provider", "google").eq("user_id", ownerId),
    qa.from("calendar_connections")
      .select("id,user_id,provider,status,sync_enabled,provider_calendar_id,provider_subject")
      .eq("id", CONNECTION_ID),
    admin.from("calendar_sync_jobs").select("*").eq("id", JOB_ID),
    admin.from("calendar_sync_jobs").select("*")
      .eq("connection_id", CONNECTION_ID).order("id"),
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
  const connection = assertOne(exactConnection, "CONNECTION_MISSING");
  requireCondition(
    connection.id === CONNECTION_ID &&
      connection.user_id === ownerId &&
      connection.provider === "google" &&
      connection.provider_calendar_id === "primary" &&
      typeof connection.provider_subject === "string" &&
      connection.provider_subject.length > 0 &&
      connection.status === "connected" &&
      connection.sync_enabled === false,
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
    "REPLACEMENT_DELETE_OR_CLEANUP_JOB_PRESENT",
  );
  assertQuery(mapping, "MAPPING_READ_FAILED");
  requireCondition(mapping.data?.length === 0, "CONTROLLED_MAPPING_PRESENT");
  assertQuery(cleanup, "CLEANUP_READ_FAILED");
  requireCondition(cleanup.count === 0, "ACTIONABLE_CLEANUP_PRESENT");
  assertQuery(unrelated, "UNRELATED_WORK_READ_FAILED");
  requireCondition(unrelated.count === 0, "UNRELATED_ACTIONABLE_WORK_PRESENT");
  return {
    providerSubject: connection.provider_subject,
    jobSnapshot: JSON.stringify(job),
  };
}

async function readExactCredential(readCredential, ownerId) {
  // oauth-store.ts invokes the service-role-only read RPC and parses bytea.
  let row;
  try {
    row = await readCredential(ownerId);
  } catch {
    throw new SafeFailure("CREDENTIAL_RPC_FAILED");
  }
  requireCondition(
    row?.connectionId === CONNECTION_ID &&
      Number.isInteger(row.keyVersion) &&
      row.keyVersion >= 1 &&
      row.keyVersion <= 32767,
    "CREDENTIAL_ID_OR_VERSION_MISMATCH",
  );
  requireCondition(
    Buffer.isBuffer(row.ciphertext) && row.ciphertext.length > 0 &&
      Buffer.isBuffer(row.nonce) && row.nonce.length === 12 &&
      Buffer.isBuffer(row.authTag) && row.authTag.length === 16,
    "CREDENTIAL_ENVELOPE_INVALID",
  );
  const fingerprint = createHash("sha256")
    .update(row.ciphertext).update(row.nonce).update(row.authTag)
    .update(String(row.keyVersion)).digest("hex");
  return { ...row, fingerprint };
}

function verifyGoogleConfigTarget() {
  requiredEnv("GOOGLE_CALENDAR_CLIENT_ID");
  requiredEnv("GOOGLE_CALENDAR_CLIENT_SECRET");
  requiredEnv("CALENDAR_TOKEN_ENCRYPTION_KEY");
  requireCondition(
    requiredEnv("GOOGLE_CALENDAR_REDIRECT_URI") ===
      "http://localhost:3000/api/calendar/google/callback",
    "GOOGLE_REDIRECT_NOT_DEV",
  );
}

async function verifyProviderEventAbsent(accessToken) {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${EVENT_ID}`,
    {
      method: "GET",
      redirect: "error",
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );
  requireCondition(response.status === 404, "GOOGLE_EVENT_NOT_PROVEN_ABSENT");
}

async function pauseExactCalendarSchedule(token) {
  pauseAttempted = true;
  const response = await fetch(
    `${QSTASH}/schedules/${encodeURIComponent(CALENDAR_SCHEDULE)}/pause`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );
  requireCondition(response.ok, "QSTASH_PAUSE_FAILED");
}

export function parseQstashLogPage(page, fromDate, toDate) {
  requireCondition(page && typeof page === "object" && !Array.isArray(page), "QSTASH_LOG_PAGE_INVALID");
  const hasLogs = Object.hasOwn(page, "logs");
  const hasEvents = Object.hasOwn(page, "events");
  requireCondition(hasLogs || hasEvents, "QSTASH_LOGS_FIELD_MISSING");
  requireCondition(!(hasLogs && hasEvents), "QSTASH_LOG_ARRAY_AMBIGUOUS");
  if (hasEvents) {
    const decoded = decodeEventPage(page, { ...CALENDAR_CONTRACT, fromDate, toDate });
    const summary = summarizeEvents(decoded.rows);
    return { matchingRows: summary.matchingRows, deliveryAttemptRows: summary.deliveryAttemptRows,
      successfulDeliveryRows: summary.successfulDeliveryRows, cursor: decoded.cursor };
  }
  // Retain the existing documented legacy logs branch, separate from the
  // newly observed events schema. Neither may silently substitute for another.
  const rows = page.logs;
  requireCondition(Array.isArray(rows), "QSTASH_LOGS_NOT_ARRAY");
  requireCondition(rows.length <= 100, "QSTASH_LOG_PAGE_TOO_LARGE");
  const cursor = page.cursor;
  requireCondition(cursor === undefined || cursor === "" ||
    (typeof cursor === "string" && /^[\x21-\x7e]{1,4096}$/.test(cursor)), "QSTASH_LOG_CURSOR_INVALID");
  let deliveryAttemptRows = 0;
  let successfulDeliveryRows = 0;
  const states = new Set(["CREATED", "ACTIVE", "RETRY", "ERROR", "DELIVERED", "FAILED", "CANCEL_REQUESTED", "CANCELLED"]);
  for (const row of rows) {
    requireCondition(row && typeof row === "object" && !Array.isArray(row) &&
      row.scheduleId === CALENDAR_SCHEDULE && Number.isSafeInteger(row.time) && row.time >= 0 &&
      (fromDate === undefined || (row.time >= fromDate && row.time <= toDate)), "QSTASH_LOG_ROW_MISMATCH");
    requireCondition(states.has(row.state), "QSTASH_LOG_STATE_INVALID");
    if (DELIVERY_ATTEMPT_STATES.has(row.state)) deliveryAttemptRows += 1;
    if (row.state === "DELIVERED") successfulDeliveryRows += 1;
  }
  // Never return headers, bodies, response contents, or message identifiers.
  return { matchingRows: rows.length, deliveryAttemptRows, successfulDeliveryRows, cursor: cursor || null };
}

export async function inspectScheduleLogs(token, fromDate, toDate, read = readJson) {
  requireCondition((fromDate === undefined && toDate === undefined) ||
    (Number.isSafeInteger(fromDate) && Number.isSafeInteger(toDate) && fromDate >= 0 && fromDate <= toDate), "QSTASH_LOG_WINDOW_INVALID");
  let cursor;
  const seenCursors = new Set();
  let matchingRows = 0;
  let deliveryAttemptRows = 0;
  let successfulDeliveryRows = 0;
  for (let pageNumber = 0; pageNumber < 1000; pageNumber += 1) {
    const url = new URL(`${QSTASH}/logs`);
    url.searchParams.set("scheduleId", CALENDAR_SCHEDULE);
    if (fromDate !== undefined) {
      url.searchParams.set("fromDate", String(fromDate));
      url.searchParams.set("toDate", String(toDate));
    }
    url.searchParams.set("count", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const raw = await read(url.toString(), token, "QSTASH_LOG_READ_FAILED");
    const page = parseQstashLogPage(raw, fromDate, toDate);
    matchingRows += page.matchingRows;
    deliveryAttemptRows += page.deliveryAttemptRows;
    successfulDeliveryRows += page.successfulDeliveryRows;
    if (page.cursor === null) {
      return { matchingRows, deliveryAttemptRows, successfulDeliveryRows, paginationComplete: true };
    }
    requireCondition(
      typeof page.cursor === "string" && !seenCursors.has(page.cursor),
      "QSTASH_LOG_CURSOR_INVALID",
    );
    seenCursors.add(page.cursor);
    cursor = page.cursor;
  }
  throw new SafeFailure("QSTASH_LOG_PAGINATION_INCOMPLETE");
}

export function parseA2Arguments(args, now = Date.now()) {
  if (args.length === 0) return { mode: "normal" };
  requireCondition(args[0] === "--postcheck-only", "UNKNOWN_ARGUMENT");
  if (args.length === 1) return { mode: "postcheck-only", scope: "retained_schedule_history" };
  requireCondition(args.length === 3, "RECOVERY_LOG_WINDOW_INVALID");
  const values = new Map();
  for (const arg of args.slice(1)) {
    const match = /^--logs-(from|to)-ms=(\d{1,16})$/.exec(arg);
    requireCondition(match && !values.has(match[1]), "RECOVERY_LOG_WINDOW_INVALID");
    values.set(match[1], Number(match[2]));
  }
  const fromDate = values.get("from");
  const toDate = values.get("to");
  requireCondition(Number.isSafeInteger(fromDate) && Number.isSafeInteger(toDate) &&
    fromDate >= 0 && fromDate <= toDate && toDate <= now, "RECOVERY_LOG_WINDOW_INVALID");
  return { mode: "postcheck-only", scope: "operator_supplied_interval", fromDate, toDate };
}

async function recoveryContext() {
  const origin = verifyLocalTarget();
  verifyGoogleConfigTarget();
  const schedulerSecret = requiredEnv("WATCHFLOW_SCHEDULER_SECRET");
  requireCondition(schedulerSecret.length >= 32, "SCHEDULER_SECRET_TOO_SHORT");
  // No signInWithPassword: every use of this client is a SELECT/HEAD or Auth
  // admin GET. The separately loaded approved credential RPC is read-only.
  const admin = createClient(origin, requiredEnv("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      const method = (init?.method || input?.method || "GET").toUpperCase();
      requireCondition(url.origin === origin && ["GET", "HEAD"].includes(method), "RECOVERY_DATABASE_WRITE_REJECTED");
      return fetch(input, { ...init, redirect: "error" });
    } },
  });
  const connection = assertOne(await admin.from("calendar_connections").select("user_id").eq("id", CONNECTION_ID), "RECOVERY_OWNER_READ_FAILED");
  const owner = await admin.auth.admin.getUserById(connection.user_id);
  requireCondition(!owner.error && owner.data.user?.id === connection.user_id &&
    owner.data.user.email?.toLowerCase() === requiredEnv("E2E_USER_A_EMAIL").toLowerCase(), "QA_A_IDENTITY_MISMATCH");
  return { admin, ownerId: connection.user_id, schedulerSecret, qstashToken: requiredEnv("QSTASH_TOKEN_EU"),
    githubToken: requiredEnv("GH_TOKEN"), approvedCalendar: await loadApprovedCalendarPath() };
}

async function recoveryAccess(context) {
  const credential = await readExactCredential(context.approvedCalendar.readCredential, context.ownerId);
  let refreshToken;
  try {
    try { refreshToken = context.approvedCalendar.decryptCredential(credential, context.ownerId); }
    catch { throw new SafeFailure("CREDENTIAL_DECRYPTION_FAILED"); }
    let access;
    try { access = await context.approvedCalendar.refreshAccess(refreshToken); }
    catch { throw new SafeFailure("GOOGLE_TOKEN_REFRESH_FAILED"); }
    requireCondition(!access.replacementRefreshToken, "GOOGLE_REFRESH_ROTATION_REQUIRES_SEPARATE_HANDLING");
    requireCondition(typeof access.accessToken === "string" && access.accessToken.length > 0, "GOOGLE_ACCESS_TOKEN_MISSING");
    return { accessToken: access.accessToken, fingerprint: credential.fingerprint };
  } finally {
    refreshToken = null;
    credential.ciphertext.fill(0); credential.nonce.fill(0); credential.authTag.fill(0);
  }
}

export async function recoverFinalResult(options, overrides = {}) {
  requireCondition(options.mode === "postcheck-only", "RECOVERY_MODE_REQUIRED");
  const io = { context: recoveryContext, fixture: readFixture, calendar: getCalendarSchedule,
    verifyCalendar: verifyCalendarSchedule, reminder: verifyReminderSchedule, gates: verifyGitHubGates,
    access: recoveryAccess, event: verifyProviderEventAbsent, logs: inspectScheduleLogs,
    credential: readExactCredential, log: console.log, ...overrides };
  stage = "RECOVERY_PRECHECK";
  const context = await io.context();
  const { admin, ownerId, qstashToken, githubToken, schedulerSecret } = context;
  const before = await io.fixture(admin, admin, ownerId);
  io.verifyCalendar(await io.calendar(qstashToken), NEW_CRON, schedulerSecret);
  await io.reminder(qstashToken);
  await io.gates(githubToken);
  const access = await io.access(context);
  try {
    await io.event(access.accessToken);
    const failures = [];
    const check = async (name, fn) => {
      try { return await fn(); }
      catch (error) { failures.push(`${name}_${safeCode(error)}`); return null; }
    };
    stage = "RECOVERY_LOG_INSPECTION";
    const logs = await check("LOGS", async () => {
      const result = await io.logs(qstashToken, options.fromDate, options.toDate);
      requireCondition(result?.paginationComplete === true &&
        [result.matchingRows, result.deliveryAttemptRows, result.successfulDeliveryRows].every(value => Number.isSafeInteger(value) && value >= 0) &&
        result.successfulDeliveryRows <= result.deliveryAttemptRows && result.deliveryAttemptRows <= result.matchingRows, "QSTASH_LOG_RESULT_INCOMPLETE");
      return result;
    });
    io.log(`SCRIPT_A2_RECOVERY_LOGS scope=${options.scope} incident_window_known=${options.fromDate !== undefined} ` +
      "incident_window_transport_count=UNKNOWN retention_scope_only=true " +
      `matchingRows=${logs?.matchingRows ?? "unknown"} deliveryAttemptRows=${logs?.deliveryAttemptRows ?? "unknown"} ` +
      `successfulDeliveryRows=${logs?.successfulDeliveryRows ?? "unknown"} paginationComplete=${logs?.paginationComplete ?? false}`);
    stage = "RECOVERY_SAFETY_RECHECK";
    await check("FIXTURE", async () => {
      const after = await io.fixture(admin, admin, ownerId);
      requireCondition(after.jobSnapshot === before.jobSnapshot && after.providerSubject === before.providerSubject, "RECOVERY_FIXTURE_CHANGED");
      const credential = await io.credential(context.approvedCalendar.readCredential, ownerId);
      try { requireCondition(credential.fingerprint === access.fingerprint, "CREDENTIAL_CHANGED"); }
      finally { credential.ciphertext.fill(0); credential.nonce.fill(0); credential.authTag.fill(0); }
    });
    await check("GOOGLE_EVENT", () => io.event(access.accessToken));
    await check("CALENDAR", async () => io.verifyCalendar(await io.calendar(qstashToken), NEW_CRON, schedulerSecret));
    await check("REMINDER", () => io.reminder(qstashToken));
    await check("GITHUB", () => io.gates(githubToken));
    io.log(`SCRIPT_A2_RECOVERY_SAFETY application_safe=${failures.every(code => code.startsWith("LOGS_"))} ` +
      "replacement_attempted=false pause_attempted=false");
    stage = "RECOVERY_FINAL_RESULT";
    requireCondition(!replacementAttempted && !pauseAttempted, "RECOVERY_MUTATION_PATH_REJECTED");
    requireCondition(failures.length === 0, failures[0] ?? "RECOVERY_POSTCHECK_FAILURE");
    io.log("SCRIPT_A2_RECOVERED_PASS: acceptance calendar schedule paused; QA upsert preserved; read-only recovery complete.");
    return { logs, scope: options.scope };
  } finally { access.accessToken = null; }
}

export async function dispatchA2(args, overrides = {}) {
  const options = parseA2Arguments(args);
  if (options.mode === "postcheck-only") return (overrides.recover ?? recoverFinalResult)(options);
  return (overrides.normal ?? main)();
}

async function typedConfirmation() {
  requireCondition(process.stdin.isTTY && process.stdout.isTTY, "TTY_REQUIRED");
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  let answer;
  try {
    answer = await prompt.question(
      "Type APPROVE_QSTASH_CALENDAR_CRON_RECONFIGURATION to replace the calendar schedule: ",
    );
  } finally {
    prompt.close();
  }
  requireCondition(
    answer === "APPROVE_QSTASH_CALENDAR_CRON_RECONFIGURATION",
    "CONFIRMATION_MISMATCH",
  );
}

async function main() {
  const origin = verifyLocalTarget();
  const qstashToken = requiredEnv("QSTASH_TOKEN_EU");
  const githubToken = requiredEnv("GH_TOKEN");
  const publicKey = requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const secretKey = requiredEnv("SUPABASE_SECRET_KEY");
  const qaEmail = requiredEnv("E2E_USER_A_EMAIL");
  const qaPassword = requiredEnv("E2E_USER_A_PASSWORD");
  const schedulerSecret = requiredEnv("WATCHFLOW_SCHEDULER_SECRET");
  requireCondition(schedulerSecret.length >= 32, "SCHEDULER_SECRET_TOO_SHORT");
  verifyGoogleConfigTarget();
  const approvedCalendar = await loadApprovedCalendarPath();

  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const qa = createClient(origin, publicKey, options);
  const signIn = await qa.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
  requireCondition(!signIn.error && signIn.data.user, "QA_A_AUTH_FAILED");
  const verified = await qa.auth.getUser();
  requireCondition(!verified.error && verified.data.user, "QA_A_USER_UNVERIFIED");
  requireCondition(
    verified.data.user.id === signIn.data.user.id &&
      verified.data.user.email?.toLowerCase() === qaEmail.toLowerCase(),
    "QA_A_IDENTITY_MISMATCH",
  );
  const admin = createClient(origin, secretKey, options); // SELECTs and the read-only credential RPC.
  const before = await readFixture(qa, admin, verified.data.user.id);
  verifyCalendarSchedule(await getCalendarSchedule(qstashToken), OLD_CRON, schedulerSecret);
  await verifyReminderSchedule(qstashToken);
  await verifyGitHubGates(githubToken);
  const credential = await readExactCredential(
    approvedCalendar.readCredential,
    verified.data.user.id,
  );
  const credentialFingerprint = credential.fingerprint;
  let refreshToken;
  try {
    refreshToken = approvedCalendar.decryptCredential(credential, verified.data.user.id);
  } catch {
    throw new SafeFailure("CREDENTIAL_DECRYPTION_FAILED");
  } finally {
    credential.ciphertext.fill(0);
    credential.nonce.fill(0);
    credential.authTag.fill(0);
  }
  let googleAccessToken;
  try {
    let access;
    try {
      access = await approvedCalendar.refreshAccess(refreshToken);
    } catch {
      throw new SafeFailure("GOOGLE_TOKEN_REFRESH_FAILED");
    }
    if (access.replacementRefreshToken) {
      // The executor rotates before provider work. A2 has no credential write.
      access.replacementRefreshToken = null;
      access.accessToken = null;
      throw new SafeFailure("GOOGLE_REFRESH_ROTATION_REQUIRES_SEPARATE_HANDLING");
    }
    requireCondition(
      typeof access.accessToken === "string" && access.accessToken.length > 0,
      "GOOGLE_ACCESS_TOKEN_MISSING",
    );
    googleAccessToken = access.accessToken;
    access.accessToken = null;
  } finally {
    refreshToken = null;
  }
  await verifyProviderEventAbsent(googleAccessToken);

  stage = "PRE_MUTATION_RECHECK";
  const justBefore = await readFixture(qa, admin, verified.data.user.id);
  requireCondition(justBefore.jobSnapshot === before.jobSnapshot, "JOB_CHANGED_BEFORE_REPLACEMENT");
  verifyCalendarSchedule(await getCalendarSchedule(qstashToken), OLD_CRON, schedulerSecret);
  await verifyReminderSchedule(qstashToken);
  await verifyGitHubGates(githubToken);

  stage = "CONFIRMATION";
  await typedConfirmation();

  // A human may leave the prompt open. Recheck the independent gate after it.
  stage = "FINAL_BOUNDARY_RECHECK";
  const atBoundary = await readFixture(qa, admin, verified.data.user.id);
  requireCondition(
    atBoundary.jobSnapshot === before.jobSnapshot,
    "JOB_CHANGED_AT_REPLACEMENT_BOUNDARY",
  );
  verifyCalendarSchedule(await getCalendarSchedule(qstashToken), OLD_CRON, schedulerSecret);
  await verifyReminderSchedule(qstashToken);
  await verifyGitHubGates(githubToken);

  // The independent database claim gate is still sync_enabled=false.
  // Replacement can reset isPaused; always pause, even on a transport error.
  stage = "QSTASH_REPLACEMENT";
  const windowStart = Date.now();
  let replacementResponse;
  let replacementError = null;
  let pauseError = null;
  try {
    replacementAttempted = true;
    replacementResponse = await fetch(`${QSTASH}/schedules/${DESTINATION}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${qstashToken}`,
        "Upstash-Schedule-Id": CALENDAR_SCHEDULE,
        "Upstash-Cron": NEW_CRON,
        "Upstash-Method": "GET",
        "Upstash-Retries": "0",
        "Upstash-Timeout": "55s",
        "Upstash-Label": LABELS.join(","),
        "Upstash-Forward-Authorization": `Bearer ${schedulerSecret}`,
        "Upstash-Redact-Fields": "header[Authorization]",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    replacementError = safeCode(error);
  } finally {
    stage = "QSTASH_PAUSE_FINALLY";
    try {
      await pauseExactCalendarSchedule(qstashToken);
    } catch (error) {
      pauseError = safeCode(error);
    }
  }
  if (!replacementError) {
    try {
      requireCondition(replacementResponse?.ok, "QSTASH_REPLACEMENT_FAILED");
      const body = await replacementResponse.json();
      requireCondition(body.scheduleId === CALENDAR_SCHEDULE, "QSTASH_REPLACEMENT_ID_MISMATCH");
    } catch (error) {
      replacementError = safeCode(error);
    }
  }

  // Each postcheck runs even if another one fails. Log transport rows are
  // evidence to report, not an automatic failure of the database claim gate.
  const postFailures = [];
  async function check(name, fn) {
    try {
      return await fn();
    } catch (error) {
      postFailures.push(`${name}_${safeCode(error)}`);
      return null;
    }
  }

  stage = "POSTCHECK_SCHEDULE";
  await check("SCHEDULE", async () => {
    let schedule = await getCalendarSchedule(qstashToken);
    if (schedule.isPaused !== true) {
      await pauseExactCalendarSchedule(qstashToken);
      schedule = await getCalendarSchedule(qstashToken);
    }
    verifyCalendarSchedule(schedule, NEW_CRON, schedulerSecret);
  });
  const windowEnd = Date.now();
  stage = "LOG_INSPECTION";
  const logs = await check("LOGS", () =>
    inspectScheduleLogs(qstashToken, windowStart, windowEnd),
  );
  console.log(
    `SCRIPT_A2_LOGS matchingRows=${logs?.matchingRows ?? "unknown"} ` +
    `deliveryAttemptRows=${logs?.deliveryAttemptRows ?? "unknown"} ` +
    `successfulDeliveryRows=${logs?.successfulDeliveryRows ?? "unknown"} ` +
    `paginationComplete=${logs?.paginationComplete ?? false}`,
  );

  stage = "POSTCHECK_INDEPENDENT_GATE";
  await check("FIXTURE", async () => {
    const after = await readFixture(qa, admin, verified.data.user.id);
    requireCondition(after.jobSnapshot === before.jobSnapshot, "JOB_CHANGED_DURING_REPLACEMENT");
    requireCondition(after.providerSubject === before.providerSubject, "PROVIDER_SUBJECT_CHANGED");
    const afterCredential = await readExactCredential(
      approvedCalendar.readCredential,
      verified.data.user.id,
    );
    try {
      requireCondition(afterCredential.fingerprint === credentialFingerprint, "CREDENTIAL_CHANGED");
    } finally {
      afterCredential.ciphertext.fill(0);
      afterCredential.nonce.fill(0);
      afterCredential.authTag.fill(0);
    }
  });
  await check("GOOGLE_EVENT", () =>
    verifyProviderEventAbsent(googleAccessToken),
  );
  await check("REMINDER", () => verifyReminderSchedule(qstashToken));
  await check("GITHUB", () => verifyGitHubGates(githubToken));

  stage = "FINAL_RESULT";
  requireCondition(!pauseError, `QSTASH_PAUSE_${pauseError}`);
  requireCondition(!replacementError, `QSTASH_REPLACEMENT_${replacementError}`);
  requireCondition(postFailures.length === 0, postFailures[0] ?? "POSTCHECK_FAILURE");
  console.log("SCRIPT_A2_PASS: calendar cron reconfigured; schedule paused; QA upsert preserved.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await dispatchA2(process.argv.slice(2));
  } catch (error) {
    console.error(
      `SCRIPT_A2_FAIL stage=${stage} error=${safeCode(error)} ` +
      `replacement_attempted=${replacementAttempted} pause_attempted=${pauseAttempted}`,
    );
    process.exitCode = 1;
  }
}
