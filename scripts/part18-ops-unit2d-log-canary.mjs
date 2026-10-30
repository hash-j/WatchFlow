// PREPARED ONLY. Do not run while preparing or reviewing this checkpoint.
// Canary-only schedule mutations; no publish endpoint or real-schedule writes.
// The unauthenticated canary GET is a pinned, verified static development SVG.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { loadLocalTestEnvironment } from "../lib/testing/local-environment.mjs";
import { canonical, checkLocalTarget, SafeFailure as GoogleFailure } from "./part18j-google-reauth-checkpoint.mjs";
import { SafeFailure, googleAbsent, verifyRepositoryContracts } from "./part18-ops-unit2d-sync-reenable.mjs";
import { assertClock, checkHolds, readOwner, snapshot, verifyPre } from "./part18-ops-unit2d-first-automatic.mjs";
import { CANARY_CONTRACT, decodeEventPage, summarizeEvents, readCanaryEvidence } from "./part18-ops-unit2d-qstash-events.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const API = "https://qstash-eu-central-1.upstash.io/v2";
export const CANARY = "watchflow-dev-part18-ops-unit2d-log-canary";
export const DESTINATION = "https://watchflow-dev-ops.vercel.app/icons/watchflow-icon.svg";
export const LABELS = ["watchflow-dev", "part18-ops-unit2d", "log-canary"];
export const CONFIRMATION = "APPROVE_QSTASH_LOG_CANARY";
export const EVIDENCE_PATH = resolve(ROOT, "supabase/.temp/part18-unit2d-log-canary-evidence.json");
const ASSET_HASH = "0a992986fdfe218c7d568de85d5d9028a7e8b1ca064d06f3fff8787909ef954d";
const SOURCE_PINS = { "proxy.ts": "9093b1241e694bdad2bad64ed5c70062bb291c0ad426aa815d9e0ed48a481bdf",
  "next.config.ts": "2c5c3a9fede396ab5370284c143ae5cc93a3a29bdb1a708dcda7cd9e2f6aca74",
  "vercel.watchflow-dev.json": "84c8e95a171ed1dc3050fce40d92b9cc44374289fe857a0696572d849012cdf7" };
const requireSafe = (ok, code) => { if (!ok) throw new SafeFailure(code); };
const env = name => { const value = process.env[name]; requireSafe(typeof value === "string" && value.length > 0, `MISSING_${name}`); return value; };
const normalize = value => value.replace(/\r\n/g, "\n").trim();
const sha = value => createHash("sha256").update(value).digest("hex");
const digest = value => sha(canonical(value));
export function safeErrorCode(error, fallback = "CANARY_OPERATION_FAILED") {
  // A2 has a separate SafeFailure class (including a code property). Preserve
  // trusted codes across module/loader boundaries, never arbitrary messages.
  const safe = error instanceof SafeFailure || error instanceof GoogleFailure || error?.constructor?.name === "SafeFailure";
  const value = typeof error?.code === "string" ? error.code : error?.message;
  return safe && typeof value === "string" && /^[A-Z][A-Z0-9_]{0,127}(?: classification=(?:invalid_grant|invalid_client|unauthorized_client|network_error|malformed_response|replacement_refresh_token_returned|other_safe_classification))?$/.test(value) ? value : fallback;
}
const code = safeErrorCode;
const PRECHECK_STAGES = new Set(["CANARY_PRECHECK_CONTEXT_FAILED", "CANARY_PRECHECK_TARGET_FAILED", "CANARY_PRECHECK_CALENDAR_MODULES_FAILED",
  "CANARY_PRECHECK_CAPTURE_FAILED", "CANARY_PRECHECK_ASSET_FAILED", "CANARY_PRECHECK_LOOKUP_FAILED", "CANARY_PRECHECK_GOOGLE_FAILED",
  "APPLICATION_SNAPSHOT_FAILED", "REAL_SCHEDULE_STATE_INVALID", "ASSET_VERIFY_FAILED", "CANARY_LOOKUP_FAILED", "QSTASH_READ_FAILED", "GITHUB_READ_FAILED"]);
