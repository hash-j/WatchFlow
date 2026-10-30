// PREPARED ONLY. Run only after separate approval. Applies one pinned migration
// to watchflow-dev, then runs disposable-fixture integration tests. Never runs
// A1/A2, OAuth reauthorization, a scheduler, or a calendar executor.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { loadLocalTestEnvironment } from "../lib/testing/local-environment.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const DEV_REF = "ckwadpmvxieekjlsfcks";
const PRODUCTION_REF = "pupzjbtjxtswslagxrbk";
const BRANCH = "codex/part-18-production-operations";
const VERSION = "202610160001";
const NAME = "part_18j_same_subject_reauth";
const MIGRATION = resolve(ROOT, "supabase/migrations", `${VERSION}_${NAME}.sql`);
const MIGRATION_SHA256 = "ab177e4c2d224f990b3176d1dbc8c23b0dbb1c664fee097511f0d5df259b5109";
const PREVIOUS_FUNCTION_SHA256 = "7d49ba5fdeb02f48c17658aa14b32c4301957d8a1d41b49cda1a1060021bc210";
const ROLLBACK_SNAPSHOT = resolve(ROOT, "supabase/.temp/part18j-reauth-previous-function.sql");
const CONFIRMATION = "APPROVE_WATCHFLOW_DEV_SAME_SUBJECT_REAUTH_MIGRATION";
const CONNECTION_ID = "e652e5c8-f08c-4736-88d8-073bce772ccc";
const JOB_ID = "b9eb8a77-0723-675b-3f2b-8503a0781ab8";
const USER_MOVIE_ID = "9152882e-291a-47a2-b964-c1a4a6dd9630";
const SOURCE_KEY = "589038a338f409210b819e6a7e0e871c";
const SOURCE_VERSION = "8ca7b4e9cabaac13bdda45d0089f3169";
const QSTASH = "https://qstash-eu-central-1.upstash.io/v2";
const CALENDAR_SCHEDULE = "watchflow-dev-part18-ops-unit2d-calendar";
const REMINDER_SCHEDULE = "watchflow-dev-part18-ops-unit2d-reminders";
const ACTIONABLE = ["pending", "retryable", "leased"];

