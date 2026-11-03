import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { APPROVAL, preservedArtworkFingerprint, runPolicyFix, validateCorrectionLedger } from "../apply-dev-list-artwork-policy-fix.mjs";
import { NAME, VERSION, CORRECTIVE_NAME, CORRECTIVE_VERSION, stableSchedules } from "../apply-dev-private-artwork-migration.mjs";

const versions = ["202610160001", VERSION, CORRECTIVE_VERSION];
const before = [{ version: "202610160001", name: "part_18j_same_subject_reauth" }, { version: VERSION, name: NAME }];
const after = [...before, { version: CORRECTIVE_VERSION, name: CORRECTIVE_NAME }];
function holds() {
  return stableSchedules({ scheduleId: "watchflow-dev-part18-ops-unit2d-calendar", destination: "https://watchflow-dev-ops.vercel.app/api/internal/calendar/sync",
    method: "GET", cron: "4-59/5 * * * *", retries: 0, timeout: 55000, isPaused: true, labels: ["watchflow-dev", "part18-ops-unit2d", "calendar"] },
  { scheduleId: "watchflow-dev-part18-ops-unit2d-reminders", destination: "https://watchflow-dev-ops.vercel.app/api/internal/notifications/scheduled-reminders",
    method: "GET", cron: "2-57/5 * * * *", retries: 0, timeout: 55000, isPaused: true, labels: ["synthetic-existing-label"] });
}
function mock({ approval = APPROVAL, alreadyApplied = false, raceLedger = false, badPost = false, badCommit = false,
  scheduleChangeAt = 0, mutateFileAfterApproval = false } = {}) {
  const calls = [], output = [];
  let applied = alreadyApplied, started = false, clients = 0, reads = 0, targets = 0;
  const context = { config: {}, versions, body: "ORIGINAL_SQL_MUST_NOT_RUN", correctiveBody: "CORRECTIVE_SQL_ONLY", qstashToken: "NEVER_LOG_TOKEN" };
  const io = {
    target: () => ({ ...context, correctiveBody: mutateFileAfterApproval && ++targets > 1 ? "MODIFIED_SQL" : context.correctiveBody }),
    connect: () => {
      const id = ++clients;
      return { on() {}, async connect() {}, async end() {}, async query(sql, values) {
        calls.push({ sql, values });
        if (sql === context.body) throw new Error("ORIGINAL_MIGRATION_EXECUTION_FORBIDDEN");
        if (sql === context.correctiveBody) { applied = true; started = true; return { rows: [] }; }
        if (sql.startsWith("select version, name")) return { rows: raceLedger && id === 2 ? after : applied ? after : before };
        if (sql.startsWith("select statements")) return { rows: [{ statements: [values[0] === VERSION ? context.body : context.correctiveBody] }] };
        if (sql === "commit" && badCommit) throw Object.assign(new Error("RAW_SECRET_ERROR"), { code: "ECONNRESET" });
        return { rows: [] };
      } };
    },
    identity: async () => { calls.push({ sql: "IDENTITY_READ" }); },
    contract: async (_client, _context, isApplied) => { calls.push({ sql: isApplied ? "CORRECTED_CONTRACT_READ" : "LEGACY_CONTRACT_READ" }); return isApplied && badPost ? "CHANGED" : "UNCHANGED_CONTRACT"; },
    data: async () => "DATA_HASH", integrity: async () => "INTEGRITY_HASH",
    schedules: async () => { calls.push({ sql: "SCHEDULE_GET_ONLY" }); const result = holds(); if (++reads === scheduleChangeAt) result[1].labels = ["changed"]; return result; },
    smoke: async () => { calls.push({ sql: "AVATAR_OWNER_READ_ONLY" }); },
    confirm: async () => { calls.push({ sql: "CONFIRM" }); return approval; },
    log: line => output.push(line),
  };
  return { io, calls, output, get started() { return started; } };
}
test("original must be applied, correction must be sole pending; duplicates, remote-only and unrelated pending are rejected", () => {
  validateCorrectionLedger(before, versions, false); validateCorrectionLedger(after, versions, true);
  assert.throws(() => validateCorrectionLedger(before.slice(0, 1), versions, false), /TARGET_MIGRATION_NOT_RECORDED/);
  assert.throws(() => validateCorrectionLedger(after, versions, false), /CORRECTION_ALREADY_APPLIED_DO_NOT_REAPPLY/);
  assert.throws(() => validateCorrectionLedger(before, [...versions, "202611030001"], false), /UNEXPECTED_PENDING_MIGRATION/);
  assert.throws(() => validateCorrectionLedger([...before, before[0]], versions, false), /LEDGER_DUPLICATE/);
  assert.throws(() => validateCorrectionLedger([...before, { version: "202699990001" }], versions, false), /REMOTE_ONLY/);
});
test("precheck-only is read-only, never prompts, applies SQL or records a ledger entry", async () => {
  const m = mock(); await runPolicyFix(["--precheck-only"], m.io);
  assert.equal(m.started, false); assert.ok(!m.calls.some(c => c.sql === "CONFIRM"));
  assert.ok(!m.calls.some(c => /^(insert|create|alter|delete|update|lock|commit)\b/i.test(c.sql)));
  assert.match(m.output[0], /ARTWORK_POLICY_FIX_PRECHECK_PASS/);
});
test("exact confirmation is mandatory; wrong phrase or whitespace aborts without migration", async () => {
  for (const approval of ["", "ABORT", `${APPROVAL} `, ` ${APPROVAL}`, "APPROVE_WATCHFLOW_DEV_PRIVATE_ARTWORK_MIGRATION"]) {
    const m = mock({ approval }); await assert.rejects(runPolicyFix([], m.io), /APPROVAL_NOT_EXACT_ABORTED/); assert.equal(m.started, false);
  }
});
test("only corrective body executes; sole-pending ledger/target repeated after approval; correction ledger + postchecks precede commit", async () => {
  const m = mock(); await runPolicyFix([], m.io);
  const sql = m.calls.map(c => c.sql), apply = sql.indexOf("CORRECTIVE_SQL_ONLY");
  assert.ok(sql.indexOf("CONFIRM") < apply);
  assert.ok(sql.slice(sql.indexOf("CONFIRM"), apply).some(s => s.startsWith("select version, name")));
  assert.ok(sql.slice(0, apply).some(s => s.startsWith("lock table supabase_migrations")));
  assert.ok(!sql.includes("ORIGINAL_SQL_MUST_NOT_RUN"));
  assert.ok(sql[apply + 1].startsWith("insert into supabase_migrations"));
  assert.deepEqual(m.calls[apply + 1].values, [CORRECTIVE_VERSION, CORRECTIVE_NAME, ["CORRECTIVE_SQL_ONLY"]]);
  assert.ok(sql.indexOf("AVATAR_OWNER_READ_ONLY") < sql.indexOf("commit"));
  assert.match(m.output.at(-1), /ARTWORK_POLICY_FIX_DEV_PASS/);
  assert.ok(!m.output.join("\n").includes("NEVER_LOG_TOKEN"));
});
test("already-applied correction and approval-window ledger/file races never start migration", async () => {
  for (const options of [{ alreadyApplied: true }, { raceLedger: true }, { mutateFileAfterApproval: true }]) {
    const m = mock(options); await assert.rejects(runPolicyFix([], m.io)); assert.equal(m.started, false);
  }
});
test("postcheck failure rolls back; no commit or successful output", async () => {
  const m = mock({ badPost: true }); await assert.rejects(runPolicyFix([], m.io), /FIX_UNEXPECTED_DATA_OR_POLICY_CHANGE correction_committed=false/);
  assert.ok(m.calls.some(c => c.sql === "rollback")); assert.ok(!m.calls.some(c => c.sql === "commit"));
  assert.ok(!m.output.some(line => line.includes("DEV_PASS")));
});
test("schedule changes fail before commit or are reported truthfully after commit; never cause schedule mutation", async () => {
  for (const [scheduleChangeAt, committed] of [[3, "false"], [4, "true"]]) {
    const m = mock({ scheduleChangeAt }); await assert.rejects(runPolicyFix([], m.io), error =>
      error.message.includes("schedule=reminder field=labels") && error.message.includes(`correction_committed=${committed}`));
    assert.ok(!m.output.some(line => line.includes("DEV_PASS")));
  }
});
test("uncertain commit fails closed without retrying SQL or exposing raw error", async () => {
  const m = mock({ badCommit: true }); await assert.rejects(runPolicyFix([], m.io), error =>
    error.message.includes("UNKNOWN_DO_NOT_RERUN") && !error.message.includes("RAW_SECRET_ERROR"));
  assert.equal(m.calls.filter(c => c.sql === "CORRECTIVE_SQL_ONLY").length, 1);
});
test("unchanged artwork fingerprint ignores only two intended WITH CHECK edits and the newly added helper", () => {
  const state = { columns: [{ table: "profiles" }, { table: "lists" }], buckets: [{ public: false }],
    helpers: [{ name: "old_helper", body: "EXACT" }], policies: [
      { name: "watchflow_artwork_insert_own", check: "BEFORE", using: null, roles: ["authenticated"] },
      { name: "watchflow_artwork_list_insert_guard", check: "BEFORE", using: null },
      { name: "watchflow_artwork_select_own", using: "EXACT" },
    ] };
  const fixed = structuredClone(state); fixed.helpers.push({ name: "watchflow_user_owns_list_artwork_path" });
  fixed.policies[0].check = fixed.policies[1].check = "AFTER";
  assert.equal(preservedArtworkFingerprint(state), preservedArtworkFingerprint(fixed));
  for (const mutate of [s => s.buckets[0].public = true, s => s.policies[2].using = "BROKEN",
    s => s.policies[0].roles = ["public"], s => s.helpers[0].body = "BROKEN"]) {
    const broken = structuredClone(fixed); mutate(broken);
    assert.notEqual(preservedArtworkFingerprint(state), preservedArtworkFingerprint(broken));
  }
});
test("invalid CLI arguments abort before credentials or transports", async () => {
  const m = mock(); await assert.rejects(runPolicyFix(["--yes"], m.io), /INVALID_ARGUMENTS/); assert.equal(m.calls.length, 0);
});
test("source reuses strict verified TLS + direct PG guards, has no broad migration or mutating HTTP transport", () => {
  const src = readFileSync(new URL("../apply-dev-list-artwork-policy-fix.mjs", import.meta.url), "utf8");
  assert.match(src, /target: localTarget/); assert.match(src, /new pg\.Client/); assert.match(src, /readStableSchedules/);
  assert.match(src, /await client\.query\(context\.correctiveBody\)/);
  assert.doesNotMatch(src, /await client\.query\(context\.body\)|db push|migration up|writeFileSync|method: "(?:POST|PATCH|PUT|DELETE)"/);
});
