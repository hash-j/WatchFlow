// First execution already occurred. Use --recover; never rerun --first-run.
// Recovery is read-only and returns before the original mutation engine.
// External writes are restricted to the existing calendar schedule's resume
// and fail-safe pause. All application/Google Calendar operations here are reads.
// Readiness requires a passing local evidence review before any live first run.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { canonical, SafeFailure as GoogleFailure } from "./part18j-google-reauth-checkpoint.mjs";
import { SNAPSHOT_SQL, SafeFailure, localTarget, poolerConfiguration, validateFixture, validateContracts,
  googleAbsent, sanitizedObservation } from "./part18-ops-unit2d-sync-reenable.mjs";
import { verifyCalendarSchedule } from "./part18-ops-unit2d-script-a2.mjs";
import { CALENDAR_CONTRACT, decodeEventPage, summarizeEvents, requireCanaryEvidenceReady,
  SafeFailure as EventFailure } from "./part18-ops-unit2d-qstash-events.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const REF = "ckwadpmvxieekjlsfcks";
const CONNECTION = "e652e5c8-f08c-4736-88d8-073bce772ccc";
const JOB = "b9eb8a77-0723-675b-3f2b-8503a0781ab8";
const EVENT = "a2ab6758f9fedbb0344d416ac00f2ca7d";
const CALENDAR = "watchflow-dev-part18-ops-unit2d-calendar";
const REMINDER = "watchflow-dev-part18-ops-unit2d-reminders";
const DESTINATION = "https://watchflow-dev-ops.vercel.app/api/internal/calendar/sync";
const QSTASH = "https://qstash-eu-central-1.upstash.io/v2";
export const RECOVERY_WINDOW = Object.freeze({
  from: Date.parse("2026-10-29T21:58:30.000Z"), first: Date.parse("2026-10-29T21:59:00.000Z"),
  pauseCutoff: Date.parse("2026-10-29T22:00:15.000Z"), to: Date.parse("2026-10-29T22:00:30.000Z"),
  second: Date.parse("2026-10-29T22:04:00.000Z") });
const FINALIZE_HASH = "92c1946194985acd5d82e1e5f629433488b91391ac9f4617342d209b9c00838b";
export const CONFIRMATION = "APPROVE_FIRST_AUTOMATIC_QSTASH_CALENDAR_EXECUTION";
const requireSafe = (ok, code) => { if (!ok) throw new SafeFailure(code); };
const env = name => { const value = process.env[name]; requireSafe(typeof value === "string" && value.length > 0, `MISSING_${name}`); return value; };
const hash = value => createHash("sha256").update(canonical(value)).digest("hex");
const code = error => error instanceof SafeFailure || error instanceof GoogleFailure || error instanceof EventFailure ? error.message : "UNEXPECTED_FAILURE";
const same = (a, b) => hash(a) === hash(b);

export const FIRST_SQL = SNAPSHOT_SQL.replace(/\) bundle$/, `,
  (select count(*)::int from public.calendar_sync_jobs) as global_job_count,
  (select count(*)::int from public.calendar_event_mappings) as global_mapping_count,
  (select coalesce(json_agg(j order by j.id),'[]'::json) from (select * from public.calendar_sync_jobs order by id limit 2001) j) as global_jobs,
  (select coalesce(json_agg(m order by m.id),'[]'::json) from (select * from public.calendar_event_mappings order by id limit 2001) m) as global_mappings,
  (select row_to_json(s) from (select um.id,um.user_id,um.status,um.scheduled_for,um.schedule_timezone,
    um.movie_id,m.title as movie_title,coalesce(m.runtime_minutes,120) as runtime_minutes
    from public.user_movies um join public.movies m on m.id=um.movie_id
    where um.id=(select user_movie_id from public.calendar_sync_jobs where id=$2)) s) as source,
  (select coalesce(json_agg(row_to_json(f)),'[]'::json) from (select oidvectortypes(p.proargtypes) as args,
    format_type(p.prorettype,null) as result,p.proretset as returns_set,p.prosecdef as definer,l.lanname as language,p.proconfig as settings,p.prosrc as body,
    has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute,
    has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
    has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
    exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
    where n.nspname='public' and p.proname='watchflow_finalize_calendar_sync_job') f) as finalizers
) bundle`);

