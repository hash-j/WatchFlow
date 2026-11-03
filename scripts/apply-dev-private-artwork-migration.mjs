// Run manually in the operator's credentialed PowerShell. No CLI/Management API,
// password URLs, persisted snapshots, uploads, OAuth, executors or schedule writes.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { loadLocalTestEnvironment } from "../lib/testing/local-environment.mjs";

const ROOT = resolve(import.meta.dirname, "..");
export const REF = "ckwadpmvxieekjlsfcks";
export const VERSION = "202611020001";
export const NAME = "private_profile_and_list_artwork";
export const CORRECTIVE_VERSION = "202611020002";
export const CORRECTIVE_NAME = "fix_private_list_artwork_policies";
export const APPROVAL = "APPROVE_WATCHFLOW_DEV_PRIVATE_ARTWORK_MIGRATION";
const FILE = resolve(ROOT, `supabase/migrations/${VERSION}_${NAME}.sql`);
const PIN = "dd6ba95b7d03a64551161015c08a8b07d237661d60c23186ac417481ec5ae82a";
const CORRECTIVE_PIN = "67b55f3533edc3058880cdeb6e8dce93a44cc1b8a7eb9eaddd9158e80e59547f";
const BUCKET = "watchflow-artwork";
const QSTASH = "https://qstash-eu-central-1.upstash.io/v2/schedules/";
const CALENDAR = "watchflow-dev-part18-ops-unit2d-calendar";
const REMINDER = "watchflow-dev-part18-ops-unit2d-reminders";
const HELPERS = ["watchflow_validate_avatar_reference", "watchflow_owns_artwork_path", "watchflow_owned_artwork_paths", "watchflow_user_owns_list_artwork_path"];
export const POLICY_RULES = [
  ["watchflow_artwork_boundary", "*", false, ["public"], true, true],
  ["watchflow_artwork_list_insert_guard", "a", false, ["authenticated"], false, true],
  ["watchflow_artwork_no_overwrite", "w", false, ["public"], true, true],
  ["watchflow_artwork_select_own", "r", true, ["authenticated"], true, false],
  ["watchflow_artwork_insert_own", "a", true, ["authenticated"], false, true],
  ["watchflow_artwork_delete_own", "d", true, ["authenticated"], true, false],
];
export class SafeFailure extends Error {}
function requireSafe(condition, code) { if (!condition) throw new SafeFailure(code); }
const hash = value => createHash("sha256").update(value).digest("hex");
const canonical = value => JSON.stringify(value, function (_key, item) {
  return item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item;
});
function required(name) {
  const value = process.env[name];
  requireSafe(typeof value === "string" && value.length > 0, `MISSING_${name}`);
  return value;
}
function git(args) {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", timeout: 10000 });
  requireSafe(!r.error && r.status === 0, "GIT_CHECK_FAILED");
  return r.stdout.trim();
}
export function migrationBody(bytes) {
  requireSafe(hash(bytes) === PIN, "MIGRATION_SHA256_MISMATCH");
  const sql = bytes.toString("utf8");
  requireSafe(/^begin;\s/.test(sql) && /\scommit;\s*$/.test(sql), "MIGRATION_TRANSACTION_INVALID");
  return sql.replace(/^begin;\s*/, "").replace(/\scommit;\s*$/, "");
}
export function correctiveMigrationBody(bytes) {
  requireSafe(hash(bytes) === CORRECTIVE_PIN, "CORRECTIVE_MIGRATION_SHA256_MISMATCH");
  const sql = bytes.toString("utf8");
  requireSafe(/^begin;\s/.test(sql) && /\scommit;\s*$/.test(sql), "CORRECTIVE_TRANSACTION_INVALID");
  return sql.replace(/^begin;\s*/, "").replace(/\scommit;\s*$/, "");
}
export function localTarget({ qstash = true } = {}) {
  // Password comes exclusively from the inherited process, before loading files.
  const password = required("SUPABASE_DB_PASSWORD");
  const caPath = required("SUPABASE_DB_CA_CERT_PATH");
  const qstashToken = qstash ? required("QSTASH_TOKEN_EU") : null;
  loadLocalTestEnvironment(process.env, ROOT);
  requireSafe(resolve(git(["rev-parse", "--show-toplevel"])).toLowerCase() === ROOT.toLowerCase(), "WRONG_REPOSITORY");
  requireSafe(git(["branch", "--show-current"]) === "codex/part-18-production-operations", "WRONG_BRANCH");
  requireSafe(required("NEXT_PUBLIC_SUPABASE_URL") === `https://${REF}.supabase.co`, "NOT_WATCHFLOW_DEV");
  const linked = JSON.parse(readFileSync(resolve(ROOT, "supabase/.temp/linked-project.json"), "utf8"));
  requireSafe(readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim() === REF &&
    linked.ref === REF && linked.name === "watchflow-dev", "WRONG_LINKED_PROJECT");
  const url = new URL(readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim());
  requireSafe(url.protocol === "postgresql:" && url.hostname === "aws-1-ap-northeast-2.pooler.supabase.com" &&
    url.port === "5432" && url.username === `postgres.${REF}` && url.pathname === "/postgres" &&
    !url.password && !url.search && !url.hash, "DEV_POOLER_INVALID");
  const ca = readFileSync(resolve(ROOT, caPath), "utf8");
  requireSafe(ca.length < 100000 && ca.includes("-----BEGIN CERTIFICATE-----") && !ca.includes("PRIVATE KEY"), "PG_TLS_CA_INVALID");
  const bytes = readFileSync(FILE);
  const body = migrationBody(bytes);
  const correctiveBody = correctiveMigrationBody(readFileSync(resolve(ROOT, `supabase/migrations/${CORRECTIVE_VERSION}_${CORRECTIVE_NAME}.sql`)));
  const files = readdirSync(resolve(ROOT, "supabase/migrations")).filter(f => f.endsWith(".sql"));
  requireSafe(files.every(f => /^\d{12,14}_[a-z0-9_]+\.sql$/.test(f)), "LOCAL_MIGRATION_FILENAME_INVALID");
  const versions = files.map(f => f.split("_")[0]);
  requireSafe(new Set(versions).size === versions.length && files.includes(`${VERSION}_${NAME}.sql`), "LOCAL_MIGRATION_AMBIGUOUS");
  return { body, correctiveBody, versions, qstashToken, config: { host: url.hostname, port: 5432, database: "postgres",
    user: url.username, password, ssl: { rejectUnauthorized: true, servername: url.hostname, ca },
    sslnegotiation: "postgres", connectionTimeoutMillis: 10000, query_timeout: 60000 } };
}
export function validateLedger(rows, versions, applied, { inspectPendingCorrection = false } = {}) {
  requireSafe(Array.isArray(rows) && rows.every(r => typeof r.version === "string" && /^\d{12,14}$/.test(r.version)), "LEDGER_INVALID");
  const remote = rows.map(r => r.version);
  requireSafe(new Set(remote).size === remote.length, "LEDGER_DUPLICATE");
  requireSafe(remote.every(v => versions.includes(v)), "LEDGER_REMOTE_ONLY_MIGRATION");
  requireSafe(remote.includes(VERSION) === applied, applied ? "TARGET_MIGRATION_NOT_RECORDED" : "TARGET_ALREADY_APPLIED");
  const pending = versions.filter(v => !remote.includes(v));
  requireSafe(applied ? pending.length === 0 || inspectPendingCorrection && pending.length === 1 && pending[0] === CORRECTIVE_VERSION
    : pending.length === 1 && pending[0] === VERSION, "UNEXPECTED_PENDING_MIGRATION");
  if (applied) requireSafe(rows.find(r => r.version === VERSION)?.name === NAME, "TARGET_MIGRATION_NAME_MISMATCH");
  if (remote.includes(CORRECTIVE_VERSION)) requireSafe(rows.find(r => r.version === CORRECTIVE_VERSION)?.name === CORRECTIVE_NAME, "CORRECTIVE_MIGRATION_NAME_MISMATCH");
}
async function ledger(client, versions, applied, options) {
  const { rows } = await client.query("select version, name from supabase_migrations.schema_migrations order by version");
  validateLedger(rows, versions, applied, options);
}
async function identity(client) {
  const { rows: [r] } = await client.query(`select current_database() as db,
    exists(select 1 from public.calendar_connections c join auth.users u on u.id=c.user_id
      where c.id='e652e5c8-f08c-4736-88d8-073bce772ccc' and c.provider='google') as connection_ok,
    exists(select 1 from public.calendar_sync_jobs j join public.calendar_connections c on c.id=j.connection_id
      where j.id='b9eb8a77-0723-675b-3f2b-8503a0781ab8'
      and c.id='e652e5c8-f08c-4736-88d8-073bce772ccc' and j.user_id=c.user_id) as job_ok`);
  requireSafe(r?.db === "postgres" && r.connection_ok === true && r.job_ok === true, "LIVE_DEV_IDENTITY_MISMATCH");
}
async function inspect(client) {
  const { rows: [r] } = await client.query(`select
    (select json_agg(json_build_object('table',table_name,'type',data_type,'nullable',is_nullable))
      from information_schema.columns where table_schema='public' and
      ((table_name='profiles' and column_name='avatar_url') or (table_name='lists' and column_name='thumbnail_path'))) as columns,
    (select coalesce(json_agg(json_build_object('id',id,'name',name,'public',public,
      'limit',file_size_limit,'mime',allowed_mime_types)), '[]'::json)
      from storage.buckets where id='watchflow-artwork' or name='watchflow-artwork') as buckets,
    (select coalesce(json_agg(json_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
      'roles',array(select case when oid=0 then 'public' else pg_get_userbyid(oid)::text end from unnest(p.polroles) as role_oid(oid) order by 1),
      'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))), '[]'::json)
      from pg_policy p where p.polrelid='storage.objects'::regclass and
      (p.polname like 'watchflow_artwork_%' or coalesce(pg_get_expr(p.polqual,p.polrelid),'') like '%watchflow-artwork%'
        or coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'') like '%watchflow-artwork%')) as policies,
    (select coalesce(json_agg(json_build_object('name',p.proname,'args',oidvectortypes(p.proargtypes),
      'result',format_type(p.prorettype,null),'set',p.proretset,'definer',p.prosecdef,'config',p.proconfig,'body',p.prosrc,
      'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),
      'anon',has_function_privilege('anon',p.oid,'EXECUTE'),
      'public',exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where a.grantee=0 and a.privilege_type='EXECUTE'))), '[]'::json) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=any($1::text[])) as helpers,
    (select count(*)::int from pg_trigger where tgrelid='public.profiles'::regclass
      and tgname='watchflow_profiles_avatar_reference' and not tgisinternal) as avatar_triggers,
    (select count(*)::int from pg_constraint where conrelid='public.lists'::regclass
      and conname='lists_thumbnail_owner_path' and contype='c' and convalidated) as list_constraints,
    (select relrowsecurity from pg_class where oid='storage.objects'::regclass) as storage_rls,
    (select relrowsecurity from pg_class where oid='public.profiles'::regclass) as profile_rls,
    (select relrowsecurity from pg_class where oid='public.lists'::regclass) as list_rls`, [HELPERS]);
  return r;
}
export { inspect as inspectArtwork };
export function validateHelperBodies(helpers, body, correctiveBody, { beforeCorrection = false } = {}) {
  for (const name of beforeCorrection ? HELPERS.slice(0, 3) : HELPERS) {
    const source = name === HELPERS[3] ? correctiveBody : body;
    const match = new RegExp(`create function public\\.${name}\\([^]*?as \\$\\$([^]*?)\\$\\$;`).exec(source);
    const fn = helpers.find(f => f.name === name);
    const normalize = value => value.replace(/\r\n/g, "\n").trim();
    requireSafe(match && typeof fn?.body === "string" && hash(normalize(fn.body)) === hash(normalize(match[1])), "ARTWORK_HELPER_BODY_MISMATCH");
  }
}
function policyTree(expression) {
  let text = expression.trim();
  const scan = value => {
    let depth = 0, quoted = false;
    const operators = [], closes = [];
    for (let i = 0; i < value.length; i++) {
      const ch = value[i];
      if (ch === "'") { if (quoted && value[i + 1] === "'") { i++; continue; } quoted = !quoted; continue; }
      if (quoted) continue;
      requireSafe(ch !== '"' && ch !== ";", "ARTWORK_POLICY_EXPRESSION_INVALID");
      if (ch === "(") depth++;
      if (ch === ")") { depth--; if (depth === 0) closes.push(i); }
      requireSafe(depth >= 0, "ARTWORK_POLICY_EXPRESSION_INVALID");
      if (depth === 0 && (i === 0 || !/[\w]/.test(value[i - 1]))) {
        const match = /^(and|or)\b/i.exec(value.slice(i));
        if (match) { operators.push({ at: i, op: match[1].toLowerCase(), length: match[0].length }); i += match[0].length - 1; }
      }
    }
    requireSafe(depth === 0 && !quoted, "ARTWORK_POLICY_EXPRESSION_INVALID");
    return { operators, closes };
  };
  let parsed = scan(text);
  while (text.startsWith("(") && parsed.closes[0] === text.length - 1) {
    text = text.slice(1, -1).trim(); parsed = scan(text);
  }
  const op = parsed.operators.some(item => item.op === "or") ? "or" : "and";
  const splits = parsed.operators.filter(item => item.op === op);
  if (splits.length) {
    const children = []; let from = 0;
    for (const item of [...splits, { at: text.length, length: 0 }]) {
      const child = policyTree(text.slice(from, item.at));
      children.push(...(child.op === op ? child.children : [child])); from = item.at + item.length;
    }
    return { op, children };
  }
  // Preserve literal values. Normalize only PostgreSQL's deparser presentation:
  // qualification, text casts, scalar parentheses and generated SELECT uid alias.
  const leaf = text.split(/('(?:[^']|'')*')/).map((part, i) => i % 2 ? part : part.toLowerCase()
    .replace(/\bas\s+uid\b/g, "").replace(/\b(?:pg_catalog\.|public\.|(?:storage\.)?objects\.)/g, "")
    .replace(/::text\b/g, "").replace(/[\s()]/g, "")).join("");
  requireSafe(leaf.length > 0, "ARTWORK_POLICY_EXPRESSION_INVALID");
  return { leaf };
}
export function validateArtwork(r, after, { beforeCorrection = false } = {}) {
  requireSafe(r && r.storage_rls === true && r.profile_rls === true && r.list_rls === true, "REQUIRED_RLS_NOT_ENABLED");
  const columns = r.columns ?? [];
  requireSafe(columns.filter(c => c.table === "profiles" && c.type === "text" && c.nullable === "YES").length === 1, "AVATAR_FIELD_INVALID");
  if (!after) {
    requireSafe(columns.length === 1 && r.buckets?.length === 0 && r.policies?.length === 0 &&
      r.helpers?.length === 0 && r.avatar_triggers === 0 && r.list_constraints === 0, "ARTWORK_SCHEMA_CONFLICT");
    return;
  }
  requireSafe(columns.length === 2 && columns.some(c => c.table === "lists" && c.type === "text" && c.nullable === "YES"), "THUMBNAIL_FIELD_INVALID");
  const b = r.buckets?.[0];
  requireSafe(r.buckets?.length === 1 && b.id === BUCKET && b.name === BUCKET && b.public === false &&
    Number(b.limit) === 2097152 && canonical(b.mime) === canonical(["image/webp"]), "ARTWORK_BUCKET_INVALID");
  requireSafe(r.policies?.length === 6, "ARTWORK_POLICY_COUNT_INVALID");
  for (const [name, command, permissive, roles, using, check] of POLICY_RULES) {
    const p = r.policies.find(p => p.name === name);
    requireSafe(p && p.command === command && p.permissive === permissive && canonical(p.roles) === canonical(roles) &&
      Boolean(p.using) === using && Boolean(p.check) === check, "ARTWORK_POLICY_CONTRACT_INVALID");
    const expression = `${p.using || ""} ${p.check || ""}`;
    requireSafe(expression.includes(BUCKET), "ARTWORK_POLICY_BUCKET_BOUNDARY_MISSING");
    if (!["watchflow_artwork_no_overwrite", "watchflow_artwork_list_insert_guard"].includes(name)) requireSafe(expression.includes("watchflow_owns_artwork_path"), "ARTWORK_POLICY_OWNER_MISSING");
    if (name.includes("insert")) requireSafe(beforeCorrection ? expression.includes("lists") && expression.includes("auth.uid()")
      : expression.includes("watchflow_user_owns_list_artwork_path"), "ARTWORK_POLICY_LIST_OWNER_MISSING");
    // These simple policies have no subqueries or mixed operator precedence.
    // Ignore only PostgreSQL's expression-rendering parentheses/text casts.
    const compact = sql => sql.replace(/\s+/g, "").replaceAll("public.", "").replaceAll("::text", "").replace(/[()]/g, "").toLowerCase();
    const simple = name === "watchflow_artwork_boundary" ? "bucket_id <> 'watchflow-artwork' or public.watchflow_owns_artwork_path(name)"
      : name === "watchflow_artwork_no_overwrite" ? "bucket_id <> 'watchflow-artwork'"
        : ["watchflow_artwork_select_own", "watchflow_artwork_delete_own"].includes(name)
          ? "bucket_id = 'watchflow-artwork' and public.watchflow_owns_artwork_path(name)" : null;
    if (simple) requireSafe([p.using, p.check].filter(Boolean).every(sql => compact(sql) === compact(simple)), "ARTWORK_POLICY_EXPRESSION_INVALID");
    if (name.includes("insert")) {
      const listOwner = beforeCorrection ? `(pg_catalog.split_part(name, '/', 1) = 'avatars' or exists (
        select 1 from public.lists l where l.id::text = pg_catalog.split_part(l.name, '/', 3)
        and l.user_id = (select auth.uid())))`
        : `(pg_catalog.split_part(name, '/', 1) = 'avatars' or public.watchflow_user_owns_list_artwork_path(name))`;
      const expected = name === "watchflow_artwork_list_insert_guard" ? `bucket_id <> 'watchflow-artwork' or ${listOwner}`
        : `bucket_id = 'watchflow-artwork' and public.watchflow_owns_artwork_path(name) and ${listOwner}`;
      requireSafe(canonical(policyTree(p.check)) === canonical(policyTree(expected)), "ARTWORK_POLICY_EXPRESSION_INVALID");
    }
  }
  const signatures = [[HELPERS[0], "", "trigger", false, false, false], [HELPERS[1], "text", "boolean", false, true, true],
    [HELPERS[2], "", "text", true, true, false], [HELPERS[3], "text", "boolean", false, true, false]];
  const requiredSignatures = beforeCorrection ? signatures.slice(0, 3) : signatures;
  requireSafe(r.helpers?.length === requiredSignatures.length && requiredSignatures.every(([name, args, result, set, authenticated, anon]) =>
    r.helpers.some(f => f.name === name && f.args === args && f.result === result && f.set === set && f.definer === false &&
      f.public === false && f.authenticated === authenticated && f.anon === anon &&
      Array.isArray(f.config) && f.config.length === 1 && ["search_path=", 'search_path=""'].includes(f.config[0]))), "ARTWORK_HELPER_CONTRACT_INVALID");
  requireSafe(r.avatar_triggers === 1 && r.list_constraints === 1, "ARTWORK_REFERENCE_GUARD_INVALID");
}
const quote = value => `"${value.replaceAll('"', '""')}"`;
async function fingerprint(client, includeThumbnail = false, { includeArtworkBucket = false } = {}) {
  const { rows: tables } = await client.query(`select schemaname, tablename from pg_tables
    where schemaname='public' or (schemaname='auth' and tablename='users')
      or (schemaname='storage' and tablename in ('objects','buckets')) order by schemaname,tablename`);
  const result = {};
  for (const t of tables) {
    const key = `${t.schemaname}.${t.tablename}`;
    const row = key === "public.lists" && !includeThumbnail ? "(to_jsonb(t)-'thumbnail_path')" : "to_jsonb(t)";
    const where = key === "storage.buckets" && !includeArtworkBucket ? "where id <> 'watchflow-artwork'" : "";
    const { rows: [data] } = await client.query(`select count(*)::text as count,
      md5(coalesce(string_agg(md5(${row}::text),'' order by md5(${row}::text)),'')) as fingerprint
      from ${quote(t.schemaname)}.${quote(t.tablename)} t ${where}`);
    result[key] = data;
  }
  // Protect existing functions and policies too, without returning their bodies.
  const { rows: [definitions] } = await client.query(`select
    (select md5(coalesce(string_agg(md5(pg_get_functiondef(p.oid)),'' order by p.oid),''))
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      and p.prokind='f' and p.proname<>all($1::text[])) as functions,
    (select md5(coalesce(string_agg(to_jsonb(p)::text,'' order by p.oid),'')) from pg_policy p
      where p.polname not like 'watchflow_artwork_%') as policies`, [HELPERS]);
  return hash(canonical({ data: result, definitions }));
}
export function verifySchedules(calendar, reminder) {
  return hash(canonical(stableSchedules(calendar, reminder)));
}
export function stableSchedules(calendar, reminder, reminderLabels) {
  const contracts = [
    { scheduleId: CALENDAR, destination: "https://watchflow-dev-ops.vercel.app/api/internal/calendar/sync", method: "GET",
      cron: "4-59/5 * * * *", retries: 0, timeout: 55000, isPaused: true, labels: ["watchflow-dev", "part18-ops-unit2d", "calendar"] },
    { scheduleId: REMINDER, destination: "https://watchflow-dev-ops.vercel.app/api/internal/notifications/scheduled-reminders", method: "GET",
      cron: "2-57/5 * * * *", retries: 0, timeout: 55000, isPaused: true },
  ];
  return [calendar, reminder].map((row, index) => {
    const result = {};
    for (const [field, expected] of Object.entries(contracts[index])) {
      const actual = row?.[field];
      const valid = field === "labels" ? Array.isArray(actual) && actual.every(label => typeof label === "string") &&
        canonical([...actual].sort()) === canonical([...expected].sort()) : actual === expected;
      requireSafe(valid, `QSTASH_STABLE_FIELD_INVALID schedule=${index === 0 ? "calendar" : "reminder"} field=${field}`);
      result[field] = field === "labels" ? [...actual].sort() : actual;
    }
    if (index === 1) {
      // Explicit human-approved recovery policy: only AFTER every fixed reminder
      // field passes, use its current GET labels as the baseline, never a guess.
      const labels = row.labels;
      requireSafe(Array.isArray(labels) && labels.every(label => typeof label === "string" && label.length > 0 &&
        label.length <= 128 && !/[\x00-\x1f\x7f]/.test(label)) && new Set(labels).size === labels.length,
      "QSTASH_STABLE_FIELD_INVALID schedule=reminder field=labels");
      if (reminderLabels !== undefined) requireSafe(Array.isArray(reminderLabels) &&
        canonical([...labels].sort()) === canonical([...reminderLabels].sort()), "QSTASH_STABLE_FIELD_INVALID schedule=reminder field=labels");
      result.labels = [...labels].sort();
    }
    // Ignore opaque/volatile metadata, never serialize it or header values.
    return result;
  });
}
export function compareSchedules(before, after, code) {
  requireSafe(Array.isArray(before) && before.length === 2 && Array.isArray(after) && after.length === 2, "QSTASH_COMPARISON_INVALID");
  for (const index of [0, 1]) {
    for (const field of ["scheduleId", "destination", "method", "cron", "retries", "timeout", "isPaused", "labels"]) {
      requireSafe(canonical(before[index][field]) === canonical(after[index][field]),
        `${code} schedule=${index === 0 ? "calendar" : "reminder"} field=${field}`);
    }
  }
}
async function schedules(token) {
  const rows = await Promise.all([CALENDAR, REMINDER].map(async id => {
    const response = await fetch(`${QSTASH}${id}`, { method: "GET", redirect: "error", cache: "no-store",
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    requireSafe(response.ok, response.status === 401 || response.status === 403 ? "QSTASH_AUTH_FAILED" : "QSTASH_READ_FAILED");
    return response.json();
  }));
  return stableSchedules(...rows);
}
async function authenticatedReadSmoke(client, recovery = false) {
  const { rows: [owner] } = await client.query(`select user_id::text as id from public.calendar_connections
    where id='e652e5c8-f08c-4736-88d8-073bce772ccc'`);
  await client.query("savepoint artwork_read_smoke");
  try {
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [owner.id]);
    const { rows: [r] } = await client.query(`select
      exists(select 1 from public.profiles where id=auth.uid()) as profile_ok,
      public.watchflow_owns_artwork_path('avatars/'||auth.uid()::text||'/11111111-1111-4111-8111-111111111111.webp') as own_ok,
      public.watchflow_owns_artwork_path('avatars/00000000-0000-0000-0000-000000000000/11111111-1111-4111-8111-111111111111.webp') as foreign_ok,
      public.watchflow_owns_artwork_path('avatars/'||auth.uid()::text||'/../x.webp') as traversal_ok,
      has_column_privilege('authenticated','public.lists','thumbnail_path','UPDATE') as thumbnail_update_ok,
      (select count(*)::int from public.watchflow_owned_artwork_paths()) as artwork_count`);
    await client.query("select avatar_url from public.profiles where id=auth.uid()");
    await client.query("select thumbnail_path from public.lists where user_id=auth.uid() limit 1");
    requireSafe(r?.profile_ok === true && r.own_ok === true && r.foreign_ok === false && r.traversal_ok === false &&
      r.thumbnail_update_ok === true && Number.isInteger(r.artwork_count) && r.artwork_count >= 0 &&
      (recovery || r.artwork_count === 0), "AUTHENTICATED_ARTWORK_READ_FAILED");
    await client.query("set local role anon");
    await client.query("select set_config('request.jwt.claim.sub','',true)");
    const { rows: [anon] } = await client.query(`select public.watchflow_owns_artwork_path(
      'avatars/11111111-1111-4111-8111-111111111111/11111111-1111-4111-8111-111111111111.webp') as allowed`);
    requireSafe(anon?.allowed === false, "ANONYMOUS_ARTWORK_ACCESS_INVALID");
  } finally { await client.query("rollback to savepoint artwork_read_smoke"); }
}
async function confirm() {
  requireSafe(process.stdin.isTTY && process.stdout.isTTY, "INTERACTIVE_CONFIRMATION_REQUIRED");
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try { return await prompt.question(`Type ${APPROVAL} to apply ONLY the private artwork migration to watchflow-dev: `); }
  finally { prompt.close(); }
}
export function safeCode(error, stage) {
  if (error instanceof SafeFailure) return error.message;
  const code = typeof error?.code === "string" ? error.code : "";
  if (["28P01", "28000"].includes(code)) return "PG_AUTH_FAILED";
  if (["ENOTFOUND", "EAI_AGAIN"].includes(code)) return "PG_DNS_FAILED";
  if (/^(ERR_TLS_|ERR_SSL_)/.test(code) || ["SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "CERT_HAS_EXPIRED"].includes(code)) return "PG_TLS_FAILED";
  if (["ETIMEDOUT", "57014"].includes(code)) return "PG_TIMEOUT";
  const sqlErrors = { "42501": "PG_PERMISSION_DENIED", "42P01": "PG_REQUIRED_RELATION_MISSING", "42703": "PG_REQUIRED_COLUMN_MISSING",
    "42601": "PG_QUERY_SYNTAX_FAILED", "42710": "PG_OBJECT_CONFLICT", "55P03": "PG_LOCK_TIMEOUT" };
  if (Object.hasOwn(sqlErrors, code)) return sqlErrors[code];
  return `ARTWORK_${stage}_FAILED`;
}
async function readIntegrity(client) {
  const { rows: [r] } = await client.query(`select
    (select count(*)::text from public.profiles) as profile_count,
    (select count(*)::text from public.lists) as list_count,
    not exists(select 1 from public.profiles p left join auth.users u on u.id=p.id where u.id is null) as profiles_intact,
    not exists(select 1 from public.lists l left join auth.users u on u.id=l.user_id where u.id is null) as lists_intact,
    not exists(select 1 from public.list_movies lm left join public.lists l on l.id=lm.list_id
      left join public.user_movies um on um.id=lm.user_movie_id
      where l.id is null or um.id is null or um.user_id<>l.user_id) as memberships_intact`);
  requireSafe(r?.profiles_intact === true && r.lists_intact === true && r.memberships_intact === true &&
    /^\d+$/.test(r.profile_count) && /^\d+$/.test(r.list_count), "EXISTING_PROFILE_LIST_INTEGRITY_INVALID");
  return hash(canonical(r));
}
// Shared transports/guards for the separately approved corrective operator.
// Importing this module never invokes its application or recovery dispatch.
export { identity as assertLiveDevIdentity, fingerprint as readDataFingerprint, schedules as readStableSchedules,
  authenticatedReadSmoke as readOwnerArtworkSmoke, readIntegrity as readProfileListIntegrity };
export async function recoverOperator(overrides = {}) {
  // Separate entry point: no prompt, write transaction, ledger insertion, DDL,
  // lock, migration execution, upload, or mutating transport is reachable here.
  const io = { target: localTarget, connect: config => new pg.Client(config), schedules, log: console.log, ...overrides };
  let client;
  let stage = "RECOVERY_CONTEXT";
  try {
    const context = io.target();
    stage = "RECOVERY_DATABASE";
    client = io.connect(context.config);
    client.on("error", () => {});
    await client.connect();
    await client.query("begin isolation level repeatable read read only");
    await client.query("set local statement_timeout='30s'");
    await client.query("set local search_path=''");
    await identity(client);
    await ledger(client, context.versions, true);
    const { rows } = await client.query("select statements from supabase_migrations.schema_migrations where version=$1", [VERSION]);
    requireSafe(rows.length === 1 && Array.isArray(rows[0].statements) && rows[0].statements.length === 1 &&
      rows[0].statements[0] === context.body, "APPLIED_MIGRATION_CONTENT_MISMATCH");
    const artwork = await inspect(client);
    validateArtwork(artwork, true);
    validateHelperBodies(artwork.helpers, context.body, context.correctiveBody);
    const baseline = await fingerprint(client, true);
    const integrity = await readIntegrity(client);
    await authenticatedReadSmoke(client, true);
    await client.query("rollback");
    stage = "RECOVERY_QSTASH";
    const holds = await io.schedules(context.qstashToken);
    compareSchedules(holds, await io.schedules(context.qstashToken), "QSTASH_STABLE_CONFIGURATION_CHANGED_DURING_RECOVERY");
    stage = "RECOVERY_DATABASE_RECHECK";
    await client.query("begin read only");
    await client.query("set local statement_timeout='30s'");
    await client.query("set local search_path=''");
    await identity(client);
    await ledger(client, context.versions, true);
    const finalArtwork = await inspect(client);
    validateArtwork(finalArtwork, true);
    validateHelperBodies(finalArtwork.helpers, context.body, context.correctiveBody);
    requireSafe(await fingerprint(client, true) === baseline && await readIntegrity(client) === integrity, "RECOVERY_DATA_NOT_STABLE");
    await client.query("rollback");
    io.log("ARTWORK_RECOVERY_EVIDENCE original_changed_property=UNKNOWN original_schedule_snapshots_retained=false comparison_scope=stable_contract reminder_labels_baseline=validated_live_get historical_data_baseline_retained=false current_data_stable=true profile_list_integrity=true");
    io.log("ARTWORK_MIGRATION_RECOVERED_PASS migration_applied=true avatar_field_verified=true list_thumbnail_field_verified=true artwork_bucket_exists=true artwork_bucket_private=true policy_count=6 policies_verified=true calendar_schedule_unchanged=true reminder_schedule_unchanged=true calendar_paused=true reminder_paused=true");
  } catch (error) {
    if (client) await client.query("rollback").catch(() => {});
    throw new SafeFailure(`${safeCode(error, stage)} recovery_read_only=true`);
  } finally { if (client) await client.end().catch(() => {}); }
}
export async function inspectPoliciesOperator(overrides = {}) {
  // Diagnostic metadata only. This mode deliberately needs no QStash token.
  const io = { target: () => localTarget({ qstash: false }), connect: config => new pg.Client(config), log: console.log, ...overrides };
  let client;
  try {
    const context = io.target();
    client = io.connect(context.config);
    client.on("error", () => {});
    await client.connect();
    await client.query("begin read only");
    await client.query("set local statement_timeout='30s'");
    await client.query("set local search_path=''");
    await identity(client);
    await ledger(client, context.versions, true, { inspectPendingCorrection: true });
    const { rows } = await client.query(`select policyname as policy_name, schemaname as schema_name,
      tablename as table_name, permissive, cmd as command, roles, qual as using_expression,
      with_check as with_check_expression from pg_catalog.pg_policies
      where schemaname='storage' and tablename='objects' and policyname=any($1::text[]) order by policyname`,
    [POLICY_RULES.map(([name]) => name)]);
    requireSafe(rows.length === 6 && POLICY_RULES.every(([name]) => rows.filter(r => r.policy_name === name).length === 1), "POLICY_METADATA_INCOMPLETE");
    const safe = rows.map(r => ({ policy_name: r.policy_name, schema_name: r.schema_name, table_name: r.table_name,
      command: r.command, roles: r.roles, permissive: r.permissive,
      using_expression: r.using_expression, with_check_expression: r.with_check_expression }));
    requireSafe(JSON.stringify(safe).length < 100000, "POLICY_METADATA_TOO_LARGE");
    await client.query("rollback");
    io.log(JSON.stringify({ target: "watchflow-dev", project_ref: REF, policies: safe }, null, 2));
    io.log("ARTWORK_POLICY_METADATA_READ_PASS read_only=true");
  } catch (error) {
    if (client) await client.query("rollback").catch(() => {});
    throw new SafeFailure(`${safeCode(error, "POLICY_METADATA")} policy_metadata_read_only=true`);
  } finally { if (client) await client.end().catch(() => {}); }
}
export async function runOperator(args, overrides = {}) {
  if (args.length === 1 && args[0] === "--inspect-policies") return inspectPoliciesOperator(overrides);
  if (args.length === 1 && args[0] === "--recover") return recoverOperator(overrides);
  requireSafe(args.length === 0 || args.length === 1 && args[0] === "--precheck-only", "INVALID_ARGUMENTS");
  const io = { target: localTarget, connect: config => new pg.Client(config), schedules, confirm, log: console.log, ...overrides };
  let stage = "CONTEXT";
  let client;
  let committed = false;
  let commitStarted = false;
  try {
    const context = io.target();
    const connect = async () => {
      client = io.connect(context.config);
      client.on("error", () => {}); // Never let an idle transport error print a raw message.
      await client.connect();
    };
    stage = "PRECHECK";
    await connect();
    await client.query("begin read only");
    await client.query("set local statement_timeout='30s'");
    await client.query("set local search_path=''");
    await identity(client);
    await ledger(client, context.versions, false);
    validateArtwork(await inspect(client), false);
    const baseline = await fingerprint(client);
    await client.query("rollback");
    const holds = await io.schedules(context.qstashToken);
    await client.end(); client = null;
    io.log("ARTWORK_PRECHECK_PASS target=watchflow-dev sole_pending=202611020001 conflicts=false real_schedules_paused=true");
    if (args[0] === "--precheck-only") return;
    requireSafe(await io.confirm() === APPROVAL, "APPROVAL_NOT_EXACT_ABORTED");
    stage = "IMMEDIATE_RECHECK";
    // Re-read target/link/hash after any time spent at the human prompt.
    const fresh = io.target();
    requireSafe(fresh.body === context.body && canonical(fresh.versions) === canonical(context.versions), "LOCAL_STATE_CHANGED");
    await connect();
    await client.query("begin");
    await client.query("set local lock_timeout='5s'");
    await client.query("set local statement_timeout='30s'");
    await client.query("set local search_path=''");
    await client.query("lock table supabase_migrations.schema_migrations in exclusive mode");
    await identity(client);
    await ledger(client, context.versions, false);
    validateArtwork(await inspect(client), false);
    requireSafe(await fingerprint(client) === baseline, "EXISTING_DATA_CHANGED_BEFORE_APPLY");
    compareSchedules(holds, await io.schedules(context.qstashToken), "QSTASH_CHANGED_BEFORE_APPLY");
    stage = "APPLY";
    // The pinned file is the only executable migration. Its outer BEGIN/COMMIT
    // are replaced by this transaction so DDL + ledger + postchecks are atomic.
    await client.query(context.body);
    await client.query("insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])",
      [VERSION, NAME, [context.body]]);
    stage = "POSTCHECK";
    await ledger(client, context.versions, true);
    validateArtwork(await inspect(client), true);
    const { rows: [refs] } = await client.query("select count(*)::int as set_count from public.lists where thumbnail_path is not null");
    requireSafe(refs?.set_count === 0, "UNEXPECTED_THUMBNAIL_DATA");
    await authenticatedReadSmoke(client);
    requireSafe(await fingerprint(client) === baseline, "EXISTING_DATA_OR_CONTRACT_CHANGED");
    compareSchedules(holds, await io.schedules(context.qstashToken), "QSTASH_CHANGED_DURING_APPLY");
    stage = "COMMIT";
    commitStarted = true;
    await client.query("commit");
    committed = true;
    stage = "COMMITTED_VERIFICATION";
    await client.query("begin read only");
    await client.query("set local search_path=''");
    await identity(client);
    await ledger(client, context.versions, true);
    validateArtwork(await inspect(client), true);
    requireSafe(await fingerprint(client) === baseline, "EXISTING_DATA_CHANGED_AFTER_COMMIT");
    await client.query("rollback");
    compareSchedules(holds, await io.schedules(context.qstashToken), "QSTASH_CHANGED_AFTER_COMMIT");
    io.log("ARTWORK_DEV_MIGRATION_PASS version=202611020001 bucket_private=true policies=6 existing_data_preserved=true calendar_unchanged=true qstash_unchanged=true uploads_performed=false");
  } catch (error) {
    if (client) await client.query("rollback").catch(() => {});
    const state = committed ? "true" : commitStarted ? "UNKNOWN_DO_NOT_RERUN" : "false";
    throw new SafeFailure(`${safeCode(error, stage)} migration_committed=${state}`);
  } finally { if (client) await client.end().catch(() => {}); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await runOperator(process.argv.slice(2)); }
  catch (error) { console.error(`ARTWORK_STOP code=${safeCode(error, "OPERATOR")}`); process.exitCode = 1; }
}
