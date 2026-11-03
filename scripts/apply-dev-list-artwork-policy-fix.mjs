// Prepared for the human's existing credentialed PowerShell. Never auto-run.
import { createHash } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { CORRECTIVE_NAME, CORRECTIVE_VERSION, VERSION, SafeFailure, localTarget, validateLedger,
  inspectArtwork, validateArtwork, validateHelperBodies, assertLiveDevIdentity, readDataFingerprint,
  readStableSchedules, readOwnerArtworkSmoke, readProfileListIntegrity, compareSchedules, safeCode } from "./apply-dev-private-artwork-migration.mjs";

export const APPROVAL = "APPROVE_WATCHFLOW_DEV_LIST_ARTWORK_POLICY_FIX";
function requireSafe(condition, code) { if (!condition) throw new SafeFailure(code); }
const canonical = value => JSON.stringify(value, function (_key, item) {
  return item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item;
});
const hash = value => createHash("sha256").update(canonical(value)).digest("hex");
const changedPolicies = ["watchflow_artwork_insert_own", "watchflow_artwork_list_insert_guard"];
export function preservedArtworkFingerprint(state) {
  return hash({ ...state,
    helpers: state.helpers.filter(f => f.name !== "watchflow_user_owns_list_artwork_path").sort((a, b) => a.name.localeCompare(b.name)),
    policies: state.policies.map(p => changedPolicies.includes(p.name) ? { ...p, check: "EXPECTED_CORRECTION" } : p)
      .sort((a, b) => a.name.localeCompare(b.name)),
    columns: [...state.columns].sort((a, b) => a.table.localeCompare(b.table)),
  });
}
export function validateCorrectionLedger(rows, versions, applied) {
  requireSafe(versions.includes(VERSION) && versions.includes(CORRECTIVE_VERSION), "REQUIRED_LOCAL_MIGRATION_MISSING");
  validateLedger(rows, versions, true, { inspectPendingCorrection: !applied });
  requireSafe(rows.some(row => row.version === CORRECTIVE_VERSION) === applied,
    applied ? "CORRECTION_NOT_RECORDED" : "CORRECTION_ALREADY_APPLIED_DO_NOT_REAPPLY");
}
async function checkLedger(client, context, applied) {
  const { rows } = await client.query("select version, name from supabase_migrations.schema_migrations order by version");
  validateCorrectionLedger(rows, context.versions, applied);
  const original = await client.query("select statements from supabase_migrations.schema_migrations where version=$1", [VERSION]);
  requireSafe(original.rows.length === 1 && canonical(original.rows[0].statements) === canonical([context.body]), "ORIGINAL_APPLIED_SQL_MISMATCH");
  if (applied) {
    const fixed = await client.query("select statements from supabase_migrations.schema_migrations where version=$1", [CORRECTIVE_VERSION]);
    requireSafe(fixed.rows.length === 1 && canonical(fixed.rows[0].statements) === canonical([context.correctiveBody]), "CORRECTIVE_APPLIED_SQL_MISMATCH");
  }
}
async function inspectContract(client, context, applied) {
  const state = await inspectArtwork(client);
  // The legacy defect is accepted only as this operator's explicitly known
  // PRE-correction state; --recover continues to reject it unconditionally.
  validateArtwork(state, true, { beforeCorrection: !applied });
  validateHelperBodies(state.helpers, context.body, context.correctiveBody, { beforeCorrection: !applied });
  return preservedArtworkFingerprint(state);
}
async function confirm() {
  requireSafe(process.stdin.isTTY && process.stdout.isTTY, "INTERACTIVE_CONFIRMATION_REQUIRED");
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try { return await prompt.question(`Type ${APPROVAL} to apply ONLY 202611020002 to watchflow-dev: `); }
  finally { prompt.close(); }
}
export async function runPolicyFix(args, overrides = {}) {
  requireSafe(args.length === 0 || args.length === 1 && args[0] === "--precheck-only", "INVALID_ARGUMENTS");
  const io = { target: localTarget, connect: config => new pg.Client(config), schedules: readStableSchedules,
    identity: assertLiveDevIdentity, data: client => readDataFingerprint(client, true, { includeArtworkBucket: true }),
    integrity: readProfileListIntegrity, contract: inspectContract, smoke: readOwnerArtworkSmoke, confirm, log: console.log, ...overrides };
  let client, stage = "FIX_CONTEXT", commitStarted = false, committed = false;
  try {
    const context = io.target(); // Both immutable SQL hashes + branch/dev link/TLS pinned here.
    const connect = async () => {
      client = io.connect(context.config); client.on("error", () => {}); await client.connect();
    };
    const beginRead = async () => {
      await client.query("begin read only"); await client.query("set local search_path=''");
      await client.query("set local statement_timeout='30s'");
    };
    const capture = async applied => {
      await io.identity(client);
      await checkLedger(client, context, applied);
      return { contract: await io.contract(client, context, applied), data: await io.data(client), integrity: await io.integrity(client) };
    };
    stage = "FIX_PRECHECK";
    await connect(); await beginRead();
    const baseline = await capture(false);
    await client.query("rollback"); await client.end(); client = null;
    const holds = await io.schedules(context.qstashToken);
    io.log("ARTWORK_POLICY_FIX_PRECHECK_PASS target=watchflow-dev original_applied=true sole_pending=202611020002 bucket_private=true real_schedules_paused=true");
    if (args[0] === "--precheck-only") return;
    requireSafe(await io.confirm() === APPROVAL, "APPROVAL_NOT_EXACT_ABORTED");
    stage = "FIX_IMMEDIATE_RECHECK";
    const fresh = io.target();
    requireSafe(fresh.body === context.body && fresh.correctiveBody === context.correctiveBody &&
      canonical(fresh.versions) === canonical(context.versions), "LOCAL_STATE_CHANGED_AFTER_APPROVAL");
    await connect(); await client.query("begin");
    await client.query("set local search_path=''");
    await client.query("set local lock_timeout='5s'"); await client.query("set local statement_timeout='30s'");
    await client.query("lock table supabase_migrations.schema_migrations in exclusive mode");
    requireSafe(canonical(await capture(false)) === canonical(baseline), "FIX_PRE_APPLY_STATE_CHANGED");
    compareSchedules(holds, await io.schedules(context.qstashToken), "FIX_QSTASH_CHANGED_BEFORE_APPLY");
    stage = "FIX_APPLY";
    // Execute only the pinned correction body, never the original migration.
    // Replace its outer BEGIN/COMMIT so ledger + postchecks share this transaction.
    await client.query(context.correctiveBody);
    await client.query("insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])",
      [CORRECTIVE_VERSION, CORRECTIVE_NAME, [context.correctiveBody]]);
    stage = "FIX_POSTCHECK";
    requireSafe(canonical(await capture(true)) === canonical(baseline), "FIX_UNEXPECTED_DATA_OR_POLICY_CHANGE");
    await io.smoke(client, true); // Read-only avatar/owner/anonymous checks; no fixture writes.
    compareSchedules(holds, await io.schedules(context.qstashToken), "FIX_QSTASH_CHANGED_BEFORE_COMMIT");
    stage = "FIX_COMMIT"; commitStarted = true;
    await client.query("commit"); committed = true;
    stage = "FIX_COMMITTED_POSTCHECK";
    await beginRead();
    requireSafe(canonical(await capture(true)) === canonical(baseline), "FIX_COMMITTED_STATE_CHANGED");
    await client.query("rollback");
    compareSchedules(holds, await io.schedules(context.qstashToken), "FIX_QSTASH_CHANGED_AFTER_COMMIT");
    io.log("ARTWORK_POLICY_FIX_DEV_PASS migration_applied=202611020002 original_migration_unchanged=true helper_verified=true policy_count=6 policies_verified=true avatar_unchanged=true bucket_private=true existing_data_preserved=true calendar_paused=true reminder_paused=true schedules_unchanged=true uploads_performed=false");
  } catch (error) {
    if (client) await client.query("rollback").catch(() => {});
    throw new SafeFailure(`${safeCode(error, stage)} correction_committed=${committed ? "true" : commitStarted ? "UNKNOWN_DO_NOT_RERUN" : "false"}`);
  } finally { if (client) await client.end().catch(() => {}); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await runPolicyFix(process.argv.slice(2)); }
  catch (error) { console.error(`ARTWORK_POLICY_FIX_STOP code=${safeCode(error, "FIX_OPERATOR")}`); process.exitCode = 1; }
}
