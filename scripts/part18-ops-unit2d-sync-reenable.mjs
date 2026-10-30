// PREPARED ONLY. --reenable requires separate approval and an exact typed phrase.
// Only application-data write: QA User A's authenticated sync-enable RPC.
// No QStash writes, executor/claim calls, workflows, or Calendar mutations.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { loadLocalTestEnvironment } from "../lib/testing/local-environment.mjs";
import { verifyCalendarSchedule } from "./part18-ops-unit2d-script-a2.mjs";
import { canonical, verifyGoogle, SafeFailure as GoogleFailure } from "./part18j-google-reauth-checkpoint.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const REF = "ckwadpmvxieekjlsfcks";
const ORIGIN = `https://${REF}.supabase.co`;
const CONNECTION = "e652e5c8-f08c-4736-88d8-073bce772ccc";
const JOB = "b9eb8a77-0723-675b-3f2b-8503a0781ab8";
const MOVIE = "9152882e-291a-47a2-b964-c1a4a6dd9630";
const SOURCE_KEY = "589038a338f409210b819e6a7e0e871c";
const SOURCE_VERSION = "8ca7b4e9cabaac13bdda45d0089f3169";
const EVENT = "a2ab6758f9fedbb0344d416ac00f2ca7d";
const CALENDAR = "watchflow-dev-part18-ops-unit2d-calendar";
const REMINDER = "watchflow-dev-part18-ops-unit2d-reminders";
const QSTASH = "https://qstash-eu-central-1.upstash.io/v2";
export const CONFIRMATION = "APPROVE_QA_USER_A_CALENDAR_SYNC_REENABLE";
export class SafeFailure extends Error {}
const requireSafe = (ok, code) => { if (!ok) throw new SafeFailure(code); };
const env = name => { const value = process.env[name]; requireSafe(typeof value === "string" && value.length > 0, `MISSING_${name}`); return value; };
const digest = value => createHash("sha256").update(canonical(value)).digest("hex");
const bodyHash = value => createHash("sha256").update(value.replace(/\r\n/g, "\n").trim()).digest("hex");
const safeCode = error => error instanceof SafeFailure || error instanceof GoogleFailure ? error.message : "UNEXPECTED_FAILURE";

