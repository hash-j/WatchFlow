// PREPARED ONLY: read-only remote checkpoints; OAuth is performed manually.
// The only writes here are signed, ignored local checkpoint files. Google POST
// is restricted to the existing credential-preserving refresh-token helper.
import { execFileSync } from "node:child_process";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { loadLocalTestEnvironment } from "../lib/testing/local-environment.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const REF = "ckwadpmvxieekjlsfcks";
const BRANCH = "codex/part-18-production-operations";
const VERSION = "202610160001";
const CONNECTION = "e652e5c8-f08c-4736-88d8-073bce772ccc";
const JOB = "b9eb8a77-0723-675b-3f2b-8503a0781ab8";
const MOVIE = "9152882e-291a-47a2-b964-c1a4a6dd9630";
const SOURCE_KEY = "589038a338f409210b819e6a7e0e871c";
const SOURCE_VERSION = "8ca7b4e9cabaac13bdda45d0089f3169";
export const EVENT_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events/a2ab6758f9fedbb0344d416ac00f2ca7d";
export const MANUAL_URL = "http://localhost:3000/settings/calendar";
export const CONFIRMATION = "APPROVE_QA_USER_A_SAME_SUBJECT_GOOGLE_REAUTH";
const BASELINE = resolve(ROOT, "supabase/.temp/part18j-google-reauth-baseline.json");
const APPROVAL = resolve(ROOT, "supabase/.temp/part18j-google-reauth-approval.json");
const MIGRATION = resolve(ROOT, "supabase/migrations/202610160001_part_18j_same_subject_reauth.sql");
const MIGRATION_HASH = "ab177e4c2d224f990b3176d1dbc8c23b0dbb1c664fee097511f0d5df259b5109";
const CODE_HASH = "39de84cf15f59862df2195c26746dd3ac49ca445510901942cb02c2e363f8cf0";
const CODE_FILES = ["app/api/calendar/google/start/route.ts", "app/api/calendar/google/callback/route.ts",
  "lib/calendar/oauth-store.ts", "lib/calendar/google-provider.ts", "lib/calendar/token-encryption.ts", "lib/calendar/google-config.ts"];
const QSTASH = "https://qstash-eu-central-1.upstash.io/v2";
const CALENDAR_SCHEDULE = "watchflow-dev-part18-ops-unit2d-calendar";
const REMINDER_SCHEDULE = "watchflow-dev-part18-ops-unit2d-reminders";
const DESTINATION = "https://watchflow-dev-ops.vercel.app/api/internal/calendar/sync";
const REMINDER_DESTINATION = "https://watchflow-dev-ops.vercel.app/api/internal/notifications/scheduled-reminders";
const ARGS = "uuid, text, text, text[], bytea, bytea, bytea, smallint";