class SafeFailure extends Error {}
function requireSafe(condition, code) {
  if (!condition) throw new SafeFailure(code);
}
function requiredEnv(name) {
  const value = process.env[name]?.trim();
  requireSafe(Boolean(value), `MISSING_${name}`);
  return value;
}
function runReadOnlyCommand(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", timeout: 15000 });
  requireSafe(!result.error && result.status === 0, "LOCAL_COMMAND_FAILED");
  return result.stdout.trim();
}
function resolveCli() {
  let path = process.env.SUPABASE_CLI_PATH?.trim() || "supabase";
  if (process.platform === "win32") {
    if (path === "supabase") {
      const found = runReadOnlyCommand("where.exe", ["supabase"]).split(/\r?\n/);
      path = found.find(candidate => /\.(cmd|exe)$/i.test(candidate)) || "";
    }
    requireSafe(isAbsolute(path) && existsSync(path), "SUPABASE_CLI_NOT_FOUND");
    if (basename(path).toLowerCase() === "supabase.cmd") {
      // Node cannot safely spawn a .cmd with shell:false on Windows. Execute
      // the installed package's JS entry point with node, without a shell.
      const entry = resolve(dirname(path), "../supabase/dist/supabase.js");
      requireSafe(existsSync(entry), "SUPABASE_CLI_ENTRY_MISSING");
      return { command: process.execPath, prefix: [entry] };
    }
    requireSafe(basename(path).toLowerCase() === "supabase.exe", "SUPABASE_CLI_PATH_INVALID");
  }
  return { command: path, prefix: [] };
}
function runCli(cli, args, timeout = 15000) {
  return spawnSync(cli.command, [...cli.prefix, ...args], {
    cwd: ROOT, env: { ...process.env, DO_NOT_TRACK: "1" },
    encoding: "utf8", timeout,
  });
}
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function checkLocalTarget() {
  loadLocalTestEnvironment(process.env, ROOT);
  requireSafe(resolve(runReadOnlyCommand("git", ["rev-parse", "--show-toplevel"])).toLowerCase() === ROOT.toLowerCase(), "WRONG_REPOSITORY");
  requireSafe(runReadOnlyCommand("git", ["branch", "--show-current"]) === BRANCH, "WRONG_BRANCH");
  const origin = new URL(requiredEnv("NEXT_PUBLIC_SUPABASE_URL")).origin;
  requireSafe(origin === `https://${DEV_REF}.supabase.co`, "WRONG_SUPABASE_ORIGIN");
  requireSafe(origin !== `https://${PRODUCTION_REF}.supabase.co`, "PRODUCTION_TARGET_REJECTED");
  requireSafe(new URL(requiredEnv("E2E_EXPECTED_SUPABASE_URL")).origin === origin, "EXPECTED_ORIGIN_MISMATCH");
  requireSafe(process.env.E2E_EXPECTED_SUPABASE_PROJECT_REF === DEV_REF && process.env.E2E_TARGET_ENV === "development", "WRONG_E2E_TARGET");
  requireSafe(readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim() === DEV_REF, "WRONG_LINKED_PROJECT");
  requireSafe(JSON.parse(readFileSync(resolve(ROOT, "supabase/.temp/linked-project.json"), "utf8")).ref === DEV_REF, "WRONG_LINKED_PROJECT");
  requireSafe(sha256(readFileSync(MIGRATION)) === MIGRATION_SHA256, "MIGRATION_FILE_CHANGED");
  requireSafe(Boolean(requiredEnv("SUPABASE_DB_PASSWORD")), "DB_PASSWORD_MISSING");
  const cli = resolveCli();
  const version = runCli(cli, ["--version"]);
  requireSafe(!version.error && version.status === 0 && version.stdout.trim() === "2.121.0", "SUPABASE_CLI_VERSION_MISMATCH");
  return { origin, cli };
}
async function jsonGet(url, token, code, headers = {}) {
  const response = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${token}`, ...headers }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  requireSafe(response.ok, code);
  return response.json();
}
function parseMigrationList(output) {
  requireSafe(typeof output === "string" && !/[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]/.test(output), "LEDGER_OUTPUT_INVALID");
  const lines = output.trim().split(/\r?\n/);
  requireSafe(lines.length >= 3 && /^\s*LOCAL\s*[|│]\s*REMOTE\s*[|│]\s*TIME \(UTC\)\s*$/i.test(lines[0]), "LEDGER_HEADER_NOT_FOUND");
  requireSafe(/^\s*[-─]+\s*[+┼|│]\s*[-─]+\s*[+┼|│]\s*[-─]+\s*$/.test(lines[1]), "LEDGER_SEPARATOR_INVALID");
  const rows = [];
  const localVersions = new Set();
  const remoteVersions = new Set();
  function requireRow(condition, code, rowIndex) {
    requireSafe(condition, `${code} row_index=${rowIndex}`);
  }
  function normalizeCell(cell, column, rowIndex) {
    const trimmed = cell.trim();
    if (!trimmed.includes("`")) return trimmed;
    const wrapped = /^`([^`]*)`$/.exec(trimmed);
    requireRow(Boolean(wrapped), `LEDGER_${column}_CELL_UNPARSEABLE`, rowIndex);
    return wrapped[1].replace(/^ +| +$/g, "");
  }
  function sanitizedRowShape(rowIndex) {
    const line = lines[rowIndex + 2];
    if (line === undefined) return "";
    const cells = line.split(/[|│]/);
    if (cells.length !== 3) return "";
    const observed = cells.map((cell, index) => {
      const trimmed = cell.trim();
      const exactWrapper = /^`([^`]*)`$/.exec(trimmed);
      const wrapper = trimmed === "``" && index === 1 ? "empty-backticks"
        : exactWrapper ? "single-backtick"
          : trimmed.includes("`") ? "other" : "none";
      const normalized = exactWrapper ? exactWrapper[1].replace(/^ +| +$/g, "") : trimmed;
      return { wrapper, normalized };
    });
    const [local, remote, time] = observed;
    const numeric = value => /^\d{12,14}$/.test(value);
    const unexpectedCodepoints = [...new Set([...remote.normalized]
      .filter(character => !/[0-9]/.test(character))
      .map(character => character.codePointAt(0)))].join(",") || "none";
    return [
      `row_index=${rowIndex}`,
      `local=${local.normalized ? "present" : "blank"}`,
      `remote=${remote.normalized ? "present" : "blank"}`,
      `time=${time.normalized ? "present" : "blank"}`,
      `local_wrapper=${local.wrapper}`,
      `remote_wrapper=${remote.wrapper}`,
      `time_wrapper=${time.wrapper}`,
      `local_length=${[...local.normalized].length}`,
      `remote_length=${[...remote.normalized].length}`,
      `time_length=${[...time.normalized].length}`,
      `local_numeric=${numeric(local.normalized)}`,
      `remote_numeric=${numeric(remote.normalized)}`,
      `time_numeric=${numeric(time.normalized)}`,
      `remote_unexpected_codepoints=${unexpectedCodepoints}`,
    ].join(" ");
  }
  for (const [rowIndex, line] of lines.slice(2).entries()) {
    const columns = line.split(/[|│]/);
    requireRow(columns.length === 3, "LEDGER_ROW_UNPARSEABLE", rowIndex);
    const [local, remote, time] = columns.map((cell, columnIndex) =>
      normalizeCell(cell, ["LOCAL", "REMOTE", "TIME"][columnIndex], rowIndex));
    requireRow(!local || /^\d{12,14}$/.test(local), "LEDGER_LOCAL_VERSION_INVALID", rowIndex);
    const remoteValid = !remote || /^\d{12,14}$/.test(remote);
    if (!remoteValid && rowIndex === 27) {
      const adjacent = [26, 27, 28].map(sanitizedRowShape).filter(Boolean).join("; ");
      throw new SafeFailure(`LEDGER_REMOTE_VERSION_INVALID row_index=27 ${adjacent}`);
    }
    requireRow(remoteValid, "LEDGER_REMOTE_VERSION_INVALID", rowIndex);
    requireRow(Boolean(local || remote), "LEDGER_ROW_UNPARSEABLE", rowIndex);
    if (local === VERSION) requireRow(time === VERSION, "LEDGER_PART18J_TIME_MISMATCH", rowIndex);
    requireRow(/^\d{12,14}$/.test(time) && time === (local || remote), "LEDGER_TIME_INVALID", rowIndex);
    requireRow(!local || !localVersions.has(local), "LEDGER_DUPLICATE_LOCAL", rowIndex);
    requireRow(!remote || !remoteVersions.has(remote), "LEDGER_DUPLICATE_REMOTE", rowIndex);
    if (local) localVersions.add(local);
    if (remote) remoteVersions.add(remote);
    rows.push({ local, remote });
  }
  return rows;
}
function validateLedgerOutput(output, migrationFiles, expectedApplied) {
  const rows = parseMigrationList(output);
  requireSafe(migrationFiles.every(file => /^\d+_.*\.sql$/.test(file)), "LEDGER_REPOSITORY_VERSION_INVALID");
  const local = migrationFiles
    .map(file => ({ version: file.split("_")[0], name: file.replace(/^\d+_/, "").replace(/\.sql$/, "") }));
  requireSafe(new Set(local.map(row => row.version)).size === local.length, "LEDGER_REPOSITORY_VERSION_DUPLICATE");
  requireSafe(local.filter(row => row.version === VERSION && row.name === NAME).length === 1, "LEDGER_PART18J_LOCAL_MISSING");
  requireSafe(rows.every(row => Boolean(row.local)), "LEDGER_REMOTE_ONLY_VERSION");
  requireSafe(rows.every(row => local.some(item => item.version === row.local)), "LEDGER_UNEXPECTED_ROW");
  const targetRows = rows.filter(row => row.local === VERSION);
  requireSafe(targetRows.length === 1, "LEDGER_PART18J_LOCAL_MISSING");
  for (const item of local) {
    const row = rows.find(entry => entry.local === item.version);
    requireSafe(Boolean(row), "LEDGER_REPOSITORY_VERSION_MISSING");
    if (item.version !== VERSION) {
      requireSafe(Boolean(row.remote), "LEDGER_OTHER_PENDING_MIGRATION");
      requireSafe(row.remote === item.version, "LEDGER_LOCAL_REMOTE_MISMATCH");
    }
  }
  requireSafe(rows.length === local.length, "LEDGER_ROW_COUNT_MISMATCH");
  requireSafe(
    targetRows[0].remote === (expectedApplied ? VERSION : ""),
    expectedApplied ? "LEDGER_PART18J_REMOTE_MISSING_OR_MISMATCHED" : "LEDGER_PART18J_REMOTE_NOT_BLANK",
  );
  return true;
}
function readLedger(cli, expectedApplied) {
  // CLI 2.121.0 may emit an agent JSON envelope when stdout is piped.
  // Require its human-readable table so every Local/Remote cell is checked.
  const result = runCli(cli, ["migration", "list", "--project-ref", DEV_REF, "--agent", "no", "--output-format", "text"], 60000);
  requireSafe(!result.error && result.status === 0, "LEDGER_COMMAND_FAILED");
  const migrationFiles = readdirSync(resolve(ROOT, "supabase/migrations"))
    .filter(file => file.endsWith(".sql"));
  return validateLedgerOutput(result.stdout, migrationFiles, expectedApplied);
}
function testLedgerFixtureOffline() {
  const fixture = readFileSync(resolve(ROOT, "scripts/fixtures/part18j-cli-2.121-migration-list.txt"), "utf8");
  const files = [
    "202609300005_part_18j_d_disconnect_reconciliation.sql",
    `${VERSION}_${NAME}.sql`,
  ];
  function expectLedger(label, output, expectedError = null) {
    let error = null;
    try {
      validateLedgerOutput(output, files, false);
    } catch (caught) {
      error = caught instanceof SafeFailure ? caught.message.split(" ")[0] : "UNEXPECTED_FAILURE";
    }
    requireSafe(error === expectedError, `LEDGER_FIXTURE_${label}_FAILED`);
  }
  expectLedger("SPACE_REMOTE", fixture);
  expectLedger("MULTIPLE_SPACES", fixture.replace("| ` `", "| `   `"));
  expectLedger("OTHER_PENDING", fixture.replace("`202609300005`   | `202609300005`", "`202609300005`   | `   `"), "LEDGER_OTHER_PENDING_MIGRATION");
  expectLedger("NUMERIC_PADDING", fixture.replaceAll("`202609300005`", "` 202609300005 `").replaceAll("`202610160001`", "` 202610160001 `"));
  expectLedger("INTERNAL_SPACE", fixture.replace("`202610160001`", "`202610 160001`"), "LEDGER_LOCAL_VERSION_INVALID");
  expectLedger("CONTROL_TAB", fixture.replace("` `", "` \t `"), "LEDGER_OUTPUT_INVALID");
  console.log("LEDGER_FIXTURE_PASS cases=6");
}
const FUNCTION_METADATA_SQL = `select pg_catalog.pg_get_function_identity_arguments(p.oid) as args,
  pg_catalog.format_type(p.prorettype, null) as result_type,
  p.prosecdef as security_definer,
  p.proconfig as settings,
  pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute,
  pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  exists (select 1 from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
    where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_execute,
  pg_catalog.pg_get_functiondef(p.oid) as definition
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'watchflow_upsert_google_calendar_connection'`;
function assertDevLink() {
  const linked = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
  const linkedInfo = JSON.parse(readFileSync(resolve(ROOT, "supabase/.temp/linked-project.json"), "utf8"));
  requireSafe(linked === DEV_REF && linkedInfo.ref === DEV_REF, "WRONG_LINKED_PROJECT");
}
function directDevDatabase() {
  assertDevLink();
  let pooler;
  try {
    pooler = new URL(readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim());
  } catch {
    throw new SafeFailure("DEV_POOLER_INVALID");
  }
  requireSafe(
    pooler.protocol === "postgresql:" &&
      pooler.hostname === "aws-1-ap-northeast-2.pooler.supabase.com" &&
      pooler.port === "5432" &&
      pooler.username === `postgres.${DEV_REF}` &&
      pooler.pathname === "/postgres" &&
      !pooler.password && !pooler.search && !pooler.hash,
    "DEV_POOLER_INVALID",
  );
  return { host: pooler.hostname, port: Number(pooler.port), user: pooler.username };
}
function parseFunctionMetadataOutput(output) {
  requireSafe(output && typeof output === "object" && !Array.isArray(output) &&
    JSON.stringify(output).length < 1_000_000 &&
    output.identity && typeof output.identity === "object" && !Array.isArray(output.identity) &&
    Array.isArray(output.functions), "PG_RESULT_INVALID");
  return output;
}
function metadataTls(host) {
  const ssl = { rejectUnauthorized: true, servername: host };
  const caPath = process.env.SUPABASE_DB_CA_CERT_PATH?.trim();
  if (caPath) {
    let ca;
    try {
      ca = readFileSync(resolve(ROOT, caPath), "utf8");
    } catch {
      throw new SafeFailure("PG_TLS_CA_INVALID");
    }
    requireSafe(ca.length < 100_000 && ca.includes("-----BEGIN CERTIFICATE-----") &&
      !ca.includes("PRIVATE KEY"), "PG_TLS_CA_INVALID");
    ssl.ca = ca;
  }
  return ssl;
}
function classifyPgFailure(error, stage) {
  const code = typeof error?.code === "string" ? error.code : "";
  let classification;
  if (["ENOTFOUND", "EAI_AGAIN", "EAI_NONAME"].includes(code)) classification = "PG_DNS_FAILED";
  else if (["ETIMEDOUT", "CONNECT_TIMEOUT"].includes(code) ||
    /^(?:timeout expired|Connection terminated due to connection timeout|Query read timeout)$/i.test(error?.message || "")) {
    classification = stage === "connect" ? "PG_CONNECT_TIMEOUT" : "PG_QUERY_TIMEOUT";
  } else if (["28P01", "28000"].includes(code)) classification = "PG_AUTH_FAILED";
  else if (code === "3D000") classification = "PG_DATABASE_NOT_FOUND";
  else if (/^(?:ERR_TLS_|ERR_SSL_)/.test(code) ||
    ["SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      "UNABLE_TO_GET_ISSUER_CERT", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "CERT_HAS_EXPIRED", "CERT_NOT_YET_VALID"].includes(code)) {
    classification = "PG_TLS_FAILED";
  } else if (stage === "function") classification = "PG_FUNCTION_QUERY_FAILED";
  else if (stage === "transaction" || stage === "rollback") classification = "PG_READ_ONLY_TRANSACTION_FAILED";
  else classification = "PG_OTHER_SAFE_FAILURE";
  const safeSqlstate = ["28P01", "28000", "3D000", "42501", "42883", "42601", "57014"].includes(code) ? ` pg_code=${code}` : "";
  return new SafeFailure(`${classification}${safeSqlstate}`);
}
async function readFunction(_cli, after, inspectOnly = false) {
  const database = directDevDatabase();
  const password = process.env.SUPABASE_DB_PASSWORD;
  requireSafe(typeof password === "string" && password.length > 0, "MISSING_SUPABASE_DB_PASSWORD");
  const identitySql = `select pg_catalog.current_database() as database_name,
    (select pg_catalog.count(*) from public.calendar_connections
      where id = '${CONNECTION_ID}' and provider = 'google') as qa_connection_count,
    (select pg_catalog.count(*) from public.calendar_sync_jobs
      where id = '${JOB_ID}' and connection_id = '${CONNECTION_ID}') as qa_job_count,
    (select pg_catalog.count(*) from supabase_migrations.schema_migrations
      where version = '${VERSION}') as target_migration_count`;
  const sql = `select pg_catalog.row_to_json(bundle) as metadata
    from (select
      (select pg_catalog.row_to_json(identity_row) from (${identitySql}) identity_row) as identity,
      (select coalesce(pg_catalog.json_agg(pg_catalog.row_to_json(function_row)), '[]'::json)
        from (${FUNCTION_METADATA_SQL}) function_row) as functions) bundle`;
  const client = new pg.Client({ host: database.host, port: database.port, user: database.user,
    database: "postgres", password, ssl: metadataTls(database.host), sslnegotiation: "postgres",
    connectionTimeoutMillis: 10000, query_timeout: 20000 });
  let result;
  let stage = "connect";
  let idleError;
  client.on("error", error => { idleError = error; });
  try {
    await client.connect();
    stage = "transaction";
    await client.query("BEGIN READ ONLY");
    stage = "function";
    result = await client.query(sql);
    stage = "rollback";
    await client.query("ROLLBACK");
    if (idleError) throw idleError;
  } catch (error) {
    throw classifyPgFailure(error, stage);
  } finally {
    await client.end().catch(() => {});
  }
  requireSafe(Array.isArray(result?.rows) && result.rows.length === 1 &&
    Array.isArray(result.fields) && result.fields.length === 1 && result.fields[0].name === "metadata", "PG_RESULT_INVALID");
  const payload = parseFunctionMetadataOutput(result.rows[0].metadata);
  requireSafe(
    payload.identity?.database_name === "postgres" &&
      payload.identity.qa_connection_count === 1 &&
      payload.identity.qa_job_count === 1 &&
      (inspectOnly && after === null
        ? [0, 1].includes(payload.identity.target_migration_count)
        : payload.identity.target_migration_count === (after ? 1 : 0)),
    "DATABASE_IDENTITY_MISMATCH",
  );
  const rows = payload.functions;
  requireSafe(Array.isArray(rows) && rows.length === 1, "FUNCTION_OVERLOAD_OR_MISSING");
  const row = rows[0];
  requireSafe(row.args === "p_user_id uuid, p_provider_subject text, p_display_email text, p_granted_scopes text[], p_refresh_token_ciphertext bytea, p_refresh_token_nonce bytea, p_refresh_token_auth_tag bytea, p_encryption_key_version smallint", "FUNCTION_SIGNATURE_MISMATCH");
  requireSafe(row.result_type === "uuid" && row.security_definer === true, "FUNCTION_SECURITY_MISMATCH");
  requireSafe(Array.isArray(row.settings) && row.settings.length === 1 &&
    ["search_path=", 'search_path=""'].includes(row.settings[0]), "FUNCTION_SEARCH_PATH_MISMATCH");
  requireSafe(row.service_execute === true && row.anon_execute === false && row.authenticated_execute === false && row.public_execute === false, "FUNCTION_GRANTS_MISMATCH");
  requireSafe(typeof row.definition === "string" && row.definition.length > 100, "FUNCTION_DEFINITION_MISSING");
  if (after && !inspectOnly) {
    const definition = row.definition.toLowerCase();
    requireSafe(/p_provider_subject is null\s+or\s+p_provider_subject = ''/.test(definition), "SUBJECT_REJECTION_MISSING");
    requireSafe(/v_connection\.status = 'connected'/.test(definition) && /v_connection\.provider_subject is distinct from p_provider_subject/.test(definition), "CONNECTED_SUBJECT_GUARD_MISSING");
    const disconnect = definition.split("v_connection.status = 'disconnect_pending' then")[1]?.split("elsif v_connection.status = 'connected' then")[0];
    requireSafe(Boolean(disconnect) && /v_connection\.provider_subject is distinct from p_provider_subject/.test(disconnect), "DISCONNECT_GUARD_MISSING");
    const connected = definition.split("elsif v_connection.status = 'connected' then")[1]?.split("elsif v_connection.status = 'reconnect_required' then")[0];
    requireSafe(Boolean(connected) && !/sync_enabled\s*=/.test(connected), "CONNECTED_SYNC_PRESERVATION_MISSING");
  }
  return row.definition;
}
function one(result, code) {
  requireSafe(!result.error && result.data?.length === 1, code);
  return result.data[0];
}
function query(result, code) {
  requireSafe(!result.error, code);
  return result;
}
async function readFixture(admin) {
  const connection = one(await admin.from("calendar_connections").select("*").eq("id", CONNECTION_ID), "CONNECTION_INVALID");
  requireSafe(connection.id === CONNECTION_ID && connection.provider === "google" && connection.status === "connected" && connection.sync_enabled === false && connection.provider_calendar_id === "primary" && Boolean(connection.provider_subject), "CONNECTION_STATE_MISMATCH");
  const owner = await admin.auth.admin.getUserById(connection.user_id);
  requireSafe(!owner.error && owner.data.user?.email?.toLowerCase() === requiredEnv("E2E_USER_A_EMAIL").toLowerCase(), "QA_OWNER_IDENTITY_MISMATCH");
  const credential = one(await admin.from("calendar_credentials").select("*").eq("connection_id", CONNECTION_ID), "CREDENTIAL_INVALID");
  const job = one(await admin.from("calendar_sync_jobs").select("*").eq("id", JOB_ID), "JOB_INVALID");
  requireSafe(job.id === JOB_ID && job.user_id === connection.user_id && job.connection_id === CONNECTION_ID && job.user_movie_id === USER_MOVIE_ID && job.state === "pending" && job.attempt_count === 0 && job.lease_token === null && job.lease_expires_at === null && job.desired_operation === "upsert" && job.source_key === SOURCE_KEY && job.source_version === SOURCE_VERSION, "JOB_STATE_MISMATCH");
  const jobs = query(await admin.from("calendar_sync_jobs").select("id").eq("connection_id", CONNECTION_ID), "CONNECTION_JOBS_READ_FAILED");
  requireSafe(jobs.data.length === 1 && jobs.data[0].id === JOB_ID, "EXTRA_CONNECTION_JOB");
  const mapping = query(await admin.from("calendar_event_mappings").select("id").eq("connection_id", CONNECTION_ID).eq("source_key", SOURCE_KEY), "MAPPING_READ_FAILED");
  requireSafe(mapping.data.length === 0, "MAPPING_PRESENT");
  const unrelated = query(await admin.from("calendar_sync_jobs").select("id", { count: "exact", head: true }).in("state", ACTIONABLE).neq("id", JOB_ID), "UNRELATED_WORK_READ_FAILED");
  requireSafe(unrelated.count === 0, "UNRELATED_ACTIONABLE_WORK_PRESENT");
  const cleanup = query(await admin.from("calendar_sync_jobs").select("id", { count: "exact", head: true }).eq("connection_id", CONNECTION_ID).eq("desired_operation", "connection_cleanup").in("state", ACTIONABLE), "CLEANUP_READ_FAILED");
  requireSafe(cleanup.count === 0, "ACTIONABLE_CLEANUP_PRESENT");
  return sha256(JSON.stringify({ connection, credential, job, jobs: jobs.data }));
}
async function checkExternalHolds(qstashToken, githubToken) {
  for (const id of [CALENDAR_SCHEDULE, REMINDER_SCHEDULE]) {
    const schedule = await jsonGet(`${QSTASH}/schedules/${id}`, qstashToken, "QSTASH_READ_FAILED");
    requireSafe(schedule.scheduleId === id && schedule.isPaused === true, "QSTASH_NOT_PAUSED");
  }
  for (const name of ["WATCHFLOW_DEV_REMINDER_SCHEDULER_ENABLED", "WATCHFLOW_DEV_CALENDAR_SCHEDULER_ENABLED"]) {
    const variable = await jsonGet(`https://api.github.com/repos/hash-j/WatchFlow/actions/variables/${name}`, githubToken, "GITHUB_GATE_READ_FAILED", { Accept: "application/vnd.github+json" });
    requireSafe(variable.name === name && variable.value === "false", "GITHUB_GATE_NOT_FALSE");
  }
}
async function confirmation() {
  requireSafe(process.stdin.isTTY && process.stdout.isTTY, "INTERACTIVE_TTY_REQUIRED");
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await reader.question(`Type ${CONFIRMATION} to apply the dev migration: `);
    requireSafe(answer === CONFIRMATION, "TYPED_CONFIRMATION_MISMATCH");
  } finally { reader.close(); }
}
function prepareRollbackSnapshot(previousDefinition) {
  const snapshot = `${previousDefinition}\n`;
  if (existsSync(ROLLBACK_SNAPSHOT)) {
    requireSafe(sha256(readFileSync(ROLLBACK_SNAPSHOT)) === sha256(snapshot), "ROLLBACK_SNAPSHOT_MISMATCH");
    return;
  }
  writeFileSync(ROLLBACK_SNAPSHOT, snapshot, { encoding: "utf8", mode: 0o600, flag: "wx" });
}
function migrationCommandEvidence(result) {
  const exitCode = Number.isInteger(result.status) ? result.status : "NONE";
  const started = Number.isInteger(result.pid) && result.pid > 0;
  let classification;
  const output = `${result.stderr || ""}\n${result.stdout || ""}`;
  if (result.error?.code === "ETIMEDOUT") classification = "CLI_TIMEOUT";
  else if (!started) classification = "CLI_START_FAILED";
  else if (!result.error && result.status === 0) classification = "CLI_SUCCESS";
  else if (/unknown (?:flag|option)|unrecognized (?:flag|option)/i.test(output)) classification = "CLI_ARGUMENT_REJECTED";
  else if (/password authentication failed|\b28P01\b/i.test(output)) classification = "CLI_AUTH_FAILED";
  else if (/certificate|TLS handshake|SSL error/i.test(output)) classification = "CLI_TLS_FAILED";
  else if (/connection refused|no such host|ENOTFOUND|could not connect/i.test(output)) classification = "CLI_CONNECTION_FAILED";
  else classification = "CLI_NONZERO_EXIT";
  return `apply_exit_code=${exitCode} cli_classification=${classification} application_command_started=${started}`;
}
function runPinnedMigration(cli) {
  // Repeat target/hash/link guards, then require the sole pending migration
  // immediately before applying to that existing linked development project.
  checkLocalTarget();
  readLedger(cli, false);
  return runCli(cli, ["migration", "up", "--linked"], 120000);
}
async function migrationFailureState(cli, previousHash, evidence) {
  let applied = null;
  let functionHash = null;
  try {
    readLedger(cli, false);
    applied = false;
  } catch {
    try {
      readLedger(cli, true);
      applied = true;
    } catch { /* Unreadable or inconsistent ledger remains ambiguous. */ }
  }
  // Read independently even if the ledger could not be established. Inspection
  // retains identity/security checks but permits fingerprinting a body whose
  // new reauthorization contract failed. It never authorizes application.
  try {
    functionHash = sha256(await readFunction(cli, applied, true));
  } catch { /* Unreadable or unsafe function metadata remains ambiguous. */ }
  let state = "MIGRATION_APPLY_STATE_AMBIGUOUS";
  if (applied === false && functionHash === previousHash) state = "MIGRATION_APPLY_FAILED_UNCHANGED";
  else if (applied === true && functionHash !== null && functionHash !== previousHash) {
    state = "MIGRATION_APPLY_SUCCEEDED_POSTCHECK_FAILED";
  }
  return new SafeFailure(`${state} ${evidence}`);
}
async function main() {
  const args = process.argv.slice(2);
  requireSafe(args.length === 0 || (args.length === 1 && ["--precheck-only", "--ledger-fixture-test"].includes(args[0])), "UNKNOWN_ARGUMENT");
  if (args[0] === "--ledger-fixture-test") {
    testLedgerFixtureOffline();
    return;
  }
  const precheckOnly = args[0] === "--precheck-only";
  const { origin, cli } = checkLocalTarget();
  const qstashToken = requiredEnv("QSTASH_TOKEN_EU");
  const githubToken = requiredEnv("GH_TOKEN");
  const admin = createClient(origin, requiredEnv("SUPABASE_SECRET_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  readLedger(cli, false);
  const previousDefinition = await readFunction(cli, false);
  const previousHash = sha256(previousDefinition);
  requireSafe(previousHash === PREVIOUS_FUNCTION_SHA256, "PREVIOUS_FUNCTION_FINGERPRINT_MISMATCH");
  const fixtureHash = await readFixture(admin);
  await checkExternalHolds(qstashToken, githubToken);
  if (precheckOnly) {
    console.log(`PART18J_PRECHECK_PASS previous_function_sha256=${previousHash}`);
    return;
  }
  prepareRollbackSnapshot(previousDefinition);
  console.log(`PRECHECK_PASS previous_function_sha256=${previousHash} rollback_snapshot=LOCAL_ONLY`);
  await confirmation();
  // Recheck all mutable guards immediately before the one approved DB operation.
  checkLocalTarget();
  readLedger(cli, false);
  requireSafe(sha256(await readFunction(cli, false)) === previousHash, "FUNCTION_CHANGED_BEFORE_APPLY");
  requireSafe(await readFixture(admin) === fixtureHash, "FIXTURE_CHANGED_BEFORE_APPLY");
  await checkExternalHolds(qstashToken, githubToken);
  const apply = runPinnedMigration(cli);
  const evidence = migrationCommandEvidence(apply);
  if (apply.error || apply.status !== 0) throw await migrationFailureState(cli, previousHash, evidence);
  try {
    readLedger(cli, true);
    requireSafe(sha256(await readFunction(cli, true)) !== PREVIOUS_FUNCTION_SHA256, "POSTCHECK_FUNCTION_UNCHANGED");
    requireSafe(await readFixture(admin) === fixtureHash, "POSTCHECK_FIXTURE_CHANGED");
    await checkExternalHolds(qstashToken, githubToken);
    console.log("MIGRATION_POSTCHECK_PASS");
    const vitest = resolve(ROOT, "node_modules/vitest/vitest.mjs");
    requireSafe(existsSync(vitest), "VITEST_NOT_INSTALLED");
    const test = spawnSync(process.execPath, [vitest, "run", "--config", "vitest.integration.config.ts", "integration/part18j-same-subject-reauth.integration.test.ts"], {
      cwd: ROOT, env: { ...process.env, RUN_PART18J_REAUTH_INTEGRATION_TESTS: "true" }, encoding: "utf8", timeout: 180000,
    });
    requireSafe(!test.error && test.status === 0 && /9 passed/.test(test.stdout), "INTEGRATION_TESTS_FAILED");
    requireSafe(await readFixture(admin) === fixtureHash, "POSTTEST_FIXTURE_CHANGED");
    await checkExternalHolds(qstashToken, githubToken);
  } catch {
    throw await migrationFailureState(cli, previousHash, evidence);
  }
  console.log("PART18J_DEV_MIGRATION_AND_NINE_TESTS_PASS");
}

main().catch(error => {
  console.error(`PART18J_STOP code=${error instanceof SafeFailure ? error.message : "UNEXPECTED_FAILURE"}`);
  process.exitCode = 1;
});