export function cronPlan(now) {
  requireSafe(Number.isSafeInteger(now) && now >= 0, "CLOCK_INVALID");
  let first = Math.floor(now / 60000) * 60000 + 60000;
  for (let i = 0; i < 66; i += 1, first += 60000) {
    if (new Date(first).getUTCMinutes() % 5 === 4 && first >= now + 90000) {
      return { first, prepareAt: first - 75000, latestResume: first - 10000,
        pauseCutoff: first + 75000, completionCutoff: first + 150000, second: first + 300000 };
    }
  }
  throw new SafeFailure("CRON_PLAN_FAILED");
}
export function assertClock(wall, mono, anchor) {
  requireSafe(Math.abs((wall - anchor.wall) - (mono - anchor.mono)) <= 1500, "CLOCK_DRIFT_DETECTED");
}
async function getJson(url, token, extraHeaders = {}) {
  const response = await fetch(url, { method: "GET", redirect: "error", headers: { authorization: `Bearer ${token}`, ...extraHeaders },
    cache: "no-store", signal: AbortSignal.timeout(5000) });
  requireSafe(response.ok, "READ_HTTP_FAILED");
  const paginationHeader = [...response.headers.keys()].some(name => /cursor|pagination|next-page|has-more/i.test(name) || name.toLowerCase() === "link");
  return { body: await response.json(), serverTime: Date.parse(response.headers.get("date") ?? ""), paginationHeader };
}
export async function calendarAction(action, token, fetcher = fetch) {
  requireSafe(["resume", "pause"].includes(action), "UNAPPROVED_SCHEDULE_ACTION");
  const response = await fetcher(`${QSTASH}/schedules/${CALENDAR}/${action}`, { method: "POST", redirect: "error",
    headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(5000) });
  requireSafe(response.ok, action === "pause" ? "CALENDAR_PAUSE_HTTP_FAILED" : "CALENDAR_RESUME_HTTP_FAILED");
  await response.body?.cancel();
}
export async function checkHolds(expectedPaused, read = getJson, now = Date.now()) {
  const names = ["WATCHFLOW_DEV_REMINDER_SCHEDULER_ENABLED", "WATCHFLOW_DEV_CALENDAR_SCHEDULER_ENABLED"];
  const results = await Promise.allSettled([
    read(`${QSTASH}/schedules/${CALENDAR}`, env("QSTASH_TOKEN_EU")),
    read(`${QSTASH}/schedules/${REMINDER}`, env("QSTASH_TOKEN_EU")),
    ...names.map(name => read(`https://api.github.com/repos/hash-j/WatchFlow/actions/variables/${name}`, env("GH_TOKEN"))),
  ]);
  requireSafe(results.every(result => result.status === "fulfilled"), "HOLD_READ_FAILED");
  const [calendar, reminder, ...gates] = results.map(result => result.value);
  requireSafe(typeof expectedPaused === "boolean" && calendar.body?.isPaused === expectedPaused, "CALENDAR_PAUSED_STATE_MISMATCH");
  try { verifyCalendarSchedule({ ...calendar.body, isPaused: true }, "4-59/5 * * * *", env("WATCHFLOW_SCHEDULER_SECRET")); }
  catch { throw new SafeFailure("CALENDAR_CONFIGURATION_OR_AUTH_MISMATCH"); }
  requireSafe(Number.isFinite(calendar.serverTime) && Math.abs(calendar.serverTime - now) <= 5000, "QSTASH_CLOCK_UNVERIFIED");
  requireSafe(reminder.body?.scheduleId === REMINDER && reminder.body.destination ===
    "https://watchflow-dev-ops.vercel.app/api/internal/notifications/scheduled-reminders" && reminder.body.isPaused === true, "REMINDER_NOT_PAUSED");
  requireSafe(gates.every((gate, index) => gate.body?.name === names[index] && gate.body.value === "false"), "GITHUB_GATE_NOT_FALSE");
  return { calendar_paused: expectedPaused, reminder_paused: true, github_gates_false: true };
}
async function verifyPaused(read = getJson) {
  const calendar = await read(`${QSTASH}/schedules/${CALENDAR}`, env("QSTASH_TOKEN_EU"));
  try { verifyCalendarSchedule(calendar.body, "4-59/5 * * * *", env("WATCHFLOW_SCHEDULER_SECRET")); }
  catch { throw new SafeFailure("CALENDAR_PAUSE_NOT_VERIFIED"); }
}
export function verifyFinalizer(data) {
  requireSafe(data.finalizers?.length === 1, "FINALIZER_OVERLOAD_OR_MISSING");
  const f = data.finalizers[0];
  requireSafe(f.args === "uuid, uuid, text, text, text, text, integer, text" && f.result === "boolean" && f.returns_set === false && f.definer === true && f.language === "plpgsql" &&
    f.settings?.length === 1 && ["search_path=", 'search_path=""'].includes(f.settings[0]) && typeof f.body === "string" &&
    createHash("sha256").update(f.body.replace(/\r\n/g, "\n").trim()).digest("hex") === FINALIZE_HASH &&
    f.service_execute === true && f.public_execute === false && f.anon_execute === false && f.authenticated_execute === false, "FINALIZER_CONTRACT_MISMATCH");
}
export function verifyInventory(data) {
  requireSafe(Number.isInteger(data.global_job_count) && data.global_job_count <= 2000 && data.global_job_count >= 1 &&
    data.global_jobs?.length === data.global_job_count && new Set(data.global_jobs.map(j => j.id)).size === data.global_job_count &&
    Number.isInteger(data.global_mapping_count) && data.global_mapping_count <= 2000 && data.global_mapping_count >= 0 &&
    data.global_mappings?.length === data.global_mapping_count && new Set(data.global_mappings.map(m => m.id)).size === data.global_mapping_count, "GLOBAL_INVENTORY_INCOMPLETE");
  requireSafe(same(data.global_jobs.filter(j => j.id === JOB), data.jobs) &&
    data.global_mapping_count === data.global_mappings.length, "SNAPSHOT_INCONSISTENT");
}
export async function snapshot(context, Client = pg.Client) {
  const client = new Client({ ...poolerConfiguration(readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8")), query_timeout: 10000 });
  let idleError = false;
  client.on("error", () => { idleError = true; });
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    // Derive the function-name list from the shared SELECT contract locally.
    const { CONTRACTS } = await import("./part18-ops-unit2d-sync-reenable.mjs");
    const result = await client.query(FIRST_SQL, [CONNECTION, JOB, context.ownerId, env("E2E_USER_A_EMAIL"), CONTRACTS.map(f => f.name)]);
    await client.query("ROLLBACK");
    requireSafe(!idleError && result.rows?.length === 1 && result.rows[0].snapshot, "DATABASE_RESULT_INVALID");
    return result.rows[0].snapshot;
  } catch (error) { if (error instanceof SafeFailure) throw error; throw new SafeFailure("READ_ONLY_DATABASE_FAILED"); }
  finally { await client.end().catch(() => {}); }
}
export async function readOwner(read = getJson) {
  const key = env("SUPABASE_SECRET_KEY");
  const response = await read(`https://${REF}.supabase.co/rest/v1/calendar_connections?select=user_id&id=eq.${CONNECTION}`, key, { apikey: key });
  requireSafe(Array.isArray(response.body) && response.body.length === 1 && typeof response.body[0]?.user_id === "string" &&
    /^[0-9a-f-]{36}$/i.test(response.body[0].user_id), "QA_OWNER_READ_FAILED");
  return response.body[0].user_id;
}
async function createContext() {
  localTarget();
  const ownerId = await readOwner();
  const { default: createJITI } = await import("jiti");
  const load = createJITI(import.meta.url, { alias: { "server-only": resolve(ROOT, "node_modules/server-only/empty.js") }, cache: false });
  const transport = load("../lib/calendar/google-calendar-transport.ts");
  return { ownerId, path: { read: load("../lib/calendar/oauth-store.ts").readGoogleCalendarCredential,
    decrypt: load("../lib/calendar/token-encryption.ts").decryptCalendarRefreshToken, refresh: transport.refreshGoogleCalendarAccessToken },
    buildEvent: transport.buildGoogleCalendarEvent };
}
export function sourceInput(data) {
  const source = data.source, job = data.jobs?.[0];
  requireSafe(source && source.id === job?.user_movie_id && source.user_id === job.user_id && source.status === "scheduled", "CONTROLLED_SOURCE_MISMATCH");
  return { providerEventId: EVENT, sourceKey: job.source_key, sourceVersion: job.source_version, movieId: source.movie_id,
    movieTitle: source.movie_title, scheduledFor: source.scheduled_for, scheduleTimezone: source.schedule_timezone, runtimeMinutes: source.runtime_minutes };
}
export function verifyPre(data, ownerId) {
  validateFixture(data, ownerId, true); verifyFinalizer(data); verifyInventory(data); sourceInput(data);
  requireSafe(data.global_mappings.filter(m => m.connection_id === CONNECTION).length === 0, "CONTROLLED_MAPPING_PRESENT");
  return hash(data);
}
export function verifyIsolation(before, after) {
  verifyInventory(after); validateContracts(after); verifyFinalizer(after);
  requireSafe(same(before.global_jobs.filter(j => j.id !== JOB), after.global_jobs.filter(j => j.id !== JOB)), "UNRELATED_OR_CROSS_USER_JOB_CHANGED");
  requireSafe(same(before.global_mappings, after.global_mappings.filter(m => !(m.connection_id === CONNECTION && m.source_key === before.jobs[0].source_key))), "UNRELATED_MAPPING_CHANGED");
  requireSafe(same(before.source, after.source), "CONTROLLED_SOURCE_CHANGED");
  const stable = c => Object.fromEntries(Object.entries(c).filter(([key]) => !["updated_at", "last_successful_sync_at", "last_error_code", "last_error_at"].includes(key)));
  requireSafe(after.connections?.length === 1 && same(stable(before.connections[0]), stable(after.connections[0])), "CONNECTION_IDENTITY_OR_SYNC_CHANGED");
  const identity = j => Object.fromEntries(Object.entries(j).filter(([key]) => !["state", "attempt_count", "lease_token", "lease_expires_at", "provider_status_code", "error_code", "completed_at", "updated_at"].includes(key)));
  requireSafe(after.jobs?.length === 1 && same(identity(before.jobs[0]), identity(after.jobs[0])), "CONTROLLED_JOB_IDENTITY_CHANGED");
  requireSafe(after.unrelated_actionable === 0 && after.actionable_cleanup === 0 && after.credentials?.length === 1 &&
    after.credentials[0].connection_id === CONNECTION, "ISOLATION_OR_CREDENTIAL_COUNT_FAILED");
}
export function executionObserved(before, after) {
  return !same(before.jobs, after.jobs) || !same(before.global_jobs, after.global_jobs) || !same(before.global_mappings, after.global_mappings);
}
export function verifyLease(data, plan, state) {
  const job = data.jobs?.[0];
  requireSafe(job && Number.isInteger(job.attempt_count) && job.attempt_count >= 0 && job.attempt_count <= 1, "MULTIPLE_OR_INVALID_JOB_ATTEMPTS");
  if (job.state === "pending") { requireSafe(job.attempt_count === 0 && job.lease_token === null && job.lease_expires_at === null, "PENDING_JOB_CHANGED"); return; }
  requireSafe(job.attempt_count === 1, "EXECUTOR_ATTEMPT_MISSING");
  if (job.state === "leased") {
    const expires = Date.parse(job.lease_expires_at);
    requireSafe(typeof job.lease_token === "string" && /^[0-9a-f-]{36}$/i.test(job.lease_token) &&
      Number.isFinite(expires) && expires >= plan.first + 119000 && expires <= plan.pauseCutoff + 121000 &&
      (state.leaseToken === undefined || state.leaseToken === job.lease_token), "LEASE_LIFECYCLE_INVALID");
    state.leaseToken = job.lease_token; state.leaseObserved = true;
  } else requireSafe(job.lease_token === null && job.lease_expires_at === null, "TERMINAL_LEASE_NOT_CLEARED");
}
export function verifySuccess(before, after, plan, state) {
  verifyIsolation(before, after); verifyLease(after, plan, state);
  return verifySuccessfulResult(after, plan);
}
function verifySuccessfulResult(after, plan) {
  const j = after.jobs[0], c = after.connections[0];
  requireSafe(j.state === "succeeded" && j.attempt_count === 1 && j.lease_token === null && j.lease_expires_at === null &&
    j.error_code === null && [200, 201].includes(j.provider_status_code) && Date.parse(j.completed_at) >= plan.first - 1000 &&
    Date.parse(j.completed_at) <= plan.completionCutoff && c.last_error_code === null && c.last_error_at === null &&
    Date.parse(c.last_successful_sync_at) === Date.parse(j.completed_at), "CONTROLLED_JOB_NOT_SUCCESSFUL");
  const mappings = after.global_mappings.filter(m => m.connection_id === CONNECTION);
  requireSafe(mappings.length === 1 && mappings[0].source_key === j.source_key && mappings[0].source_version === j.source_version &&
    mappings[0].user_id === j.user_id && mappings[0].user_movie_id === j.user_movie_id && mappings[0].provider_calendar_id === "primary" &&
    mappings[0].provider_event_id === EVENT && mappings[0].sync_state === "synced" &&
    Date.parse(mappings[0].synced_at) === Date.parse(j.completed_at), "EXPECTED_MAPPING_NOT_SYNCED");
  return mappings[0];
}
export function verifyRecoveryState(data, ownerId) {
  verifyInventory(data); validateContracts(data); verifyFinalizer(data);
  requireSafe(data.database_name === "postgres" && data.qa_owner_count === 1 && data.owner_connection_count === 1 &&
    data.connections?.length === 1 && data.credentials?.length === 1 && data.credentials[0].connection_id === CONNECTION,
  "RECOVERY_DEV_IDENTITY_OR_CREDENTIAL_INVALID");
  const c = data.connections[0], j = data.jobs?.[0];
  requireSafe(c.id === CONNECTION && c.user_id === ownerId && c.provider === "google" && c.provider_calendar_id === "primary" &&
    typeof c.provider_subject === "string" && c.provider_subject.trim().length > 0 && c.status === "connected" && c.sync_enabled === true,
  "RECOVERY_CONNECTION_STATE_INVALID");
  requireSafe(data.jobs?.length === 1 && j.id === JOB && j.connection_id === CONNECTION && j.user_id === ownerId &&
    j.user_movie_id === "9152882e-291a-47a2-b964-c1a4a6dd9630" && j.desired_operation === "upsert" &&
    j.source_key === "589038a338f409210b819e6a7e0e871c" && j.source_version === "8ca7b4e9cabaac13bdda45d0089f3169" &&
    data.connection_jobs?.length === 1 && data.connection_jobs[0] === JOB && data.mapping_count === 1 &&
    data.source_matches === true && data.event_id === EVENT && data.selection_eligible === false &&
    data.unrelated_actionable === 0 && data.actionable_cleanup === 0 &&
    Array.isArray(data.job_inventory) && same([...data.job_inventory].sort(), data.global_jobs.map(row => row.id).sort()),
  "RECOVERY_JOB_SOURCE_OR_ISOLATION_INVALID");
  sourceInput(data);
  const plan = { first: RECOVERY_WINDOW.first, completionCutoff: RECOVERY_WINDOW.to };
  verifyLease(data, plan, {});
  const mapping = verifySuccessfulResult(data, plan);
  // No historical baseline was saved by the first-run engine. Do not invent one.
  // Conservatively reject unrelated rows lacking timestamps or showing activity
  // since the start of the incident; then compare full inventories across reads.
  const beforeWindow = value => Number.isFinite(Date.parse(value)) && Date.parse(value) < RECOVERY_WINDOW.from;
  for (const row of data.global_jobs.filter(row => row.id !== JOB)) {
    requireSafe(beforeWindow(row.created_at) && beforeWindow(row.updated_at) &&
      (row.completed_at === null || beforeWindow(row.completed_at)), "RECOVERY_UNRELATED_JOB_ACTIVITY_OR_HISTORY_INCOMPLETE");
  }
  for (const row of data.global_mappings.filter(row => row.id !== mapping.id)) {
    requireSafe(row.connection_id !== CONNECTION && beforeWindow(row.created_at) && beforeWindow(row.updated_at) &&
      beforeWindow(row.synced_at), "RECOVERY_UNRELATED_MAPPING_ACTIVITY_OR_HISTORY_INCOMPLETE");
  }
  return mapping;
}
export function verifyRecoveryProvenance(logs) {
  requireSafe(logs?.detected === true && logs.verified === true && Array.isArray(logs.rows), "RECOVERY_RETAINED_PROVENANCE_MISSING");
  const summary = summarizeEvents(logs.rows), message = summary.messages[0];
  requireSafe(summary.uniqueMessageCount === 1 && message?.delivered === true && message.scheduleId === CALENDAR &&
    message.destination === DESTINATION && message.method === "GET" &&
    message.createdAt >= RECOVERY_WINDOW.first - 1000 && message.createdAt <= RECOVERY_WINDOW.pauseCutoff &&
    message.attemptAt >= message.createdAt && message.attemptAt <= RECOVERY_WINDOW.pauseCutoff &&
    message.deliveredAt >= message.attemptAt && message.deliveredAt <= RECOVERY_WINDOW.to &&
    message.deliveredAt < RECOVERY_WINDOW.second && message.responseStatus >= 200 && message.responseStatus < 300,
  "RECOVERY_FIRST_WINDOW_PROVENANCE_INVALID");
  return true;
}
export function verifyEvent(event, expected, mapping) {
  requireSafe(event && event.id === EVENT && event.status === "confirmed" && event.summary === expected.summary &&
    Date.parse(event.start?.dateTime) === Date.parse(expected.start.dateTime) && Date.parse(event.end?.dateTime) === Date.parse(expected.end.dateTime) &&
    event.start?.timeZone === expected.start.timeZone && event.end?.timeZone === expected.end.timeZone &&
    event.extendedProperties?.private?.watchflowSourceKey === expected.extendedProperties.private.watchflowSourceKey &&
    event.extendedProperties?.private?.watchflowSourceVersion === expected.extendedProperties.private.watchflowSourceVersion &&
    (mapping.provider_etag === null || event.etag === mapping.provider_etag), "GOOGLE_EVENT_FIXTURE_MISMATCH");
  const suffix = `/library/${mapping.movieId}`;
  requireSafe([`Scheduled in WatchFlow. View movie: ${suffix}`, `Scheduled in WatchFlow. View movie: https://watchflow-dev-ops.vercel.app${suffix}`].includes(event.description), "GOOGLE_EVENT_DESCRIPTION_MISMATCH");
}
// Internal normalized proof, derived only from the observed shared decoder.
export function acceptDeliveryProof(proof, plan, state) {
  requireSafe(proof && proof.scheduleId === CALENDAR && proof.destination === DESTINATION && proof.method === "GET" &&
    typeof proof.messageId === "string" && /^[\x21-\x7e]{1,256}$/.test(proof.messageId) &&
    Number.isSafeInteger(proof.createdAt) && proof.createdAt >= plan.first - 1000 && proof.createdAt <= plan.pauseCutoff &&
    typeof proof.delivered === "boolean" && (!state.proof || (state.proof.messageId === proof.messageId && state.proof.createdAt === proof.createdAt)), "AUTOMATIC_DELIVERY_PROOF_INVALID");
  if (proof.delivered) requireSafe(Number.isSafeInteger(proof.deliveredAt) && proof.deliveredAt >= proof.createdAt &&
    proof.deliveredAt <= plan.completionCutoff, "DELIVERY_COMPLETION_TIME_INVALID");
  requireSafe(!state.proof?.delivered || proof.delivered, "DELIVERY_PROOF_REGRESSED");
  state.proof = proof;
}
export async function eventExists(context, data, mapping, read = fetch) {
  const credential = await context.path.read(context.ownerId);
  let refreshToken, access;
  try {
    requireSafe(credential?.connectionId === CONNECTION, "CREDENTIAL_IDENTITY_MISMATCH");
    refreshToken = context.path.decrypt(credential, context.ownerId);
    access = await context.path.refresh(refreshToken, async (url, init) => {
      requireSafe(url === "https://oauth2.googleapis.com/token" && init.method === "POST" && init.body instanceof URLSearchParams &&
        init.body.get("grant_type") === "refresh_token", "UNAPPROVED_GOOGLE_REQUEST");
      return read(url, { ...init, redirect: "error" });
    });
    requireSafe(!access.replacementRefreshToken && typeof access.accessToken === "string" && access.accessToken.length > 0, "FRESH_GOOGLE_TOKEN_INVALID");
    const response = await read(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${EVENT}`, {
      method: "GET", redirect: "error", headers: { authorization: `Bearer ${access.accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    requireSafe(response.status === 200, "GOOGLE_EVENT_NOT_PROVEN_PRESENT");
    verifyEvent(await response.json(), context.buildEvent(sourceInput(data)), { ...mapping, movieId: data.source.movie_id });
  } finally {
    refreshToken = null; if (access) { access.accessToken = null; access.replacementRefreshToken = null; }
    for (const field of ["ciphertext", "nonce", "authTag"]) if (Buffer.isBuffer(credential?.[field])) credential[field].fill(0);
  }
}

export function parseFirstLogPage(page, paginationHeader = false, fromDate, toDate) {
  const parsed = decodeEventPage(page, { ...CALENDAR_CONTRACT, fromDate, toDate }, { paginationHeader });
  return parsed.rows.length ? { detected: true, verified: true, rows: parsed.rows, cursor: parsed.cursor } :
    { detected: false, verified: false, cursor: parsed.cursor };
}
export function acceptEventObservation(logs, plan, state) {
  if (logs.rows) {
    const summary = summarizeEvents([...(state.eventRows ?? []), ...logs.rows]);
    requireSafe(summary.uniqueMessageCount <= 1, "MULTIPLE_AUTOMATIC_MESSAGES");
    state.eventRows = summary.rows;
    const message = summary.messages[0];
    if (message?.createdAt !== undefined) acceptDeliveryProof(message, plan, state);
  } else if (logs.proof) acceptDeliveryProof(logs.proof, plan, state);
}
export async function probeLogs(from, to, read = getJson) {
  requireSafe(Number.isSafeInteger(from) && Number.isSafeInteger(to) && from >= 0 && to >= from, "QSTASH_LOG_WINDOW_INVALID");
  const seen = new Set(); let cursor;
  for (let page = 0; page < 10; page += 1) {
    const url = new URL(`${QSTASH}/logs`);
    for (const [name, value] of Object.entries({ scheduleId: CALENDAR, count: 100, fromDate: from, toDate: to })) url.searchParams.set(name, String(value));
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await read(url.toString(), env("QSTASH_TOKEN_EU"));
    const parsed = parseFirstLogPage(response.body, response.paginationHeader, from, to);
    if (parsed.detected) return parsed;
    if (!parsed.cursor) return parsed;
    requireSafe(!seen.has(parsed.cursor), "QSTASH_CURSOR_LOOP"); seen.add(parsed.cursor); cursor = parsed.cursor;
  }
  throw new SafeFailure("QSTASH_PAGINATION_INCOMPLETE");
}
async function confirmation() {
  requireSafe(process.stdin.isTTY && process.stdout.isTTY, "TTY_REQUIRED");
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  try { return await reader.question(`Type ${CONFIRMATION} to allow one automatic calendar cron observation: `); }
  finally { reader.close(); }
}
export async function runRecovery(overrides = {}) {
  // Deliberately no action/confirm/timer/finally-pause capability in this path.
  const io = { context: createContext, target: localTarget, snapshot, holds: checkHolds,
    eventExists, probe: probeLogs, log: console.log, ...overrides };
  const context = await io.context(); io.target();
  await io.holds(true);
  const before = await io.snapshot(context), mapping = verifyRecoveryState(before, context.ownerId);
  const logs = await io.probe(RECOVERY_WINDOW.from, RECOVERY_WINDOW.to);
  verifyRecoveryProvenance(logs);
  await io.eventExists(context, before, mapping);
  io.target();
  const after = await io.snapshot(context); verifyRecoveryState(after, context.ownerId);
  requireSafe(same(before, after), "RECOVERY_APPLICATION_STATE_CHANGED_DURING_READS");
  await io.holds(true);
  io.log("FIRST_AUTOMATIC_RECOVERED_PASS automatic_delivery_provenance_verified=true job_state=succeeded " +
    "attempt_count=1 lease_null=true mapping_verified=true google_event_fixture_verified=true " +
    "calendar_paused=true reminder_paused=true github_gates_false=true isolation_verified=true " +
    "isolation_scope=current_inventory_and_retained_timestamps historical_baseline_available=false");
}
export function parseArguments(args) {
  requireSafe(args.length === 1 && ["--precheck-only", "--first-run", "--recover"].includes(args[0]), "EXPLICIT_MODE_REQUIRED");
  requireSafe(args[0] !== "--first-run", "FIRST_EXECUTION_ALREADY_OCCURRED_USE_RECOVERY");
  return args[0];
}
export async function runFirst(mode, overrides = {}) {
  if (mode === "--recover") return runRecovery(overrides);
  requireSafe(["--precheck-only", "--first-run"].includes(mode), "EXPLICIT_MODE_REQUIRED");
  const io = { decoderReady: requireCanaryEvidenceReady, context: createContext, target: localTarget, snapshot, holds: checkHolds, googleAbsent, eventExists, probe: probeLogs,
    action: action => calendarAction(action, env("QSTASH_TOKEN_EU")), verifyPaused, confirm: confirmation,
    now: Date.now, mono: () => performance.now(), sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    deadline: (fn, ms) => { const timer = setTimeout(fn, ms); return () => clearTimeout(timer); },
    signals: handler => { process.on("SIGINT", handler); process.on("SIGTERM", handler); return () => { process.off("SIGINT", handler); process.off("SIGTERM", handler); }; },
    log: console.log, ...overrides };
  // This is a local-only gate before context/network/approval and resume.
  // Require immutable capture + its pinned retained-history review supplement.
  if (mode === "--first-run") await io.decoderReady();
  const context = await io.context();
  const capture = async () => {
    io.target();
    const before = await io.snapshot(context); verifyPre(before, context.ownerId);
    await io.holds(true); await io.googleAbsent(context, before);
    const current = await io.snapshot(context); verifyPre(current, context.ownerId);
    requireSafe(same(before, current), "PRECHECK_STATE_CHANGED"); await io.holds(true);
    const logs = await io.probe(io.now() - 5000, io.now());
    requireSafe(!logs.detected && logs.verified === false, "PREEXISTING_QSTASH_EVENTS_UNVERIFIED");
    return current;
  };
  const baseline = await capture();
  io.log("FIRST_AUTOMATIC_PRECHECK_PASS schedules_paused=true application_data_mutation=false");
  if (mode === "--precheck-only") return;
  requireSafe(await io.confirm() === CONFIRMATION, "TYPED_CONFIRMATION_MISMATCH");
  let plan, attempted = false, paused = false, pausePromise, operationError, cancelDeadline, removeSignals;
  const state = { leaseObserved: false }, failures = [];
  const pauseOnce = () => {
    if (!pausePromise) pausePromise = (async () => {
      let requestError;
      try { await io.action("pause"); } catch (error) { requestError = error; }
      // Verify the GET even when the POST response was lost. Never retry POST.
      await io.verifyPaused(); paused = true;
      cancelDeadline?.();
      requireSafe(!requestError, "CALENDAR_PAUSE_RESPONSE_UNCONFIRMED");
    })();
    return pausePromise;
  };
  const stopNow = reason => { state.stop = reason; void pauseOnce().catch(() => {}); };
  let observed = baseline, resumeAt;
  try {
    requireSafe(same(baseline, await capture()), "POST_APPROVAL_STATE_CHANGED");
    plan = cronPlan(io.now());
    const anchor = { wall: io.now(), mono: io.mono() };
    io.log(`FIRST_AUTOMATIC_WINDOW first_utc=${new Date(plan.first).toISOString()} pause_cutoff_utc=${new Date(plan.pauseCutoff).toISOString()} second_utc=${new Date(plan.second).toISOString()}`);
    while (io.now() < plan.prepareAt) { assertClock(io.now(), io.mono(), anchor); await io.sleep(Math.min(2000, plan.prepareAt - io.now())); }
    requireSafe(same(baseline, await capture()), "FINAL_BOUNDARY_STATE_CHANGED");
    assertClock(io.now(), io.mono(), anchor);
    requireSafe(io.now() >= plan.prepareAt && io.now() <= plan.latestResume, "SAFE_RESUME_WINDOW_MISSED");
    cancelDeadline = io.deadline(() => stopNow("HARD_CUTOFF_REACHED"), Math.max(0, plan.pauseCutoff - io.now()));
    removeSignals = io.signals(() => stopNow("OPERATOR_INTERRUPTED"));
    resumeAt = io.now(); attempted = true;
    await io.action("resume"); await io.holds(false);
    while (io.now() < plan.pauseCutoff) {
      assertClock(io.now(), io.mono(), anchor); requireSafe(!state.stop, state.stop);
      const results = await Promise.allSettled([
        io.snapshot(context).then(async data => {
          observed = data;
          if (executionObserved(baseline, data)) { state.detected = true; await pauseOnce(); }
          verifyIsolation(baseline, data); verifyLease(data, plan, state);
          return data;
        }).catch(async error => { await pauseOnce(); throw error; }),
        io.probe(resumeAt, io.now()).then(async logs => {
          if (logs.detected) {
            state.detected = true; await pauseOnce();
            if (logs.schema) io.log(`FIRST_AUTOMATIC_EVENT_SCHEMA ${JSON.stringify(logs.schema)}`);
            requireSafe(logs.verified === true, "QSTASH_EVENT_ROW_SHAPE_UNVERIFIED");
            acceptEventObservation(logs, plan, state);
          }
          return logs;
        }).catch(async error => { await pauseOnce(); throw error; }),
      ]);
      for (const result of results) if (result.status === "rejected") throw result.reason;
      // Pause on the first application/log detection. Complete the correlated
      // lifecycle while paused; empty logs never establish absence of transport.
      if (state.detected) { await pauseOnce(); break; }
      await io.holds(false);
      await io.sleep(1000);
    }
    requireSafe(state.detected && !state.stop, state.stop || "AUTOMATIC_EXECUTION_NOT_OBSERVED");
    await pauseOnce();
    while (io.now() < plan.completionCutoff && (["pending", "leased"].includes(observed.jobs?.[0]?.state) || !state.proof?.delivered)) {
      assertClock(io.now(), io.mono(), anchor); requireSafe(!state.stop, state.stop);
      observed = await io.snapshot(context); verifyIsolation(baseline, observed); verifyLease(observed, plan, state);
      await io.holds(true);
      const logs = await io.probe(resumeAt, io.now());
      if (logs.detected) {
        if (logs.schema) io.log(`FIRST_AUTOMATIC_EVENT_SCHEMA ${JSON.stringify(logs.schema)}`);
        requireSafe(logs.verified === true, "QSTASH_EVENT_ROW_SHAPE_UNVERIFIED");
        acceptEventObservation(logs, plan, state);
      }
      requireSafe(["pending", "leased", "succeeded"].includes(observed.jobs?.[0]?.state), "AUTOMATIC_APPLICATION_PROCESSING_FAILED");
      if (observed.jobs[0].state === "succeeded" && state.proof?.delivered) break;
      await io.sleep(1000);
    }
    const mapping = verifySuccess(baseline, observed, plan, state);
    await io.eventExists(context, observed, mapping);
    state.eventVerified = true;
    observed = await io.snapshot(context); verifySuccess(baseline, observed, plan, state); await io.holds(true);
    requireSafe(state.proof?.delivered === true && !state.stop, "AUTOMATIC_DELIVERY_PROVENANCE_UNVERIFIED");
  } catch (error) { operationError = code(error); }
  finally {
    // Exact approval authorizes the safety pause on every later failure,
    // including a failed boundary recheck before our own resume request.
    try { await pauseOnce(); } catch (error) { failures.push(code(error)); }
    try { observed = await io.snapshot(context); } catch (error) { observed = null; failures.push(code(error)); }
    if (observed) {
      try {
        verifyIsolation(baseline, observed);
        if (!operationError) verifySuccess(baseline, observed, plan, state);
      } catch (error) { failures.push(code(error)); }
    }
    try { await io.holds(true); } catch (error) { failures.push(code(error)); }
    io.log(`FIRST_AUTOMATIC_FINAL_STATE ${JSON.stringify({ resume_attempted: attempted, calendar_pause_verified: paused,
      lease_observed: state.leaseObserved, automatic_delivery_provenance_verified: state.proof?.delivered === true,
      lease_evidence: state.leaseObserved ? "LEASE_OBSERVED" : "LEASE_NOT_OBSERVED",
      google_event_fixture_verified: state.eventVerified ?? "unknown",
      transport_count: state.proof?.delivered ? "ONE_CORRELATED_MESSAGE" : "UNKNOWN",
      ...sanitizedObservation(observed), error: operationError ?? null, failures })}`);
    cancelDeadline?.(); removeSignals?.();
  }
  requireSafe(!failures.length, "FAIL_SAFE_PAUSE_OR_FINAL_CHECK_FAILED");
  requireSafe(!operationError, operationError);
  io.log("FIRST_AUTOMATIC_PASS: one correlated automatic execution; controlled job succeeded; exact event verified; both schedules paused.");
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await runFirst(parseArguments(process.argv.slice(2))); }
  catch (error) { console.error(`${process.argv[2] === "--recover" ? "FIRST_AUTOMATIC_RECOVERY_STOP" : "FIRST_AUTOMATIC_STOP"} code=${code(error)}`); process.exitCode = 1; }
}