export class SafeFailure extends Error {}
const requireSafe = (condition, code) => { if (!condition) throw new SafeFailure(code); };
const env = name => { const value = process.env[name]; requireSafe(typeof value === "string" && value.length > 0, `MISSING_${name}`); return value; };
const sha = value => createHash("sha256").update(value).digest("hex");
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const digest = value => sha(canonical(value));
function key() {
  const encoded = env("CALENDAR_TOKEN_ENCRYPTION_KEY");
  const decoded = Buffer.from(encoded, "base64");
  requireSafe(/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) && decoded.length === 32, "ENCRYPTION_KEY_INVALID");
  return decoded;
}
const mac = (kind, value) => createHmac("sha256", key()).update(`${kind}\0${canonical(value)}`).digest("hex");
function command(args) {
  try { return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
  catch { throw new SafeFailure("LOCAL_GIT_GUARD_FAILED"); }
}
export function checkLocalTarget() {
  loadLocalTestEnvironment(process.env, ROOT);
  requireSafe(resolve(command(["rev-parse", "--show-toplevel"])).toLowerCase() === ROOT.toLowerCase(), "WRONG_REPOSITORY");
  requireSafe(command(["branch", "--show-current"]) === BRANCH, "WRONG_BRANCH");
  requireSafe(["NEXT_PUBLIC_SUPABASE_URL", "E2E_EXPECTED_SUPABASE_URL"].every(name => new URL(env(name)).href === `https://${REF}.supabase.co/`) &&
    env("E2E_EXPECTED_SUPABASE_PROJECT_REF") === REF && env("E2E_TARGET_ENV") === "development", "DEV_TARGET_REQUIRED");
  requireSafe(readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim() === REF &&
    JSON.parse(readFileSync(resolve(ROOT, "supabase/.temp/linked-project.json"), "utf8")).ref === REF, "WRONG_LINKED_PROJECT");
  requireSafe(env("GOOGLE_CALENDAR_REDIRECT_URI") === "http://localhost:3000/api/calendar/google/callback", "GOOGLE_REDIRECT_NOT_LOCALHOST");
  env("GOOGLE_CALENDAR_CLIENT_ID"); env("GOOGLE_CALENDAR_CLIENT_SECRET"); env("SUPABASE_SECRET_KEY"); key();
  requireSafe(sha(readFileSync(MIGRATION)) === MIGRATION_HASH, "MIGRATION_SOURCE_CHANGED");
  requireSafe(sha(JSON.stringify(CODE_FILES.map(path => [path, sha(readFileSync(resolve(ROOT, path)))]))) === CODE_HASH, "REVIEWED_OAUTH_CODE_CHANGED");
  command(["check-ignore", "--quiet", "--", "supabase/.temp/part18j-google-reauth-baseline.json"]);
}
const normalizedBody = source => source.replace(/\r\n/g, "\n").trim();
export function verifyLiveContract(data) {
  requireSafe(data.database_name === "postgres" && data.migration_count === 1, "DEV_DATABASE_OR_MIGRATION_MISMATCH");
  requireSafe(Array.isArray(data.functions) && data.functions.length === 1, "FUNCTION_OVERLOAD_OR_MISSING");
  const fn = data.functions[0];
  requireSafe(fn.args === ARGS && fn.result_type === "uuid" && fn.returns_set === false &&
    fn.language === "plpgsql" && fn.security_definer === true, "FUNCTION_SIGNATURE_OR_SECURITY_MISMATCH");
  requireSafe(fn.settings?.length === 1 && ["search_path=", 'search_path=""'].includes(fn.settings[0]), "FUNCTION_SEARCH_PATH_MISMATCH");
  requireSafe(fn.service_execute === true && fn.public_execute === false && fn.anon_execute === false && fn.authenticated_execute === false, "FUNCTION_GRANTS_MISMATCH");
  const expected = readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n").split("as $$\n")[1]?.split("$$;")[0];
  requireSafe(typeof fn.body === "string" && typeof expected === "string" && normalizedBody(fn.body) === normalizedBody(expected), "DEPLOYED_REAUTH_CONTRACT_MISMATCH");
  requireSafe(typeof fn.definition === "string" && fn.definition.length > 100, "FUNCTION_DEFINITION_MISSING");
  requireSafe(Array.isArray(data.triggers) && data.triggers.length === 2, "UNEXPECTED_OAUTH_TABLE_TRIGGER");
  for (const [table, name] of [["calendar_connections", "watchflow_calendar_connections_updated_at"], ["calendar_credentials", "watchflow_calendar_credentials_updated_at"]]) {
    const trigger = data.triggers.find(row => row.table_name === table && row.name === name);
    requireSafe(trigger?.type === 19 && trigger.enabled === "O" && trigger.function_schema === "public" &&
      trigger.function_name === "watchflow_set_updated_at" &&
      trigger.body?.replace(/\s+/g, " ").trim().toLowerCase() === "begin new.updated_at := now(); return new; end;", "UNEXPECTED_OAUTH_TABLE_TRIGGER");
  }
  return digest({ definition: fn.definition, triggers: data.triggers });
}
async function readDatabase() {
  const url = new URL(readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim());
  requireSafe(url.protocol === "postgresql:" && url.hostname === "aws-1-ap-northeast-2.pooler.supabase.com" &&
    url.port === "5432" && url.username === `postgres.${REF}` && url.pathname === "/postgres" && !url.password && !url.search && !url.hash, "DEV_POOLER_INVALID");
  const ssl = { rejectUnauthorized: true, servername: url.hostname };
  if (process.env.SUPABASE_DB_CA_CERT_PATH) {
    const ca = readFileSync(resolve(ROOT, process.env.SUPABASE_DB_CA_CERT_PATH), "utf8");
    requireSafe(ca.length < 100_000 && ca.includes("BEGIN CERTIFICATE") && !ca.includes("PRIVATE KEY"), "PG_TLS_CA_INVALID");
    ssl.ca = ca;
  }
  const client = new pg.Client({ host: url.hostname, port: 5432, user: url.username, database: "postgres",
    password: env("SUPABASE_DB_PASSWORD"), ssl, sslnegotiation: "postgres", connectionTimeoutMillis: 10000, query_timeout: 20000 });
  let idleError;
  client.on("error", error => { idleError = error; });
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const result = await client.query(`select pg_catalog.row_to_json(bundle) as snapshot from (select
      pg_catalog.current_database() as database_name,
      (select count(*)::int from supabase_migrations.schema_migrations where version = $4) as migration_count,
      (select coalesce(json_agg(row_to_json(f)), '[]'::json) from (select
        pg_catalog.oidvectortypes(p.proargtypes) as args, pg_catalog.format_type(p.prorettype,null) as result_type,
        p.proretset as returns_set, l.lanname as language, p.prosecdef as security_definer, p.proconfig as settings,
        p.prosrc as body, pg_catalog.pg_get_functiondef(p.oid) as definition,
        has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute,
        has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
        has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
        exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute
        from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
        join pg_catalog.pg_language l on l.oid=p.prolang
        where n.nspname='public' and p.proname='watchflow_upsert_google_calendar_connection') f) as functions,
      (select coalesce(json_agg(row_to_json(t) order by t.table_name), '[]'::json) from (select
        c.relname as table_name, t.tgname as name, t.tgtype as type, t.tgenabled as enabled,
        pn.nspname as function_schema, p.proname as function_name, p.prosrc as body
        from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid
        join pg_catalog.pg_namespace n on n.oid=c.relnamespace join pg_catalog.pg_proc p on p.oid=t.tgfoid
        join pg_catalog.pg_namespace pn on pn.oid=p.pronamespace
        where not t.tgisinternal and n.nspname='public' and c.relname in ('calendar_connections','calendar_credentials')) t) as triggers,
      (select coalesce(json_agg(c), '[]'::json) from public.calendar_connections c where c.id=$1) as connections,
      (select coalesce(json_agg(c), '[]'::json) from public.calendar_credentials c where c.connection_id=$1) as credentials,
      (select coalesce(json_agg(j), '[]'::json) from public.calendar_sync_jobs j where j.id=$2) as jobs,
      (select coalesce(json_agg(j.id order by j.id), '[]'::json) from public.calendar_sync_jobs j where j.connection_id=$1) as connection_jobs,
      (select coalesce(json_agg(j.id order by j.id), '[]'::json) from public.calendar_sync_jobs j) as job_inventory,
      (select count(*)::int from public.calendar_event_mappings m where m.connection_id=$1) as mapping_count,
      (select count(*)::int from public.calendar_sync_jobs j where j.state in ('pending','retryable','leased') and j.id<>$2) as unrelated_actionable,
      (select count(*)::int from public.calendar_sync_jobs j where j.desired_operation='connection_cleanup' and j.state in ('pending','retryable','leased')) as actionable_cleanup,
      (select count(*)::int from auth.users u join public.calendar_connections c on c.user_id=u.id
        where c.id=$1 and lower(u.email)=lower($3)) as qa_owner_count,
      (select count(*)::int from public.calendar_connections c where c.provider='google' and c.user_id=(select user_id from public.calendar_connections where id=$1)) as owner_connection_count
      ) bundle`, [CONNECTION, JOB, env("E2E_USER_A_EMAIL"), VERSION]);
    await client.query("ROLLBACK");
    requireSafe(!idleError && result.rows?.length === 1 && result.rows[0].snapshot, "PG_RESULT_INVALID");
    return result.rows[0].snapshot;
  } catch (error) {
    if (error instanceof SafeFailure) throw error;
    const code = error?.code;
    if (["ENOTFOUND", "EAI_AGAIN"].includes(code)) throw new SafeFailure("PG_DNS_FAILED");
    if (["28P01", "28000"].includes(code)) throw new SafeFailure("PG_AUTH_FAILED");
    if (/^(ERR_TLS_|ERR_SSL_)/.test(code || "") || ["SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "CERT_HAS_EXPIRED"].includes(code)) throw new SafeFailure("PG_TLS_FAILED");
    throw new SafeFailure("PG_READ_ONLY_CHECK_FAILED");
  } finally { await client.end().catch(() => {}); }
}
const envelope = row => ({ ciphertext: row.refresh_token_ciphertext, nonce: row.refresh_token_nonce,
  authTag: row.refresh_token_auth_tag, keyVersion: row.encryption_key_version });
export function fixtureEvidence(data, functionHash, subjectSigner = value => mac("subject", value)) {
  requireSafe(data.qa_owner_count === 1 && data.owner_connection_count === 1 && data.connections?.length === 1, "QA_CONNECTION_IDENTITY_MISMATCH");
  const c = data.connections[0];
  requireSafe(c.id === CONNECTION && c.provider === "google" && c.status === "connected" && c.sync_enabled === false &&
    c.provider_calendar_id === "primary" && typeof c.provider_subject === "string" && c.provider_subject.length > 0, "CONNECTION_STATE_MISMATCH");
  requireSafe(data.credentials?.length === 1 && data.credentials[0].connection_id === CONNECTION, "CREDENTIAL_COUNT_MISMATCH");
  const credential = data.credentials[0];
  for (const [field, length] of [["refresh_token_ciphertext", null], ["refresh_token_nonce", 12], ["refresh_token_auth_tag", 16]]) {
    requireSafe(typeof credential[field] === "string" && /^\\x(?:[0-9a-f]{2})+$/i.test(credential[field]) &&
      (length === null || credential[field].length === 2 + length * 2), "CREDENTIAL_ENVELOPE_INVALID");
  }
  requireSafe(data.jobs?.length === 1, "CONTROLLED_JOB_MISSING");
  const j = data.jobs[0];
  requireSafe(j.id === JOB && j.connection_id === CONNECTION && j.user_id === c.user_id && j.user_movie_id === MOVIE &&
    j.state === "pending" && j.attempt_count === 0 && j.lease_token === null && j.lease_expires_at === null &&
    j.desired_operation === "upsert" && j.source_key === SOURCE_KEY && j.source_version === SOURCE_VERSION, "CONTROLLED_JOB_STATE_MISMATCH");
  requireSafe(data.connection_jobs?.length === 1 && data.connection_jobs[0] === JOB, "NEW_CONNECTION_WORK_PRESENT");
  requireSafe(data.mapping_count === 0 && data.unrelated_actionable === 0 && data.actionable_cleanup === 0, "MAPPING_OR_UNRELATED_WORK_PRESENT");
  requireSafe(Array.isArray(data.job_inventory) && data.job_inventory.includes(JOB) && new Set(data.job_inventory).size === data.job_inventory.length, "JOB_INVENTORY_INVALID");
  const subjectMac = subjectSigner({ owner: c.user_id, subject: c.provider_subject });
  const stable = { ...c, provider_subject: subjectMac };
  for (const field of ["display_email", "granted_scopes", "connected_at", "updated_at", "last_error_code", "last_error_at"]) delete stable[field];
  return { subjectMac, connectionHash: digest(c), stableConnectionHash: digest(stable), credentialRowHash: digest(credential),
    credentialEnvelopeHash: digest(envelope(credential)), credentialIdentityHash: digest({ connection: credential.connection_id, created: credential.created_at }),
    jobHash: digest(j), jobInventoryHash: digest(data.job_inventory), functionHash };
}
async function readJson(url, token) {
  const response = await fetch(url, { method: "GET", redirect: "error", headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  requireSafe(response.ok, "EXTERNAL_HOLD_READ_FAILED");
  return response.json();
}
export function validateSchedule(calendar, reminder, schedulerSecret) {
  requireSafe(calendar.scheduleId === CALENDAR_SCHEDULE && calendar.destination === DESTINATION && calendar.method === "GET" &&
    calendar.cron === "0 0 1 1 *" && calendar.retries === 0 && calendar.timeout === 55000 && calendar.isPaused === true &&
    Array.isArray(calendar.labels) && canonical([...calendar.labels].sort()) === canonical(["watchflow-dev", "part18-ops-unit2d", "calendar"].sort()), "CALENDAR_QSTASH_MISMATCH");
  const headers = Object.entries(calendar.header ?? {});
  const auth = headers.filter(([name]) => /^(Upstash-Forward-)?Authorization$/i.test(name));
  requireSafe(auth.length === 1 && headers.filter(([name]) => /^content-type$/i.test(name)).length <= 1 &&
    headers.every(([name]) => /^(?:(?:Upstash-Forward-)?Authorization|Content-Type)$/i.test(name)) &&
    Array.isArray(auth[0][1]) && auth[0][1].length === 1 && auth[0][1][0] === `REDACTED:${sha(`Bearer ${schedulerSecret}`)}`, "QSTASH_AUTHORIZATION_EVIDENCE_INVALID");
  requireSafe(reminder.scheduleId === REMINDER_SCHEDULE && reminder.destination === REMINDER_DESTINATION && reminder.isPaused === true, "REMINDER_QSTASH_MISMATCH");
  return digest({ calendar: { id: calendar.scheduleId, destination: calendar.destination, cron: calendar.cron, method: calendar.method,
    retries: calendar.retries, timeout: calendar.timeout, paused: calendar.isPaused, labels: [...calendar.labels].sort() },
  reminder: { id: reminder.scheduleId, destination: reminder.destination, paused: reminder.isPaused } });
}
async function readHolds() {
  const token = env("QSTASH_TOKEN_EU");
  const calendar = await readJson(`${QSTASH}/schedules/${CALENDAR_SCHEDULE}`, token);
  const reminder = await readJson(`${QSTASH}/schedules/${REMINDER_SCHEDULE}`, token);
  const holdsHash = validateSchedule(calendar, reminder, env("WATCHFLOW_SCHEDULER_SECRET"));
  for (const name of ["WATCHFLOW_DEV_REMINDER_SCHEDULER_ENABLED", "WATCHFLOW_DEV_CALENDAR_SCHEDULER_ENABLED"]) {
    const gate = await readJson(`https://api.github.com/repos/hash-j/WatchFlow/actions/variables/${name}`, env("GH_TOKEN"));
    requireSafe(gate.name === name && gate.value === "false", "GITHUB_GATE_NOT_FALSE");
  }
  return holdsHash;
}
async function approvedPath() {
  const { default: createJITI } = await import("jiti");
  const load = createJITI(import.meta.url, { alias: { "server-only": resolve(ROOT, "node_modules/server-only/empty.js") }, cache: false });
  return { read: load("../lib/calendar/oauth-store.ts").readGoogleCalendarCredential,
    decrypt: load("../lib/calendar/token-encryption.ts").decryptCalendarRefreshToken,
    refresh: load("../lib/calendar/google-calendar-transport.ts").refreshGoogleCalendarAccessToken };
}
async function capture() {
  checkLocalTarget();
  const data = await readDatabase();
  const evidence = fixtureEvidence(data, verifyLiveContract(data));
  const path = await approvedPath();
  const ownerId = data.connections[0].user_id;
  let credential;
  try { credential = await path.read(ownerId); } catch { throw new SafeFailure("CREDENTIAL_READ_FAILED"); }
  requireSafe(credential?.connectionId === CONNECTION && [credential.ciphertext, credential.nonce, credential.authTag].every(Buffer.isBuffer), "CREDENTIAL_RPC_INVALID");
  requireSafe(credential.keyVersion === Number(process.env.CALENDAR_TOKEN_ENCRYPTION_KEY_VERSION ?? "1") &&
    digest({ ciphertext: `\\x${credential.ciphertext.toString("hex")}`, nonce: `\\x${credential.nonce.toString("hex")}`,
      authTag: `\\x${credential.authTag.toString("hex")}`, keyVersion: credential.keyVersion }) === evidence.credentialEnvelopeHash, "CREDENTIAL_RPC_OR_KEY_VERSION_MISMATCH");
  evidence.holdsHash = await readHolds();
  evidence.configHash = mac("oauth-config", [env("GOOGLE_CALENDAR_CLIENT_ID"), env("GOOGLE_CALENDAR_CLIENT_SECRET"), env("GOOGLE_CALENDAR_REDIRECT_URI"), credential.keyVersion]);
  return { evidence, credential, ownerId, path };
}
export async function verifyGoogle(state, fetcher = fetch) {
  let refreshToken;
  let accessToken;
  let classification = "other_safe_classification";
  try {
    try { refreshToken = state.path.decrypt(state.credential, state.ownerId); }
    catch { throw new SafeFailure("CREDENTIAL_DECRYPT_FAILED"); }
    let tokens;
    try {
      tokens = await state.path.refresh(refreshToken, async (url, init) => {
        requireSafe(url === "https://oauth2.googleapis.com/token" && init.method === "POST" &&
          init.body instanceof URLSearchParams && init.body.get("grant_type") === "refresh_token", "UNAPPROVED_GOOGLE_REQUEST");
        let response;
        try { response = await fetcher(url, { ...init, redirect: "error" }); }
        catch { classification = "network_error"; throw new SafeFailure("GOOGLE_REFRESH_FAILED classification=network_error"); }
        if (!response.ok) {
          try {
            const body = await response.clone().json();
            classification = ["invalid_grant", "invalid_client", "unauthorized_client"].includes(body?.error) ? body.error : "other_safe_classification";
          } catch { classification = "malformed_response"; }
        }
        return response;
      });
    } catch (error) {
      if (error instanceof SafeFailure) throw error;
      if (error?.errorCode === "google_token_response_invalid") classification = "malformed_response";
      throw new SafeFailure(`GOOGLE_REFRESH_FAILED classification=${classification}`);
    }
    requireSafe(tokens && typeof tokens === "object", "GOOGLE_REFRESH_FAILED classification=malformed_response");
    requireSafe(!tokens.replacementRefreshToken, "GOOGLE_REFRESH_FAILED classification=replacement_refresh_token_returned");
    requireSafe(typeof tokens.accessToken === "string" && tokens.accessToken.length > 0, "GOOGLE_REFRESH_FAILED classification=malformed_response");
    accessToken = tokens.accessToken;
    let response;
    try {
      response = await fetcher(EVENT_URL, { method: "GET", redirect: "error", headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
    } catch { throw new SafeFailure("GOOGLE_EVENT_GET_FAILED classification=network_error"); }
    requireSafe(response.status === 404, "GOOGLE_EVENT_NOT_PROVEN_ABSENT");
    await response.body?.cancel();
  } finally {
    refreshToken = null; accessToken = null;
    for (const buffer of [state.credential.ciphertext, state.credential.nonce, state.credential.authTag]) buffer.fill(0);
  }
}
export async function verifyPreGoogle(state, verify = verifyGoogle) {
  try {
    await verify(state);
    return "REFRESH_SUCCEEDED_EVENT_ABSENT";
  } catch (error) {
    if (error instanceof SafeFailure && error.message === "GOOGLE_REFRESH_FAILED classification=invalid_grant") {
      return "EXPECTED_STALE_GOOGLE_GRANT";
    }
    throw error;
  }
}
export function compareCheckpoint(baseline, current, post) {
  for (const field of ["subjectMac", "stableConnectionHash", "credentialIdentityHash", "jobHash", "jobInventoryHash", "functionHash", "holdsHash", "configHash"]) {
    requireSafe(current[field] === baseline[field], `CHECKPOINT_${field.toUpperCase()}_MISMATCH`);
  }
  if (post) requireSafe(current.credentialRowHash !== baseline.credentialRowHash && current.credentialEnvelopeHash !== baseline.credentialEnvelopeHash, "CREDENTIAL_NOT_REPLACED");
  else requireSafe(current.connectionHash === baseline.connectionHash && current.credentialRowHash === baseline.credentialRowHash && current.credentialEnvelopeHash === baseline.credentialEnvelopeHash, "PRE_REAUTH_STATE_CHANGED");
}
export function signedRecord(kind, payload) { return { kind, payload, signature: mac(kind, payload) }; }
export function verifyRecord(record, kind) {
  requireSafe(record?.kind === kind && record.payload && typeof record.signature === "string" && /^[a-f0-9]{64}$/.test(record.signature), "CHECKPOINT_INVALID");
  requireSafe(timingSafeEqual(Buffer.from(record.signature, "hex"), Buffer.from(mac(kind, record.payload), "hex")), "CHECKPOINT_SIGNATURE_INVALID");
  requireSafe(record.payload.project === REF && record.payload.schema === 1, "CHECKPOINT_TARGET_MISMATCH");
  return record.payload;
}
function readRecord(path, kind) {
  requireSafe(existsSync(path), "CHECKPOINT_MISSING");
  const text = readFileSync(path, "utf8");
  requireSafe(text.length < 100_000, "CHECKPOINT_INVALID");
  return verifyRecord(JSON.parse(text), kind);
}
function writeRecord(path, kind, payload) {
  requireSafe(!existsSync(path), "CHECKPOINT_ALREADY_EXISTS");
  writeFileSync(path, `${JSON.stringify(signedRecord(kind, payload))}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
}
export function assertFresh(timestamp, now, minutes) {
  const age = now - Date.parse(timestamp);
  requireSafe(Number.isFinite(age) && age >= 0 && age <= minutes * 60000, "CHECKPOINT_EXPIRED");
}
export function assertConfirmation(answer) { requireSafe(answer === CONFIRMATION, "TYPED_CONFIRMATION_MISMATCH"); }
export async function typedConfirmation() {
  requireSafe(process.stdin.isTTY && process.stdout.isTTY, "INTERACTIVE_TTY_REQUIRED");
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  let answer;
  try { answer = await reader.question(`Type ${CONFIRMATION} before manually starting Google reauthorization: `); }
  finally { reader.close(); }
  assertConfirmation(answer);
}
export async function runCheckpoint(mode, overrides = {}) {
  requireSafe(["--pre", "--approve-manual-reauth", "--post"].includes(mode), "UNKNOWN_ARGUMENT");
  const io = { checkLocalTarget, capture, verifyGoogle, typedConfirmation, readRecord, writeRecord, now: Date.now, log: console.log, ...overrides };
  io.checkLocalTarget();
  if (mode === "--pre") {
    const state = await io.capture();
    const googleCredentialCheck = await verifyPreGoogle(state, io.verifyGoogle);
    const final = await io.capture();
    compareCheckpoint(state.evidence, final.evidence, false);
    io.writeRecord(BASELINE, "baseline", { schema: 1, project: REF, createdAt: new Date(io.now()).toISOString(),
      googleCredentialCheck, evidence: final.evidence });
    io.log(googleCredentialCheck === "EXPECTED_STALE_GOOGLE_GRANT"
      ? "PRE_REAUTH_PASS google_credential=EXPECTED_STALE_GOOGLE_GRANT" : "PRE_REAUTH_PASS");
    return;
  }
  const baseline = io.readRecord(BASELINE, "baseline");
  requireSafe(["REFRESH_SUCCEEDED_EVENT_ABSENT", "EXPECTED_STALE_GOOGLE_GRANT"].includes(baseline.googleCredentialCheck), "BASELINE_GOOGLE_CHECK_INVALID");
  assertFresh(baseline.createdAt, io.now(), 60);
  if (mode === "--approve-manual-reauth") {
    compareCheckpoint(baseline.evidence, (await io.capture()).evidence, false);
    await io.typedConfirmation();
    assertFresh(baseline.createdAt, io.now(), 30);
    const state = await io.capture();
    compareCheckpoint(baseline.evidence, state.evidence, false);
    compareCheckpoint(baseline.evidence, (await io.capture()).evidence, false);
    io.writeRecord(APPROVAL, "approval", { schema: 1, project: REF, baselineHash: digest(baseline), approvedAt: new Date(io.now()).toISOString() });
    io.log(`MANUAL_REAUTH_APPROVED ${MANUAL_URL}`);
    return;
  }
  const approval = io.readRecord(APPROVAL, "approval");
  requireSafe(approval.baselineHash === digest(baseline), "APPROVAL_BASELINE_MISMATCH");
  assertFresh(approval.approvedAt, io.now(), 30);
  const state = await io.capture();
  compareCheckpoint(baseline.evidence, state.evidence, true);
  await io.verifyGoogle(state);
  const final = await io.capture();
  compareCheckpoint(baseline.evidence, final.evidence, true);
  requireSafe(digest(state.evidence) === digest(final.evidence), "POSTCHECK_STATE_CHANGED_DURING_TOKEN_VERIFICATION");
  io.log("POST_REAUTH_PASS");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  (args.length === 1 ? runCheckpoint(args[0]) : Promise.reject(new SafeFailure("UNKNOWN_ARGUMENT"))).catch(error => {
    console.error(`PART18J_REAUTH_STOP code=${error instanceof SafeFailure ? error.message : "UNEXPECTED_FAILURE"}`);
    process.exitCode = 1;
  });
}