export function formatCanaryStop(error) {
  return `CANARY_STOP code=${code(error)}${PRECHECK_STAGES.has(error?.stage) ? ` stage=${error.stage}` : ""}`;
}
export async function precheckStage(stage, operation) {
  try { return await operation(); }
  catch (error) {
    const failure = new SafeFailure(code(error, stage));
    failure.stage = PRECHECK_STAGES.has(error?.stage) ? error.stage : stage;
    throw failure;
  }
}
export function requirePrecheckEnvironment(environment = process.env, exists = existsSync) {
  for (const name of ["SUPABASE_DB_PASSWORD", "QSTASH_TOKEN_EU", "GH_TOKEN"]) {
    requireSafe(typeof environment[name] === "string" && environment[name].length > 0, `MISSING_${name}`);
  }
  // Like the working PG operators, a custom CA is optional if system trust
  // suffices. A configured missing file, or untrusted TLS without a CA, is explicit.
  if (environment.SUPABASE_DB_CA_CERT_PATH) requireSafe(exists(resolve(ROOT, environment.SUPABASE_DB_CA_CERT_PATH)), "MISSING_SUPABASE_DB_CA_CERT_PATH");
}
function localTarget() {
  // Reuse the working no-login guard; retain the previous repository, source
  // and scheduler-strength pins without requiring a QA password/public key.
  checkLocalTarget();
  requireSafe(ROOT.toLowerCase() === "e:\\watchflow", "REPOSITORY_OR_BRANCH_MISMATCH");
  verifyRepositoryContracts();
  requireSafe(env("WATCHFLOW_SCHEDULER_SECRET").length >= 32, "SCHEDULER_SECRET_INVALID");
}
export function classifyPgFailure(error, caPath = process.env.SUPABASE_DB_CA_CERT_PATH) {
  const existing = code(error, null);
  if (existing) return new SafeFailure(existing);
  const values = [error?.code, error?.cause?.code];
  if (values.some(value => ["28P01", "28000"].includes(value))) return new SafeFailure("PG_AUTH_FAILED");
  if (values.some(value => /^(ERR_TLS_|ERR_SSL_)/.test(value ?? "") ||
    ["SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "CERT_HAS_EXPIRED"].includes(value))) {
    return new SafeFailure(!caPath && values.some(value => ["SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY"].includes(value)) ? "MISSING_SUPABASE_DB_CA_CERT_PATH" : "PG_TLS_FAILED");
  }
  if (values.some(value => ["ENOTFOUND", "EAI_AGAIN"].includes(value))) return new SafeFailure("PG_DNS_FAILED");
  if (values.includes("ETIMEDOUT")) return new SafeFailure("PG_CONNECT_TIMEOUT");
  return new SafeFailure("APPLICATION_SNAPSHOT_FAILED");
}
export function classifiedPgClient(Client = pg.Client) {
  // Keep the proven pooler configuration, CA/TLS policy and SELECT transaction.
  // Classify errors before the shared snapshot helper's generic catch consumes them.
  return class extends Client {
    async connect(...args) { try { return await super.connect(...args); } catch (error) { throw classifyPgFailure(error); } }
    async query(...args) { try { return await super.query(...args); } catch (error) { throw classifyPgFailure(error); } }
  };
}
export async function readPrecheckJson(url, token, extraHeaders = {}, fetcher = fetch) {
  const origin = new URL(url).origin;
  const qstash = origin === "https://qstash-eu-central-1.upstash.io";
  const github = origin === "https://api.github.com";
  const fallback = qstash ? "QSTASH_READ_FAILED" : github ? "GITHUB_READ_FAILED" : "APPLICATION_SNAPSHOT_FAILED";
  return precheckStage(fallback, async () => {
    requireSafe(qstash || github || origin === "https://ckwadpmvxieekjlsfcks.supabase.co", "UNAPPROVED_PRECHECK_READ_ORIGIN");
    const response = await fetcher(url, { method: "GET", redirect: "error", headers: { authorization: `Bearer ${token}`, ...extraHeaders },
      cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (qstash && [401, 403].includes(response.status)) throw new SafeFailure("QSTASH_AUTH_FAILED");
    requireSafe(response.ok, fallback);
    return { body: await response.json(), serverTime: Date.parse(response.headers.get("date") ?? ""),
      paginationHeader: [...response.headers.keys()].some(name => /cursor|pagination|next-page|has-more/i.test(name) || name.toLowerCase() === "link") };
  });
}
export async function readRealHolds(read = readPrecheckJson) {
  return precheckStage("REAL_SCHEDULE_STATE_INVALID", async () => {
    const failures = [];
    try {
      return await checkHolds(true, async (...args) => {
        try { return await read(...args); }
        catch (error) { failures.push(error); throw error; }
      });
    } catch (error) {
      // checkHolds uses allSettled; retain the original classified read failure.
      throw failures[0] ?? error;
    }
  });
}
const kind = value => value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
const STATES = new Set(["CREATED", "ACTIVE", "RETRY", "ERROR", "DELIVERED", "FAILED", "CANCEL_REQUESTED", "CANCELLED"]);

export function verifyStaticSources() {
  requireSafe(sha(normalize(readFileSync(resolve(ROOT, "public/icons/watchflow-icon.svg"), "utf8"))) === ASSET_HASH, "STATIC_ASSET_SOURCE_CHANGED");
  for (const [path, expected] of Object.entries(SOURCE_PINS)) requireSafe(sha(normalize(readFileSync(resolve(ROOT, path), "utf8"))) === expected, "STATIC_ROUTING_SOURCE_CHANGED");
}
export async function verifyAsset(fetcher = fetch) {
  return precheckStage("ASSET_VERIFY_FAILED", async () => {
  verifyStaticSources();
  const response = await fetcher(DESTINATION, { method: "GET", redirect: "error", credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(10000) });
  requireSafe(response.status === 200 && response.headers.get("content-type")?.split(";")[0] === "image/svg+xml" &&
    !response.headers.has("set-cookie"), "STATIC_DESTINATION_NOT_PUBLIC_SUCCESS");
  requireSafe(sha(normalize(await response.text())) === ASSET_HASH, "STATIC_DESTINATION_BODY_MISMATCH");
  });
}
export function canaryPlan(now) {
  requireSafe(Number.isSafeInteger(now) && now >= 0, "CLOCK_INVALID");
  const first = Math.ceil((now + 300000) / 60000) * 60000, d = new Date(first);
  let second;
  for (let year = d.getUTCFullYear() + 1; year <= d.getUTCFullYear() + 8; year += 1) {
    const candidate = new Date(Date.UTC(year, d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()));
    if (candidate.getUTCMonth() === d.getUTCMonth() && candidate.getUTCDate() === d.getUTCDate()) { second = candidate.getTime(); break; }
  }
  requireSafe(Number.isFinite(second) && second > first + 300 * 86400000, "SECOND_OCCURRENCE_UNSAFE");
  return { first, second, cron: `${d.getUTCMinutes()} ${d.getUTCHours()} ${d.getUTCDate()} ${d.getUTCMonth() + 1} *`,
    prepareAt: first - 180000, latestResume: first - 65000, cutoff: first + 90000 };
}
export function canaryRequest(action, plan) {
  const root = `${API}/schedules/${CANARY}`;
  requireSafe(["create", "pause", "resume", "delete"].includes(action), "UNAPPROVED_CANARY_ACTION");
  const headers = { authorization: `Bearer ${env("QSTASH_TOKEN_EU")}` };
  if (action === "create") {
    requireSafe(plan && canaryPlan(plan.first - 300000).cron === plan.cron, "CANARY_CRON_PLAN_INVALID");
    Object.assign(headers, { "Upstash-Schedule-Id": CANARY, "Upstash-Cron": plan.cron, "Upstash-Method": "GET",
      "Upstash-Retries": "0", "Upstash-Timeout": "10s", "Upstash-Label": LABELS.join(",") });
  }
  return { url: action === "create" ? `${API}/schedules/${DESTINATION}` : action === "delete" ? root : `${root}/${action}`,
    init: { method: action === "delete" ? "DELETE" : "POST", redirect: "error", headers, cache: "no-store", signal: AbortSignal.timeout(5000) } };
}
export async function mutateCanary(action, plan, fetcher = fetch) {
  const { url, init } = canaryRequest(action, plan);
  const response = await fetcher(url, init);
  requireSafe(response.ok || (action === "delete" && response.status === 404), `CANARY_${action.toUpperCase()}_HTTP_FAILED`);
  if (action === "create") requireSafe((await response.json())?.scheduleId === CANARY, "CANARY_CREATE_ID_MISMATCH");
  else await response.body?.cancel();
}
export async function readCanary(fetcher = fetch) {
  return precheckStage("CANARY_LOOKUP_FAILED", async () => {
  env("QSTASH_TOKEN_EU");
  const response = await fetcher(`${API}/schedules/${CANARY}`, { method: "GET", redirect: "error",
    headers: { authorization: `Bearer ${env("QSTASH_TOKEN_EU")}` }, cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (response.status === 404) { await response.body?.cancel(); return null; }
  if ([401, 403].includes(response.status)) throw new SafeFailure("QSTASH_AUTH_FAILED");
  requireSafe(response.ok, "QSTASH_READ_FAILED");
  return response.json();
  });
}
export function verifyCanary(row, plan, paused) {
  requireSafe(row && row.scheduleId === CANARY && row.destination === DESTINATION && row.method === "GET" && row.cron === plan.cron &&
    row.retries === 0 && row.timeout === 10000 && row.isPaused === paused && Array.isArray(row.labels) &&
    canonical([...row.labels].sort()) === canonical([...LABELS].sort()), "CANARY_CONFIGURATION_MISMATCH");
  const headers = Object.entries(row.header ?? {});
  requireSafe(row.header === undefined || row.header === null || (typeof row.header === "object" && !Array.isArray(row.header)), "CANARY_FORWARDED_HEADER_REJECTED");
  requireSafe(headers.length <= 1 && headers.every(([name, values]) => /^content-type$/i.test(name) && Array.isArray(values) &&
    values.length === 1 && typeof values[0] === "string"), "CANARY_FORWARDED_HEADER_REJECTED");
  for (const name of ["callback", "failureCallback", "body", "queueName", "topicName", "urlGroup"]) requireSafe(row[name] === undefined || row[name] === null || row[name] === "", "CANARY_CALLBACK_BODY_OR_ROUTING_REJECTED");
  for (const name of ["callbackHeaders", "failureCallbackHeaders"]) requireSafe(row[name] === undefined || row[name] === null ||
    (typeof row[name] === "object" && !Array.isArray(row[name]) && Object.keys(row[name]).length === 0), "CANARY_CALLBACK_HEADERS_REJECTED");
}
async function context() {
  loadLocalTestEnvironment(process.env, ROOT);
  requirePrecheckEnvironment();
  await precheckStage("CANARY_PRECHECK_TARGET_FAILED", localTarget);
  await precheckStage("ASSET_VERIFY_FAILED", verifyStaticSources);
  requireSafe(!existsSync(EVIDENCE_PATH), "PRIOR_CANARY_EVIDENCE_MUST_BE_REVIEWED");
  const ownerId = await precheckStage("APPLICATION_SNAPSHOT_FAILED", () => readOwner(readPrecheckJson));
  return precheckStage("CANARY_PRECHECK_CALENDAR_MODULES_FAILED", async () => {
  const { default: createJITI } = await import("jiti");
  const load = createJITI(import.meta.url, { alias: { "server-only": resolve(ROOT, "node_modules/server-only/empty.js") }, cache: false });
  const transport = load("../lib/calendar/google-calendar-transport.ts");
  return { ownerId, path: { read: load("../lib/calendar/oauth-store.ts").readGoogleCalendarCredential,
    decrypt: load("../lib/calendar/token-encryption.ts").decryptCalendarRefreshToken, refresh: transport.refreshGoogleCalendarAccessToken } };
  });
}
async function isolation(ctx) {
  await precheckStage("CANARY_PRECHECK_TARGET_FAILED", localTarget);
  const data = await precheckStage("APPLICATION_SNAPSHOT_FAILED", async () => {
    requirePrecheckEnvironment();
    const current = await snapshot(ctx, classifiedPgClient()); verifyPre(current, ctx.ownerId); return current;
  });
  await readRealHolds();
  return { digest: digest(data), data };
}
async function capture(ctx) {
  const before = await isolation(ctx);
  await precheckStage("CANARY_PRECHECK_GOOGLE_FAILED", () => googleAbsent(ctx, before.data));
  const after = await isolation(ctx); requireSafe(before.digest === after.digest, "APPLICATION_DATA_CHANGED_DURING_CAPTURE");
  return { digest: after.digest };
}

// No header/body contents or arbitrary strings are exposed, even in fixtures.
const safeName = name => /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) && !/authorization|token|password|secret|credential|cookie|api.?key/i.test(name);
export function propertyTypes(object) {
  const entries = object && typeof object === "object" && !Array.isArray(object) ? Object.entries(object) : [];
  return { properties: Object.fromEntries(entries.filter(([name]) => safeName(name)).map(([name, value]) => [name, kind(value)])),
    omitted_property_count: entries.filter(([name]) => !safeName(name)).length };
}
export function inspectPage(page, paginationHeaders = []) {
  const top = propertyTypes(page), rows = Array.isArray(page?.events) ? page.events : null;
  return { top_level_type: kind(page), top_level: top, row_array_property: rows ? "events" : "UNVERIFIED", event_count: rows?.length ?? "unknown",
    first_event: rows?.length ? { type: kind(rows[0]), ...propertyTypes(rows[0]) } : null,
    body_cursor_present: !!page && typeof page === "object" && Object.hasOwn(page, "cursor"),
    pagination_header_present: paginationHeaders.length > 0, pagination_header_names: paginationHeaders.map(name => safeName(name) ? name : "REDACTED_NAME") };
}
export function sanitizePage(page, aliases = new Map(), firstTime = 0) {
  const placeholder = value => ({ string: "REDACTED", number: 0, boolean: false, null: null, array: [], object: {} })[kind(value)] ?? null;
  const sanitizeRow = row => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return placeholder(row);
    return Object.fromEntries(Object.entries(row).filter(([name]) => safeName(name)).map(([name, value]) => {
      if (name === "scheduleId" && value === CANARY) return [name, CANARY];
      if (name === "url" && value === DESTINATION) return [name, DESTINATION];
      if (name === "method" && value === "GET") return [name, "GET"];
      if (name === "state" && STATES.has(value)) return [name, value];
      if (name === "time" && Number.isSafeInteger(value)) return [name, 946684800000 + value - firstTime];
      if (name === "maxRetries" && value === 0) return [name, 0];
      if (name === "timeout" && value === 10000) return [name, 10000];
      // HTTP status is safe provenance evidence. The first capture incorrectly
      // replaced it with 0; never repeat that loss or reinterpret the old file.
      if (name === "responseStatus" && Number.isInteger(value) && value >= 100 && value <= 599) return [name, value];
      if (name === "labels" && Array.isArray(value) && canonical([...value].sort()) === canonical([...LABELS].sort())) return [name, [...LABELS]];
      if (name === "messageId" && typeof value === "string") {
        if (!aliases.has(value)) aliases.set(value, `canary-message-${aliases.size + 1}`);
        return [name, aliases.get(value)];
      }
      return [name, placeholder(value)];
    }));
  };
  if (!page || typeof page !== "object" || Array.isArray(page)) return placeholder(page);
  return Object.fromEntries(Object.entries(page).filter(([name]) => safeName(name)).map(([name, value]) =>
    [name, name === "events" && Array.isArray(value) ? value.slice(0, 100).map(sanitizeRow) : name === "cursor" && value === "" ? "" : placeholder(value)]));
}
export function analyzeRows(page, plan, seen) {
  const decoded = decodeEventPage(page, { ...CANARY_CONTRACT, fromDate: plan.first - 5000, toDate: plan.cutoff });
  for (const row of page.events) {
    requireSafe(!Object.keys(row.header ?? {}).some(name => /^(?:upstash-forward-)?authorization$|cookie|api[-_]?key|scheduler/i.test(name)), "CANARY_LOG_FORWARDED_CREDENTIAL_PRESENT");
    requireSafe((row.maxRetries === undefined || row.maxRetries === 0) &&
      ["body", "callback", "failureCallback"].every(name => row[name] === undefined || row[name] === ""), "CANARY_LOG_CONFIG_MISMATCH");
  }
  const summary = summarizeEvents([...(seen.rows ?? []), ...decoded.rows]);
  requireSafe(summary.uniqueMessageCount <= 1, "MULTIPLE_CANARY_MESSAGES");
  seen.rows = summary.rows;
  for (const row of summary.rows) {
    seen.messages.add(row.messageId);
    if (row.state === "ACTIVE" || row.state === "DELIVERED") seen[row.state].add(`${row.messageId}:${row.time}`);
  }
  const observed = page.events.length > 0;
  return { terminal: summary.messages[0]?.delivered === true, uniqueMessages: summary.uniqueMessageCount, schedule_id_matches: observed, destination_matches: observed, method_get: observed,
    observed_core_schema_matches_documented_fields: observed };
}
export function reviewEvidence(log = console.log, read = readCanaryEvidence) {
  let report;
  try { report = read(); }
  catch (error) { report = { ready: false, code: code(error), missingFields: error.field ? [error.field] : [] }; }
  const result = report.ready ? "PASS" : "FAIL";
  log(`CANARY_EVIDENCE_REVIEW_${result} code=${report.code} ` +
    `captured_event_count=${report.capturedEventCount ?? "unknown"} observed_event_states=${report.observedStates?.join(",") ?? "unknown"} ` +
    `automatic_schedule_provenance=${report.automaticScheduleProvenance ?? false} delivery_attempt_verified=${report.deliveryAttemptVerified ?? false} ` +
    `successful_delivery_verified=${report.successfulDeliveryVerified ?? false} unique_message_count=${report.uniqueMessageCount ?? "unknown"} ` +
    `real_first_run_decoder_ready=${report.ready}` + (report.missingFields?.length ? ` missing_field=${report.missingFields[0]}` : ""));
  return report;
}
export async function readEvents(from, to, read = fetch) {
  requireSafe(Number.isSafeInteger(from) && Number.isSafeInteger(to) && from >= 0 && to >= from, "CANARY_LOG_WINDOW_INVALID");
  const url = new URL(`${API}/logs`);
  for (const [name, value] of Object.entries({ scheduleId: CANARY, count: 100, fromDate: from, toDate: to })) url.searchParams.set(name, String(value));
  const response = await read(url.toString(), { method: "GET", redirect: "error", headers: { authorization: `Bearer ${env("QSTASH_TOKEN_EU")}` },
    cache: "no-store", signal: AbortSignal.timeout(5000) });
  requireSafe(response.ok, "CANARY_LOG_READ_FAILED");
  const paginationHeaders = [...response.headers.keys()].filter(name => /cursor|pagination|next-page|has-more/i.test(name) || name.toLowerCase() === "link");
  return { page: await response.json(), paginationHeaders };
}
function validatePagination(page, headers) {
  requireSafe(page && typeof page === "object" && !Array.isArray(page) && headers.length === 0 &&
    (!Object.hasOwn(page, "cursor") || page.cursor === ""), "CANARY_PAGINATION_REQUIRES_REVIEW");
}
async function confirm() {
  requireSafe(process.stdin.isTTY && process.stdout.isTTY, "TTY_REQUIRED");
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  try { return await reader.question(`Type ${CONFIRMATION} to create only the isolated static-asset canary: `); }
  finally { reader.close(); }
}
function writeEvidence(record) {
  // The parent is the already-existing ignored Supabase metadata directory.
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
}
export function parseArguments(args) {
  requireSafe(args.length === 1 && ["--precheck-only", "--canary", "--review-evidence"].includes(args[0]), "EXPLICIT_MODE_REQUIRED");
  return args[0];
}
export async function runCanary(mode, overrides = {}) {
  // Strictly local: return before environment loading, context, network, writes,
  // approval, timers or cleanup. The original evidence is read, never replaced.
  if (mode === "--review-evidence") return reviewEvidence(overrides.log, overrides.review);
  requireSafe(["--precheck-only", "--canary"].includes(mode), "EXPLICIT_MODE_REQUIRED");
  const io = { context, capture, isolation, asset: verifyAsset, read: readCanary, mutate: mutateCanary, logs: readEvents,
    confirm, write: writeEvidence, log: console.log, now: Date.now, mono: () => performance.now(),
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    deadline: (fn, ms) => { const timer = setTimeout(fn, ms); return () => clearTimeout(timer); },
    signals: handler => { process.on("SIGINT", handler); process.on("SIGTERM", handler); return () => { process.off("SIGINT", handler); process.off("SIGTERM", handler); }; }, ...overrides };
  const ctx = await precheckStage("CANARY_PRECHECK_CONTEXT_FAILED", () => io.context());
  const before = await precheckStage("CANARY_PRECHECK_CAPTURE_FAILED", () => io.capture(ctx));
  await precheckStage("CANARY_PRECHECK_ASSET_FAILED", () => io.asset());
  await precheckStage("CANARY_PRECHECK_LOOKUP_FAILED", async () => requireSafe(await io.read() === null, "CANARY_ID_ALREADY_EXISTS_DO_NOT_REPLACE"));
  io.log("CANARY_PRECHECK_PASS real_schedules_paused=true canary_absent=true application_data_unchanged=true");
  if (mode === "--precheck-only") return;
  requireSafe(await io.confirm() === CONFIRMATION, "TYPED_CONFIRMATION_MISMATCH");
  requireSafe((await io.capture(ctx)).digest === before.digest, "PRE_CREATE_APPLICATION_STATE_CHANGED");
  await io.asset();
  const plan = canaryPlan(io.now()), anchor = { wall: io.now(), mono: io.mono() };
  requireSafe(await io.read() === null, "CANARY_ID_ALREADY_EXISTS_DO_NOT_REPLACE");
  assertClock(io.now(), io.mono(), anchor);
  requireSafe(plan.first - io.now() >= 240000, "CANARY_CREATION_WINDOW_MISSED");
  let attempted = false, deleted = false, paused = false, cleanupPromise, pausePromise, stop, error, cancel, removeSignals, evidenceWritten = false, isolationVerified = false;
  let cleanupRequested = false, inFlight = Promise.resolve();
  const pages = [], captures = [], failures = [], aliases = new Map(), captureKeys = new Set(), seen = { messages: new Set(), ACTIVE: new Set(), DELIVERED: new Set() };
  const perform = action => {
    requireSafe(!cleanupRequested, stop || "CANARY_CLEANUP_ALREADY_STARTED");
    inFlight = Promise.resolve().then(() => io.mutate(action, plan));
    return inFlight;
  };
  const cleanup = () => {
    cleanupRequested = true;
    if (!cleanupPromise) cleanupPromise = (async () => {
      // Do not let an in-flight creation/resume finish after a verified delete.
      // Requests are bounded, and no new mutation may start after this point.
      await inFlight.catch(() => {});
      let responseError;
      try { await io.mutate("delete", plan); } catch (caught) { responseError = caught; }
      requireSafe(await io.read() === null, "CANARY_DELETE_NOT_VERIFIED"); deleted = true;
      requireSafe(!responseError, "CANARY_DELETE_RESPONSE_UNCONFIRMED");
    })();
    return cleanupPromise;
  };
  const pauseFirst = () => {
    if (!pausePromise) pausePromise = (async () => { await perform("pause"); verifyCanary(await io.read(), plan, true); paused = true; })();
    return pausePromise;
  };
  const stopNow = reason => { stop = reason; if (attempted) void cleanup().catch(() => {}); };
  let terminal = false, createdAt;
  const save = () => {
    if (!pages.length || evidenceWritten) return;
    io.write({ schema: 1, redaction_version: 2, source: "LIVE_CANARY_CAPTURE_AT_OPERATOR_EXECUTION", canary_schedule_id: CANARY, destination: DESTINATION,
      first_utc: new Date(plan.first).toISOString(), structures: captures, sanitized_pages: pages,
      fixture_first_ms: 946684800000, fixture_cutoff_ms: 946684890000, capture_result: error ?? "DELIVERY_CANDIDATE_VERIFIED",
      canary_deleted_verified: deleted, application_data_isolation_verified: isolationVerified, cleanup_failures: [...failures],
      real_first_run_decoder_ready: false, requires_human_schema_review: true });
    evidenceWritten = true;
  };
  try {
    cancel = io.deadline(() => stopNow("CANARY_HARD_CUTOFF"), plan.cutoff - io.now());
    removeSignals = io.signals(() => stopNow("OPERATOR_INTERRUPTED"));
    createdAt = io.now(); attempted = true;
    await perform("create");
    await perform("pause"); verifyCanary(await io.read(), plan, true);
    requireSafe((await io.capture(ctx)).digest === before.digest, "POST_CREATE_APPLICATION_STATE_CHANGED");
    while (io.now() < plan.prepareAt) { assertClock(io.now(), io.mono(), anchor); requireSafe(!stop, stop); await io.sleep(Math.min(2000, plan.prepareAt - io.now())); }
    requireSafe((await io.capture(ctx)).digest === before.digest, "PRE_RESUME_APPLICATION_STATE_CHANGED");
    verifyCanary(await io.read(), plan, true); assertClock(io.now(), io.mono(), anchor);
    requireSafe(!stop && io.now() >= plan.prepareAt && io.now() <= plan.latestResume, stop || "CANARY_RESUME_WINDOW_MISSED");
    await perform("resume"); verifyCanary(await io.read(), plan, false);
    let nextIsolation = io.now();
    while (io.now() < plan.cutoff) {
      requireSafe(!stop, stop); assertClock(io.now(), io.mono(), anchor);
      const response = await io.logs(createdAt, io.now());
      const structure = inspectPage(response.page, response.paginationHeaders);
      const hasRows = Number.isInteger(structure.event_count) && structure.event_count > 0;
      let pauseError;
      if (hasRows) { try { await pauseFirst(); } catch (caught) { pauseError = caught; } }
      const sanitized = sanitizePage(response.page, aliases, plan.first), captureKey = digest({ sanitized, structure });
      if (!captureKeys.has(captureKey)) { pages.push(sanitized); captures.push(structure); captureKeys.add(captureKey); }
      if (pauseError) throw pauseError;
      if (hasRows) {
        // Only redacted rows and safe names/types ever leave memory.
        io.log(`CANARY_NONEMPTY_STRUCTURE ${JSON.stringify(structure)}`);
      }
      validatePagination(response.page, response.paginationHeaders);
      const result = analyzeRows(response.page, plan, seen);
      if (result.terminal) { terminal = true; break; }
      if (io.now() >= nextIsolation) {
        requireSafe((await io.isolation(ctx)).digest === before.digest, "APPLICATION_STATE_CHANGED_DURING_CANARY");
        nextIsolation = io.now() + 15000;
      }
      await io.sleep(2000);
    }
    requireSafe(!stop && terminal && seen.messages.size === 1 && seen.DELIVERED.size === 1, stop || "CANARY_DELIVERY_NOT_VERIFIED");
  } catch (caught) { error = code(caught); }
  finally {
    if (attempted) {
      try { await cleanup(); } catch (caught) { failures.push(code(caught)); }
      try { requireSafe((await io.capture(ctx)).digest === before.digest, "FINAL_APPLICATION_DATA_CHANGED"); isolationVerified = true; } catch (caught) { failures.push(code(caught)); }
      try { save(); } catch (caught) { failures.push(code(caught)); }
      io.log(`CANARY_FINAL_STATE ${JSON.stringify({ canary_creation_attempted: attempted, first_event_pause_verified: paused,
        canary_deleted_verified: deleted, unique_message_count: seen.messages.size, delivered_verified: terminal,
        application_data_isolation_verified: isolationVerified, evidence_written: evidenceWritten, real_first_run_decoder_ready: false, error: error ?? null, failures })}`);
    }
    cancel?.(); removeSignals?.();
  }
  requireSafe(!failures.length, "CANARY_CLEANUP_OR_ISOLATION_FAILED");
  requireSafe(!error, error);
  io.log("CANARY_CAPTURE_PASS: one correlated automatic static-asset message; canary deleted; application state unchanged; schema review still required.");
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { const result = await runCanary(parseArguments(process.argv.slice(2))); if (result?.ready === false) process.exitCode = 1; }
  catch (error) { console.error(formatCanaryStop(error)); process.exitCode = 1; }
}