// Exact reviewed bodies: the RPC, actual claim predicate, and its pure helpers.
export const CONTRACTS = [
  { name: "watchflow_set_calendar_sync_enabled", args: "boolean", result: "boolean", set: false, definer: true, language: "plpgsql",
    hash: "403ffc9ed030d067a69d44bae9e692310ce8b47faa95decba27cc46c616a54ce", file: "202609290003_part_18j_b_google_oauth.sql" },
  { name: "watchflow_claim_calendar_sync_jobs", args: "integer, integer", result: "record", set: true, definer: true, language: "plpgsql",
    hash: "c15e04c4bcc5f934b04e3e777011322dda520cf4a0ab6e8ebfdbb070f2587b9f", file: "202609300005_part_18j_d_disconnect_reconciliation.sql" },
  { name: "watchflow_calendar_upsert_version", args: "text, timestamp with time zone, text, text, integer", result: "text", set: false, definer: false, language: "sql",
    hash: "14579b627a10310f282ed7bc93a23c098d542bb149ede1293fad5478ce583f8d", file: "202609290001_part_18j_calendar_foundation.sql" },
  { name: "watchflow_calendar_provider_event_id", args: "uuid, text", result: "text", set: false, definer: false, language: "sql",
    hash: "db3339751f5575083be211b2aecc3e4fe4be76bcbef7ca4a81ed013d33a838e2", file: "202609300003_part_18j_c_google_event_id_compatibility.sql" },
];
export function verifyRepositoryContracts() {
  for (const spec of CONTRACTS) {
    const source = readFileSync(resolve(ROOT, "supabase/migrations", spec.file), "utf8").replace(/\r\n/g, "\n");
    const start = source.indexOf(`create or replace function public.${spec.name}(`);
    const body = start < 0 ? null : source.slice(start).split("as $$\n")[1]?.split("$$;")[0];
    requireSafe(typeof body === "string" && bodyHash(body) === spec.hash, "REVIEWED_REPOSITORY_CONTRACT_CHANGED");
  }
}
export function localTarget() {
  loadLocalTestEnvironment(process.env, ROOT);
  let root, branch;
  try {
    const options = { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };
    root = execFileSync("git", ["rev-parse", "--show-toplevel"], options).trim();
    branch = execFileSync("git", ["branch", "--show-current"], options).trim();
  } catch { throw new SafeFailure("GIT_TARGET_READ_FAILED"); }
  requireSafe(ROOT.toLowerCase() === "e:\\watchflow" && resolve(root).toLowerCase() === ROOT.toLowerCase() &&
    branch === "codex/part-18-production-operations", "REPOSITORY_OR_BRANCH_MISMATCH");
  requireSafe(["NEXT_PUBLIC_SUPABASE_URL", "E2E_EXPECTED_SUPABASE_URL"].every(name => new URL(env(name)).href === `${ORIGIN}/`) &&
    env("E2E_EXPECTED_SUPABASE_PROJECT_REF") === REF && env("E2E_TARGET_ENV") === "development", "DEVELOPMENT_TARGET_REQUIRED");
  requireSafe(readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim() === REF &&
    JSON.parse(readFileSync(resolve(ROOT, "supabase/.temp/linked-project.json"), "utf8")).ref === REF, "LINKED_PROJECT_MISMATCH");
  requireSafe(env("GOOGLE_CALENDAR_REDIRECT_URI") === "http://localhost:3000/api/calendar/google/callback", "GOOGLE_REDIRECT_NOT_LOCALHOST");
  for (const name of ["SUPABASE_DB_PASSWORD", "SUPABASE_SECRET_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "E2E_USER_A_EMAIL", "E2E_USER_A_PASSWORD",
    "QSTASH_TOKEN_EU", "GH_TOKEN", "GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET", "CALENDAR_TOKEN_ENCRYPTION_KEY"]) env(name);
  requireSafe(env("WATCHFLOW_SCHEDULER_SECRET").length >= 32, "SCHEDULER_SECRET_INVALID");
  verifyRepositoryContracts();
}
export function poolerConfiguration(marker, environment = process.env) {
  const url = new URL(marker.trim());
  requireSafe(url.protocol === "postgresql:" && url.hostname === "aws-1-ap-northeast-2.pooler.supabase.com" &&
    url.port === "5432" && url.username === `postgres.${REF}` && url.pathname === "/postgres" &&
    !url.password && !url.search && !url.hash, "DEV_POOLER_INVALID");
  requireSafe(typeof environment.SUPABASE_DB_PASSWORD === "string" && environment.SUPABASE_DB_PASSWORD.length > 0, "MISSING_SUPABASE_DB_PASSWORD");
  const ssl = { rejectUnauthorized: true, servername: url.hostname };
  if (environment.SUPABASE_DB_CA_CERT_PATH) {
    const ca = readFileSync(resolve(ROOT, environment.SUPABASE_DB_CA_CERT_PATH), "utf8");
    requireSafe(ca.length < 100000 && ca.includes("BEGIN CERTIFICATE") && !ca.includes("PRIVATE KEY"), "PG_TLS_CA_INVALID");
    ssl.ca = ca;
  }
  return { host: url.hostname, port: 5432, user: url.username, database: "postgres", password: environment.SUPABASE_DB_PASSWORD,
    ssl, sslnegotiation: "postgres", connectionTimeoutMillis: 10000, query_timeout: 20000 };
}

// SELECT only: never executes the claim RPC or takes a job/connection row lock.
export const SNAPSHOT_SQL = `select row_to_json(bundle) as snapshot from (select
  current_database() as database_name,
  (select count(*)::int from auth.users u join public.calendar_connections c on c.user_id=u.id
    where c.id=$1 and c.user_id=$3 and lower(u.email)=lower($4)) as qa_owner_count,
  (select count(*)::int from public.calendar_connections where user_id=$3 and provider='google') as owner_connection_count,
  (select coalesce(json_agg(c), '[]'::json) from public.calendar_connections c where c.id=$1) as connections,
  (select coalesce(json_agg(c), '[]'::json) from public.calendar_credentials c where c.connection_id=$1) as credentials,
  (select coalesce(json_agg(j), '[]'::json) from public.calendar_sync_jobs j where j.id=$2) as jobs,
  (select coalesce(json_agg(j.id order by j.id), '[]'::json) from public.calendar_sync_jobs j where j.connection_id=$1) as connection_jobs,
  (select coalesce(json_agg(j.id order by j.id), '[]'::json) from public.calendar_sync_jobs j) as job_inventory,
  (select count(*)::int from public.calendar_event_mappings where connection_id=$1) as mapping_count,
  (select count(*)::int from public.calendar_sync_jobs where state in ('pending','retryable','leased') and id<>$2) as unrelated_actionable,
  (select count(*)::int from public.calendar_sync_jobs where desired_operation='connection_cleanup' and state in ('pending','retryable','leased')) as actionable_cleanup,
  exists(select 1 from public.calendar_sync_jobs j where j.id=$2 and j.available_at<=now() and j.attempt_count<j.attempt_limit) as due_and_below_limit,
  exists(select 1 from public.calendar_sync_jobs candidate join public.calendar_connections eligible_connection
    on eligible_connection.id=candidate.connection_id and eligible_connection.user_id=candidate.user_id
    where candidate.id=$2 and candidate.available_at<=now() and candidate.attempt_count<candidate.attempt_limit
      and (candidate.state in ('pending','retryable') or (candidate.state='leased' and candidate.lease_expires_at<=now()))
      and ((eligible_connection.status='connected' and eligible_connection.sync_enabled and candidate.desired_operation<>'connection_cleanup')
        or eligible_connection.status='reconnect_required'
        or (eligible_connection.status='disconnect_pending' and candidate.desired_operation='connection_cleanup'))) as selection_eligible,
  exists(select 1 from public.calendar_sync_jobs j join public.user_movies um on um.id=j.user_movie_id and um.user_id=j.user_id
    join public.movies m on m.id=um.movie_id where j.id=$2 and um.status='scheduled' and um.scheduled_for is not null
      and um.schedule_timezone is not null and j.source_version=public.watchflow_calendar_upsert_version(
        j.source_key,um.scheduled_for,um.schedule_timezone,m.title,coalesce(m.runtime_minutes,120))) as source_matches,
  (select public.watchflow_calendar_provider_event_id(connection_id,source_key) from public.calendar_sync_jobs where id=$2) as event_id,
  (select coalesce(json_agg(row_to_json(f)), '[]'::json) from (select p.proname as name,
    oidvectortypes(p.proargtypes) as args, format_type(p.prorettype,null) as result, p.proretset as returns_set,
    p.prosecdef as definer, l.lanname as language, p.proconfig as settings, p.prosrc as body,
    has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
    has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute,
    has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
    exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
    where n.nspname='public' and p.proname=any($5::text[])) f) as functions,
  (select coalesce(json_agg(row_to_json(t)), '[]'::json) from (select t.tgtype as type,t.tgenabled as enabled,
    t.tgname as name,n.nspname as function_schema,p.proname as function_name,p.prosrc as body
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace cn on cn.oid=c.relnamespace
    join pg_proc p on p.oid=t.tgfoid join pg_namespace n on n.oid=p.pronamespace
    where not t.tgisinternal and cn.nspname='public' and c.relname='calendar_connections') t) as triggers
) bundle`;
export async function readSnapshot(context, Client = pg.Client) {
  const config = poolerConfiguration(readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8"));
  const client = new Client(config);
  let idleError = false;
  client.on("error", () => { idleError = true; });
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const result = await client.query(SNAPSHOT_SQL, [CONNECTION, JOB, context.ownerId, env("E2E_USER_A_EMAIL"), CONTRACTS.map(spec => spec.name)]);
    await client.query("ROLLBACK");
    requireSafe(!idleError && result.rows?.length === 1 && result.rows[0].snapshot, "PG_RESULT_INVALID");
    return result.rows[0].snapshot;
  } catch (error) {
    if (error instanceof SafeFailure) throw error;
    const code = error?.code;
    if (["ENOTFOUND", "EAI_AGAIN"].includes(code)) throw new SafeFailure("PG_DNS_FAILED");
    if (["28P01", "28000"].includes(code)) throw new SafeFailure("PG_AUTH_FAILED");
    if (/^(ERR_TLS_|ERR_SSL_)/.test(code || "") || ["SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "CERT_HAS_EXPIRED"].includes(code)) throw new SafeFailure("PG_TLS_FAILED");
    throw new SafeFailure("PG_READ_ONLY_SNAPSHOT_FAILED");
  } finally { await client.end().catch(() => {}); }
}
export function validateContracts(data) {
  requireSafe(Array.isArray(data.functions) && data.functions.length === CONTRACTS.length, "LIVE_FUNCTION_COUNT_MISMATCH");
  for (const spec of CONTRACTS) {
    const matches = data.functions.filter(fn => fn.name === spec.name);
    requireSafe(matches.length === 1, "LIVE_FUNCTION_OVERLOAD_OR_MISSING");
    const fn = matches[0];
    requireSafe(fn.args === spec.args && fn.result === spec.result && fn.returns_set === spec.set && fn.definer === spec.definer &&
      fn.language === spec.language && fn.settings?.length === 1 && ["search_path=", 'search_path=""'].includes(fn.settings[0]) &&
      typeof fn.body === "string" && bodyHash(fn.body) === spec.hash, "LIVE_FUNCTION_CONTRACT_MISMATCH");
    if (spec.definer) requireSafe(fn.public_execute === false && fn.anon_execute === false &&
      fn.authenticated_execute === (spec.name === "watchflow_set_calendar_sync_enabled") &&
      fn.service_execute === (spec.name === "watchflow_claim_calendar_sync_jobs"), "LIVE_FUNCTION_GRANTS_MISMATCH");
  }
  const trigger = data.triggers?.[0];
  requireSafe(data.triggers?.length === 1 && trigger.name === "watchflow_calendar_connections_updated_at" && trigger.type === 19 &&
    trigger.enabled === "O" && trigger.function_schema === "public" && trigger.function_name === "watchflow_set_updated_at" &&
    trigger.body?.replace(/\s+/g, " ").trim().toLowerCase() === "begin new.updated_at := now(); return new; end;", "CONNECTION_TRIGGER_MISMATCH");
}
export function validateFixture(data, ownerId, syncEnabled) {
  requireSafe(data?.database_name === "postgres" && data.qa_owner_count === 1 && data.owner_connection_count === 1, "DEV_FIXTURE_IDENTITY_MISMATCH");
  requireSafe(data.connections?.length === 1, "CONNECTION_COUNT_MISMATCH");
  const c = data.connections[0];
  requireSafe(c.id === CONNECTION && c.user_id === ownerId && c.provider === "google" && c.provider_calendar_id === "primary" &&
    typeof c.provider_subject === "string" && c.provider_subject.trim().length > 0 && c.status === "connected" && c.sync_enabled === syncEnabled, "CONNECTION_STATE_MISMATCH");
  requireSafe(data.credentials?.length === 1 && data.credentials[0].connection_id === CONNECTION, "CREDENTIAL_COUNT_MISMATCH");
  requireSafe(data.jobs?.length === 1, "CONTROLLED_JOB_COUNT_MISMATCH");
  const j = data.jobs[0];
  requireSafe(j.id === JOB && j.connection_id === CONNECTION && j.user_id === ownerId && j.user_movie_id === MOVIE &&
    j.state === "pending" && j.attempt_count === 0 && j.lease_token === null && j.lease_expires_at === null &&
    j.desired_operation === "upsert" && j.source_key === SOURCE_KEY && j.source_version === SOURCE_VERSION, "CONTROLLED_JOB_STATE_MISMATCH");
  requireSafe(data.connection_jobs?.length === 1 && data.connection_jobs[0] === JOB && Array.isArray(data.job_inventory) &&
    new Set(data.job_inventory).size === data.job_inventory.length && data.job_inventory.includes(JOB), "EXTRA_OR_INVALID_JOB_INVENTORY");
  requireSafe(data.mapping_count === 0 && data.unrelated_actionable === 0 && data.actionable_cleanup === 0, "MAPPING_OR_UNRELATED_WORK_PRESENT");
  requireSafe(data.due_and_below_limit === true && data.source_matches === true && data.event_id === EVENT &&
    data.selection_eligible === syncEnabled, "READ_ONLY_CLAIMABILITY_MISMATCH");
  validateContracts(data);
  const stable = { ...c }; delete stable.sync_enabled; delete stable.updated_at;
  return { ownerId, connection: digest(c), stableConnection: digest(stable), credential: digest(data.credentials[0]),
    job: digest(j), inventory: digest(data.job_inventory), contracts: digest({ functions: data.functions, triggers: data.triggers }) };
}
export function compareEvidence(before, after, post) {
  for (const field of ["ownerId", "stableConnection", "credential", "job", "inventory", "contracts"]) requireSafe(before[field] === after[field], `PRESERVATION_${field.toUpperCase()}_FAILED`);
  if (!post) requireSafe(before.connection === after.connection, "PRECHECK_CONNECTION_CHANGED");
}
export function qaFetchGuard(boundary, fetcher = fetch) {
  return async (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const method = (init?.method || input?.method || "GET").toUpperCase();
    const auth = url.origin === ORIGIN && ((url.pathname === "/auth/v1/token" && url.search === "?grant_type=password" && method === "POST") ||
      (url.pathname === "/auth/v1/user" && !url.search && method === "GET"));
    const rpc = url.origin === ORIGIN && url.pathname === "/rest/v1/rpc/watchflow_set_calendar_sync_enabled" && !url.search && method === "POST";
    requireSafe(auth || (rpc && boundary.armed && !boundary.used && init?.body === '{"p_enabled":true}'), "UNAPPROVED_QA_REQUEST");
    if (rpc) { boundary.used = true; boundary.armed = false; }
    return fetcher(input, { ...init, redirect: "error" });
  };
}
export async function assertQaIdentity(context) {
  const result = await context.qa.auth.getUser();
  requireSafe(!result.error && result.data.user?.id === context.ownerId && result.data.user.email?.toLowerCase() === env("E2E_USER_A_EMAIL").toLowerCase(), "QA_A_IDENTITY_MISMATCH");
}
async function createContext() {
  localTarget();
  const boundary = { armed: false, used: false };
  const qa = createClient(ORIGIN, env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: qaFetchGuard(boundary) },
  });
  const login = await qa.auth.signInWithPassword({ email: env("E2E_USER_A_EMAIL"), password: env("E2E_USER_A_PASSWORD") });
  requireSafe(!login.error && login.data.user?.id, "QA_A_SIGNIN_FAILED");
  const context = { qa, ownerId: login.data.user.id, boundary };
  await assertQaIdentity(context);
  const { default: createJITI } = await import("jiti");
  const load = createJITI(import.meta.url, { alias: { "server-only": resolve(ROOT, "node_modules/server-only/empty.js") }, cache: false });
  context.path = { read: load("../lib/calendar/oauth-store.ts").readGoogleCalendarCredential,
    decrypt: load("../lib/calendar/token-encryption.ts").decryptCalendarRefreshToken,
    refresh: load("../lib/calendar/google-calendar-transport.ts").refreshGoogleCalendarAccessToken };
  return context;
}
async function getJson(url, token) {
  const response = await fetch(url, { method: "GET", redirect: "error", headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  requireSafe(response.ok, "HOLD_READ_FAILED");
  return response.json();
}
export async function readHolds(read = getJson) {
  // All four independent reads are attempted; response bodies are never logged.
  const gates = ["WATCHFLOW_DEV_REMINDER_SCHEDULER_ENABLED", "WATCHFLOW_DEV_CALENDAR_SCHEDULER_ENABLED"];
  const results = await Promise.allSettled([
    read(`${QSTASH}/schedules/${CALENDAR}`, env("QSTASH_TOKEN_EU")),
    read(`${QSTASH}/schedules/${REMINDER}`, env("QSTASH_TOKEN_EU")),
    ...gates.map(name => read(`https://api.github.com/repos/hash-j/WatchFlow/actions/variables/${name}`, env("GH_TOKEN"))),
  ]);
  const state = { calendar_paused: "unknown", reminder_paused: "unknown", github_gates_false: "unknown" };
  if (results[0].status === "fulfilled") state.calendar_paused = results[0].value?.isPaused === true;
  if (results[1].status === "fulfilled") state.reminder_paused = results[1].value?.isPaused === true;
  if (results.slice(2).every(result => result.status === "fulfilled")) state.github_gates_false = results.slice(2).every((result, i) => result.value?.name === gates[i] && result.value.value === "false");
  try {
    requireSafe(results.every(result => result.status === "fulfilled"), "HOLD_READ_FAILED");
    const [calendar, reminder] = results.map(result => result.value);
    try { verifyCalendarSchedule(calendar, "4-59/5 * * * *", env("WATCHFLOW_SCHEDULER_SECRET")); }
    catch { throw new SafeFailure("CALENDAR_ACCEPTANCE_OR_AUTH_GUARD_FAILED"); }
    requireSafe(reminder?.scheduleId === REMINDER && reminder.destination === "https://watchflow-dev-ops.vercel.app/api/internal/notifications/scheduled-reminders" &&
      reminder.isPaused === true, "REMINDER_HOLD_FAILED");
    requireSafe(state.github_gates_false === true, "GITHUB_GATE_NOT_FALSE");
    return state;
  } catch (error) { error.holdState = state; throw error; }
}
export async function googleAbsent(context, data) {
  let credential;
  try { credential = await context.path.read(context.ownerId); } catch { throw new SafeFailure("CREDENTIAL_READ_FAILED"); }
  try {
    requireSafe(credential?.connectionId === CONNECTION && [credential.ciphertext, credential.nonce, credential.authTag].every(Buffer.isBuffer), "CREDENTIAL_ENVELOPE_INVALID");
    if (data) {
      const row = data.credentials?.[0];
      requireSafe(data.credentials?.length === 1 && credential.keyVersion === row.encryption_key_version &&
        ["ciphertext", "nonce", "authTag"].every((field, i) => `\\x${credential[field].toString("hex")}` === row[["refresh_token_ciphertext", "refresh_token_nonce", "refresh_token_auth_tag"][i]]), "CREDENTIAL_RPC_MISMATCH");
    }
    await verifyGoogle({ path: context.path, credential, ownerId: context.ownerId });
  } finally { for (const field of ["ciphertext", "nonce", "authTag"]) if (Buffer.isBuffer(credential?.[field])) credential[field].fill(0); }
}
export function assertConfirmation(answer) { requireSafe(answer === CONFIRMATION, "TYPED_CONFIRMATION_MISMATCH"); }
async function confirm() {
  requireSafe(process.stdin.isTTY && process.stdout.isTTY, "TTY_REQUIRED");
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try { return await prompt.question(`Type ${CONFIRMATION} to enable only QA User A calendar sync: `); }
  finally { prompt.close(); }
}
export function parseArguments(args) {
  requireSafe(args.length === 1 && ["--precheck-only", "--reenable"].includes(args[0]), "EXPLICIT_MODE_REQUIRED");
  return args[0];
}
export function sanitizedObservation(data) {
  const c = data?.connections?.length === 1 ? data.connections[0] : null;
  const j = data?.jobs?.length === 1 ? data.jobs[0] : null;
  return { connection_exact: c?.id === CONNECTION, connection_status: ["connected", "reconnect_required", "disconnect_pending"].includes(c?.status) ? c.status : "unknown",
    sync_enabled: typeof c?.sync_enabled === "boolean" ? c.sync_enabled : "unknown", controlled_job_exact: j?.id === JOB,
    job_state: ["pending", "retryable", "leased", "succeeded", "skipped", "failed", "auth_required"].includes(j?.state) ? j.state : "unknown",
    attempt_count: Number.isInteger(j?.attempt_count) && j.attempt_count >= 0 && j.attempt_count <= 10 ? j.attempt_count : "unknown",
    lease_null: j ? j.lease_token === null && j.lease_expires_at === null : "unknown",
    source_matches_expected: j ? j.desired_operation === "upsert" && j.source_key === SOURCE_KEY && j.source_version === SOURCE_VERSION : "unknown",
    mapping_absent: Number.isInteger(data?.mapping_count) ? data.mapping_count === 0 : "unknown",
    unrelated_work_absent: Number.isInteger(data?.unrelated_actionable) ? data.unrelated_actionable === 0 : "unknown",
    cleanup_absent: Number.isInteger(data?.actionable_cleanup) ? data.actionable_cleanup === 0 : "unknown",
    claim_selection_eligible: typeof data?.selection_eligible === "boolean" ? data.selection_eligible : "unknown" };
}
export async function runCheckpoint(mode, overrides = {}) {
  requireSafe(["--precheck-only", "--reenable"].includes(mode), "EXPLICIT_MODE_REQUIRED");
  const io = { context: createContext, target: localTarget, identity: assertQaIdentity, snapshot: readSnapshot, holds: readHolds, google: googleAbsent, confirm,
    mutate: context => context.qa.rpc("watchflow_set_calendar_sync_enabled", { p_enabled: true }), log: console.log, ...overrides };
  const context = await io.context();
  const capturePre = async () => {
    io.target();
    await io.identity(context);
    const data = await io.snapshot(context);
    const evidence = validateFixture(data, context.ownerId, false);
    await io.holds(); await io.google(context, data);
    const final = await io.snapshot(context);
    const current = validateFixture(final, context.ownerId, false);
    compareEvidence(evidence, current, false);
    await io.holds();
    return current;
  };
  const baseline = await capturePre();
  io.log("SYNC_REENABLE_PRECHECK_PASS sync_enabled=false application_data_mutation_attempted=false");
  if (mode === "--precheck-only") return;
  assertConfirmation(await io.confirm());
  // The prompt may remain open; repeat every guard after approval.
  compareEvidence(baseline, await capturePre(), false);
  context.boundary.armed = true;
  let rpcSuccess = false, rpcFailure;
  try {
    const result = await io.mutate(context);
    requireSafe(!result.error && result.data === true, "OWNER_SYNC_RPC_FAILED");
    rpcSuccess = true;
  } catch (error) { rpcFailure = safeCode(error); }
  finally { context.boundary.armed = false; }
  // Attempt may have committed even if its response was lost. Never retry or
  // roll back automatically. Independently inspect every postcondition.
  const failures = [];
  let observed, holds, eventAbsent = "unknown";
  const check = async (name, fn) => {
    try { return await fn(); } catch (error) { failures.push(`${name}_${safeCode(error)}`); if (error.holdState) holds = error.holdState; return null; }
  };
  for (let pass = 0; pass < 2; pass += 1) {
    const data = await check("DATABASE_READ", () => io.snapshot(context));
    observed = data;
    await check("FIXTURE", async () => compareEvidence(baseline, validateFixture(data, context.ownerId, true), true));
    if (pass === 0) await check("GOOGLE", async () => { await io.google(context, data); eventAbsent = true; });
    await check("HOLDS", async () => { holds = await io.holds(); });
  }
  io.log(`SYNC_REENABLE_POST_STATE ${JSON.stringify({ mutation_attempted: true, rpc_reported_success: rpcSuccess,
    ...sanitizedObservation(observed), google_event_absent: eventAbsent,
    ...(holds ?? { calendar_paused: "unknown", reminder_paused: "unknown", github_gates_false: "unknown" }), failures })}`);
  requireSafe(!rpcFailure, `RPC_${rpcFailure}`);
  requireSafe(failures.length === 0, failures[0] ?? "POSTCHECK_FAILED");
  io.log("SYNC_REENABLE_PASS: QA User A sync enabled; controlled upsert unchanged and eligible; both schedules paused; executor not invoked.");
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await runCheckpoint(parseArguments(process.argv.slice(2))); }
  catch (error) { console.error(`SYNC_REENABLE_STOP code=${safeCode(error)}`); process.exitCode = 1; }
}
