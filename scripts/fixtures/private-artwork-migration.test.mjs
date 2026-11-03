import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { APPROVAL, NAME, POLICY_RULES, SafeFailure, VERSION, CORRECTIVE_VERSION, CORRECTIVE_NAME, correctiveMigrationBody, migrationBody, runOperator, safeCode,
  validateArtwork, validateHelperBodies, validateLedger, stableSchedules, compareSchedules } from "../apply-dev-private-artwork-migration.mjs";

const clone = value => JSON.parse(JSON.stringify(value));
const columns = [{ table: "profiles", type: "text", nullable: "YES" }];
const actualBody = migrationBody(readFileSync(new URL("../../supabase/migrations/202611020001_private_profile_and_list_artwork.sql", import.meta.url)));
const actualCorrectiveBody = correctiveMigrationBody(readFileSync(new URL("../../supabase/migrations/202611020002_fix_private_list_artwork_policies.sql", import.meta.url)));
function artwork(after = false) {
  return { storage_rls: true, profile_rls: true, list_rls: true,
    columns: after ? [...columns, { table: "lists", type: "text", nullable: "YES" }] : columns,
    buckets: after ? [{ id: "watchflow-artwork", name: "watchflow-artwork", public: false, limit: 2097152, mime: ["image/webp"] }] : [],
    policies: after ? POLICY_RULES.map(([name, command, permissive, roles, using, check]) => {
      const expression = name === "watchflow_artwork_boundary" ? "((bucket_id <> 'watchflow-artwork'::text) OR public.watchflow_owns_artwork_path(name))"
        : name === "watchflow_artwork_no_overwrite" ? "(bucket_id <> 'watchflow-artwork'::text)"
          : ["watchflow_artwork_select_own", "watchflow_artwork_delete_own"].includes(name)
            ? "((bucket_id = 'watchflow-artwork'::text) AND public.watchflow_owns_artwork_path(name))"
            : `${name === "watchflow_artwork_list_insert_guard" ? "bucket_id <> 'watchflow-artwork'::text OR"
              : "bucket_id = 'watchflow-artwork'::text AND public.watchflow_owns_artwork_path(name) AND"}
              ((split_part(name, '/'::text, 1) = 'avatars'::text) OR public.watchflow_user_owns_list_artwork_path(name))`;
      return { name, command, permissive, roles, using: using ? expression : null, check: check ? expression : null };
    }) : [],
    helpers: after ? [
      ["watchflow_validate_avatar_reference", "", "trigger", false, false, false],
      ["watchflow_owns_artwork_path", "text", "boolean", false, true, true],
      ["watchflow_owned_artwork_paths", "", "text", true, true, false],
      ["watchflow_user_owns_list_artwork_path", "text", "boolean", false, true, false],
    ].map(([name, args, result, set, authenticated, anon]) => ({ name, args, result, set, authenticated, anon,
      body: new RegExp(`create function public\\.${name}\\([^]*?as \\$\\$([^]*?)\\$\\$;`).exec(name === "watchflow_user_owns_list_artwork_path" ? actualCorrectiveBody : actualBody)[1],
      public: false, definer: false, config: ['search_path=""'] })) : [],
    avatar_triggers: after ? 1 : 0, list_constraints: after ? 1 : 0 };
}
const previous = "202610160001";
const versions = [previous, VERSION];
const beforeLedger = [{ version: previous, name: "part_18j_same_subject_reauth" }];
const afterLedger = [...beforeLedger, { version: VERSION, name: NAME }];
function mockIO({ approval = APPROVAL, failPost = false, failCommit = false, badLedger = false, changedData = false,
  raceLedger = false, schedulesChangedAt = 0, alreadyApplied = false, corruptStatements = false, badIntegrity = false } = {}) {
  const calls = [], output = [];
  let applied = alreadyApplied, appliedAtAll = false, clients = 0, scheduleReads = 0;
  const context = { config: {}, versions: alreadyApplied ? [...versions, CORRECTIVE_VERSION] : versions,
    body: alreadyApplied ? actualBody : "PINNED_BODY", correctiveBody: actualCorrectiveBody, qstashToken: "NEVER_LOG_TEST_TOKEN" };
  const io = {
    target: () => context,
    log: line => output.push(line),
    confirm: async () => { calls.push("CONFIRM"); return approval; },
    schedules: async () => {
      calls.push("QSTASH_GET_ONLY"); const { calendar, reminder } = scheduleFixture();
      if (++scheduleReads === schedulesChangedAt) reminder.labels = ["CHANGED"];
      return stableSchedules(calendar, reminder);
    },
    connect: () => {
      const clientId = ++clients;
      return { on() {}, async connect() {}, async end() {}, async query(sql) {
        calls.push(sql);
        if (sql === "PINNED_BODY") { applied = true; appliedAtAll = true; return { rows: [] }; }
        if (sql === "commit" && failCommit) throw Object.assign(new Error("secret raw database error"), { code: "ECONNRESET" });
        if (sql === "rollback" && clientId === 2 && applied) applied = false;
        if (sql.startsWith("select current_database")) return { rows: [{ db: "postgres", connection_ok: true, job_ok: true }] };
        if (sql.startsWith("select version, name")) return { rows: badLedger || raceLedger && clientId === 2 ? [] : applied
          ? alreadyApplied ? [...afterLedger, { version: CORRECTIVE_VERSION, name: CORRECTIVE_NAME }] : afterLedger : beforeLedger };
        if (sql.startsWith("select statements")) return { rows: [{ statements: [corruptStatements ? "WRONG_BODY" : context.body] }] };
        if (sql.includes("as storage_rls")) { const data = artwork(applied); if (applied && failPost) data.buckets[0].public = true; return { rows: [data] }; }
        if (sql.includes("from pg_tables")) return { rows: [] };
        if (sql.includes("as functions")) return { rows: [{ functions: changedData && applied ? "CHANGED" : "SAME", policies: "SAME" }] };
        if (sql.includes("as set_count")) return { rows: [{ set_count: 0 }] };
        if (sql.startsWith("select user_id::text")) return { rows: [{ id: "11111111-1111-4111-8111-111111111111" }] };
        if (sql.includes("as profile_ok")) return { rows: [{ profile_ok: true, own_ok: true, foreign_ok: false, traversal_ok: false, thumbnail_update_ok: true, artwork_count: 0 }] };
        if (sql.includes("as allowed")) return { rows: [{ allowed: false }] };
        if (sql.includes("as profiles_intact")) return { rows: [{ profile_count: "4", list_count: "2", profiles_intact: !badIntegrity, lists_intact: true, memberships_intact: true }] };
        return { rows: [] };
      } };
    },
  };
  return { io, calls, output, get appliedAtAll() { return appliedAtAll; } };
}
test("pinned file is exactly the reviewed migration, with transaction wrapper removed only", () => {
  const bytes = readFileSync(new URL("../../supabase/migrations/202611020001_private_profile_and_list_artwork.sql", import.meta.url));
  const body = migrationBody(bytes);
  assert.match(body, /^do \$\$/);
  assert.match(body, /create policy watchflow_artwork_delete_own/);
  assert.doesNotMatch(body, /^begin;|commit;\s*$/);
  assert.throws(() => migrationBody(Buffer.concat([bytes, Buffer.from("--changed")])), /MIGRATION_SHA256_MISMATCH/);
});
test("ledger permits only the target pending and rejects remote-only, duplicates, missing predecessors, already-applied", () => {
  validateLedger(beforeLedger, versions, false);
  validateLedger(afterLedger, versions, true);
  assert.throws(() => validateLedger([], versions, false), /UNEXPECTED_PENDING/);
  assert.throws(() => validateLedger([...beforeLedger, { version: "202699990001" }], versions, false), /REMOTE_ONLY/);
  assert.throws(() => validateLedger([...beforeLedger, ...beforeLedger], versions, false), /DUPLICATE/);
  assert.throws(() => validateLedger(afterLedger, versions, false), /ALREADY_APPLIED/);
  assert.throws(() => validateLedger([{ version: "not-a-version" }], versions, false), /LEDGER_INVALID/);
});
test("conflicts fail closed and only an empty artwork setup is accepted", () => {
  validateArtwork(artwork(), false);
  const conflict = artwork(); conflict.buckets.push({ id: "watchflow-artwork" });
  assert.throws(() => validateArtwork(conflict, false), /ARTWORK_SCHEMA_CONFLICT/);
});
test("postcheck verifies private bucket, exactly six policy contracts, RLS, helper grants and path guards", () => {
  validateArtwork(artwork(true), true);
  const emptySetting = artwork(true); emptySetting.helpers.forEach(f => f.config = ["search_path="]);
  validateArtwork(emptySetting, true);
  for (const mutate of [r => r.buckets[0].public = true, r => r.policies.pop(),
    r => r.policies[0].permissive = true, r => r.policies[3].roles = ["public"], r => r.policies[3].using += " OR true",
    r => r.policies[1].check += " OR true", r => r.policies[4].check = r.policies[4].check.replace("AND public.", "OR public."),
    r => r.policies[4].check = r.policies[4].check.replace("watchflow-artwork", "wrong-bucket"),
    r => r.policies[4].check = "(" + r.policies[4].check,
    r => r.helpers[2].public = true, r => r.helpers[1].definer = true, r => r.storage_rls = false,
    r => r.avatar_triggers = 0]) {
    const r = clone(artwork(true)); mutate(r); assert.throws(() => validateArtwork(r, true), SafeFailure);
  }
});
const testReminderLabels = ["watchflow-dev", "part18-ops-unit2d", "synthetic-reminder-label"];
function scheduleFixture() {
  const calendar = { scheduleId: "watchflow-dev-part18-ops-unit2d-calendar", isPaused: true, cron: "4-59/5 * * * *",
    destination: "https://watchflow-dev-ops.vercel.app/api/internal/calendar/sync", method: "GET", retries: 0, timeout: 55000,
    labels: ["watchflow-dev", "part18-ops-unit2d", "calendar"] };
  const reminder = { scheduleId: "watchflow-dev-part18-ops-unit2d-reminders", isPaused: true, method: "GET", cron: "2-57/5 * * * *", retries: 0, timeout: 55000,
    labels: [...testReminderLabels],
    destination: "https://watchflow-dev-ops.vercel.app/api/internal/notifications/scheduled-reminders" };
  return { calendar, reminder };
}
test("real calendar acceptance and reminder pause required without changing schedules", () => {
  const { calendar, reminder } = scheduleFixture();
  assert.equal(stableSchedules(calendar, reminder, testReminderLabels).length, 2);
  assert.throws(() => stableSchedules({ ...calendar, isPaused: false }, reminder, testReminderLabels), /schedule=calendar field=isPaused/);
  assert.throws(() => stableSchedules(calendar, { ...reminder, isPaused: false }, testReminderLabels), /schedule=reminder field=isPaused/);
});
test("volatile metadata, redaction presentation and label order do not alter stable schedule evidence", () => {
  const { calendar, reminder } = scheduleFixture();
  const expected = stableSchedules(calendar, reminder, testReminderLabels);
  const actual = stableSchedules({ ...calendar, updatedAt: 99, internalMetadata: { changed: true }, headers: { Authorization: "DO_NOT_PRINT" },
    labels: [...calendar.labels].reverse() }, { ...reminder, nextExecutionTime: 999 }, testReminderLabels);
  assert.deepEqual(actual, expected);
  assert.ok(!JSON.stringify(actual).includes("DO_NOT_PRINT"));
});
test("every stable field fails closed with only the schedule and field names", () => {
  for (const which of ["calendar", "reminder"]) {
    for (const field of ["scheduleId", "destination", "method", "cron", "retries", "timeout", "isPaused", "labels"]) {
      const rows = scheduleFixture(); rows[which][field] = field === "labels" ? ["wrong"] : "WRONG_SECRET_VALUE";
      assert.throws(() => stableSchedules(rows.calendar, rows.reminder, testReminderLabels), error =>
        error.message === `QSTASH_STABLE_FIELD_INVALID schedule=${which} field=${field}`);
    }
  }
});
test("the approved live-label policy validates fixed fields first and rejects malformed or duplicate labels", () => {
  const { calendar, reminder } = scheduleFixture();
  assert.deepEqual(stableSchedules(calendar, reminder)[1].labels, [...testReminderLabels].sort());
  assert.throws(() => stableSchedules(calendar, { ...reminder, cron: "wrong", labels: null }), /field=cron/);
  assert.throws(() => stableSchedules(calendar, { ...reminder, labels: null }), /field=labels/);
  assert.throws(() => stableSchedules(calendar, { ...reminder, labels: ["x", "x"] }), /field=labels/);
  assert.throws(() => stableSchedules(calendar, { ...reminder, labels: ["x\nsecret"] }), /field=labels/);
  assert.throws(() => stableSchedules({ ...calendar, labels: [...calendar.labels, "calendar"] }, reminder, testReminderLabels), /field=labels/);
  const before = stableSchedules(calendar, reminder);
  assert.throws(() => compareSchedules(before, stableSchedules(calendar, { ...reminder, labels: ["changed"] }), "SAFE_CHANGE"),
    error => error.message === "SAFE_CHANGE schedule=reminder field=labels");
});
test("helper source must equal the pinned migration, not just a matching signature and grants", () => {
  const r = artwork(true); validateHelperBodies(r.helpers, actualBody, actualCorrectiveBody);
  r.helpers[1].body = "select true;";
  assert.throws(() => validateHelperBodies(r.helpers, actualBody, actualCorrectiveBody), /ARTWORK_HELPER_BODY_MISMATCH/);
  for (const mutate of [source => source.replace("l.user_id = (select auth.uid())", "true"),
    source => source.replace("public.watchflow_owns_artwork_path($1)", "true"),
    source => source.replace("split_part($1, '/', 3)", "split_part(l.name, '/', 3)")]) {
    const bad = artwork(true); bad.helpers[3].body = mutate(bad.helpers[3].body);
    assert.throws(() => validateHelperBodies(bad.helpers, actualBody, actualCorrectiveBody), /ARTWORK_HELPER_BODY_MISMATCH/);
  }
});
test("reported live l.name binding defect is rejected, while corrected PostgreSQL-deparsed helper calls pass", () => {
  validateArtwork(artwork(true), true);
  for (const index of [1, 4]) {
    const bad = artwork(true);
    bad.policies[index].check = bad.policies[index].check.replace("public.watchflow_user_owns_list_artwork_path(name)",
      "EXISTS (SELECT 1 FROM public.lists l WHERE l.id::text=split_part(l.name,'/'::text,3) AND l.user_id=(SELECT auth.uid() AS uid))");
    assert.throws(() => validateArtwork(bad, true), /ARTWORK_POLICY_LIST_OWNER_MISSING/);
  }
});
test("legacy defect is accepted ONLY as a correction precondition and remains rejected by recovery", () => {
  const legacy = artwork(true); legacy.helpers.pop();
  for (const index of [1, 4]) legacy.policies[index].check = legacy.policies[index].check.replace("public.watchflow_user_owns_list_artwork_path(name)",
    "EXISTS (SELECT 1 FROM public.lists l WHERE l.id::text=split_part(l.name,'/'::text,3) AND l.user_id=(SELECT auth.uid() AS uid))");
  validateArtwork(legacy, true, { beforeCorrection: true });
  validateHelperBodies(legacy.helpers, actualBody, actualCorrectiveBody, { beforeCorrection: true });
  assert.throws(() => validateArtwork(legacy, true), /ARTWORK_POLICY_LIST_OWNER_MISSING/);
  legacy.policies[1].check += " OR true";
  assert.throws(() => validateArtwork(legacy, true, { beforeCorrection: true }), /ARTWORK_POLICY_EXPRESSION_INVALID/);
});
test("pending correction is inspectable read-only but never accepted as recovered or eligible for original application", () => {
  const all = [...versions, CORRECTIVE_VERSION];
  assert.throws(() => validateLedger(afterLedger, all, true), /UNEXPECTED_PENDING_MIGRATION/);
  validateLedger(afterLedger, all, true, { inspectPendingCorrection: true });
  assert.throws(() => validateLedger(beforeLedger, all, false), /UNEXPECTED_PENDING_MIGRATION/);
});
test("recover goes through production dispatch into read-only queries only, with no prompt or apply", async () => {
  const mock = mockIO({ alreadyApplied: true }); await runOperator(["--recover"], mock.io);
  assert.equal(mock.appliedAtAll, false); assert.ok(!mock.calls.includes("CONFIRM"));
  assert.ok(mock.calls.includes("begin isolation level repeatable read read only"));
  assert.ok(!mock.calls.some(sql => /^(insert|update|delete|create|alter|lock|commit)\b/i.test(sql)));
  assert.ok(mock.calls.some(sql => sql.startsWith("select statements")));
  assert.match(mock.output.join("\n"), /ARTWORK_MIGRATION_RECOVERED_PASS migration_applied=true/);
  assert.match(mock.output.join("\n"), /original_changed_property=UNKNOWN/);
  assert.ok(!mock.output.join("\n").includes("NEVER_LOG_TEST_TOKEN"));
});
test("policy metadata inspection prints only the six allowed policy fields and performs no network calls or writes", async () => {
  const mock = mockIO({ alreadyApplied: true });
  const connect = mock.io.connect;
  mock.io.connect = (...args) => {
    const client = connect(...args), query = client.query;
    client.query = async (...params) => params[0].includes("from pg_catalog.pg_policies") ? { rows: artwork(true).policies.map(p => ({
      policy_name: p.name, schema_name: "storage", table_name: "objects", command: "METADATA_COMMAND", roles: p.roles,
      permissive: p.permissive ? "PERMISSIVE" : "RESTRICTIVE", using_expression: p.using, with_check_expression: p.check,
      unexpected_secret: "MUST_NOT_PRINT",
    })) } : query(...params);
    return client;
  };
  await runOperator(["--inspect-policies"], mock.io);
  assert.ok(!mock.calls.includes("CONFIRM") && !mock.calls.includes("QSTASH_GET_ONLY"));
  assert.ok(!mock.calls.some(sql => /^(insert|update|delete|create|alter|lock|commit)\b/i.test(sql)));
  const evidence = JSON.parse(mock.output[0]);
  assert.equal(evidence.policies.length, 6);
  assert.ok(!mock.output.join("\n").includes("MUST_NOT_PRINT"));
  assert.match(mock.output.at(-1), /ARTWORK_POLICY_METADATA_READ_PASS/);
});
test("recover rejects missing/incorrect ledger content and data integrity, without reaching mutation", async () => {
  for (const options of [{ alreadyApplied: false }, { alreadyApplied: true, corruptStatements: true }, { alreadyApplied: true, badIntegrity: true }]) {
    const mock = mockIO(options); await assert.rejects(runOperator(["--recover"], mock.io), SafeFailure);
    assert.equal(mock.appliedAtAll, false); assert.ok(!mock.calls.includes("CONFIRM"));
    assert.ok(!mock.output.some(line => line.includes("RECOVERED_PASS")));
  }
  const mock = mockIO({ alreadyApplied: true }); await assert.rejects(runOperator(["--recover", "--precheck-only"], mock.io), /INVALID_ARGUMENTS/);
});
test("recover rejects changed stable snapshots and never emits recovered success", async () => {
  const mock = mockIO({ alreadyApplied: true, schedulesChangedAt: 2 });
  await assert.rejects(runOperator(["--recover"], mock.io), /QSTASH_STABLE_CONFIGURATION_CHANGED_DURING_RECOVERY/);
  assert.ok(!mock.output.some(line => line.includes("RECOVERED_PASS")));
  assert.equal(mock.appliedAtAll, false);
});
test("production recovery GET transport ignores volatile changes and establishes live reminder labels without writes", async () => {
  const mock = mockIO({ alreadyApplied: true }); delete mock.io.schedules;
  const originalFetch = globalThis.fetch, requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, method: options.method });
    const { calendar, reminder } = scheduleFixture();
    const row = url.endsWith("-reminders") ? reminder : calendar;
    row.updatedAt = requests.length; row.internalMetadata = { changing: requests.length };
    row.headers = { Authorization: "DO_NOT_LOG_HEADERS" };
    return Response.json(row);
  };
  try { await runOperator(["--recover"], mock.io); }
  finally { globalThis.fetch = originalFetch; }
  assert.equal(requests.length, 4);
  assert.ok(requests.every(r => r.method === "GET" && /^https:\/\/qstash-eu-central-1\.upstash\.io\/v2\/schedules\/watchflow-dev-part18-ops-unit2d-(calendar|reminders)$/.test(r.url)));
  assert.ok(!mock.output.join("\n").includes("DO_NOT_LOG_HEADERS"));
  assert.match(mock.output.join("\n"), /ARTWORK_MIGRATION_RECOVERED_PASS/);
});
test("production recovery GET rejects changed reminder labels with a safe field name", async () => {
  const mock = mockIO({ alreadyApplied: true }); delete mock.io.schedules;
  const originalFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async url => {
    const { calendar, reminder } = scheduleFixture();
    const row = url.endsWith("-reminders") ? reminder : calendar;
    if (++calls === 4) row.labels = ["unexpected"];
    return Response.json(row);
  };
  try {
    await assert.rejects(runOperator(["--recover"], mock.io), /QSTASH_STABLE_CONFIGURATION_CHANGED_DURING_RECOVERY schedule=reminder field=labels/);
  } finally { globalThis.fetch = originalFetch; }
  assert.ok(!mock.output.some(line => line.includes("RECOVERED_PASS")));
});
test("production precheck path has zero writes and no confirmation", async () => {
  const mock = mockIO(); await runOperator(["--precheck-only"], mock.io);
  assert.equal(mock.appliedAtAll, false); assert.ok(!mock.calls.includes("CONFIRM"));
  assert.ok(!mock.calls.some(sql => /^(insert|lock|commit)/i.test(sql)));
  assert.match(mock.output.join("\n"), /ARTWORK_PRECHECK_PASS/);
});
test("exact typed approval: altered, empty, ABORT or whitespace input cannot mutate", async () => {
  for (const approval of ["", "ABORT", ` ${APPROVAL}`, `${APPROVAL} `]) {
    const mock = mockIO({ approval }); await assert.rejects(runOperator([], mock.io), /APPROVAL_NOT_EXACT_ABORTED/);
    assert.equal(mock.appliedAtAll, false);
  }
});
test("sole pending recheck occurs immediately before the only pinned migration; ledger recorded transactionally", async () => {
  const mock = mockIO(); await runOperator([], mock.io);
  const apply = mock.calls.indexOf("PINNED_BODY");
  assert.ok(mock.calls.indexOf("CONFIRM") < apply);
  assert.ok(mock.calls.slice(mock.calls.indexOf("CONFIRM"), apply).some(sql => sql.startsWith("select version, name")));
  assert.ok(mock.calls.slice(0, apply).some(sql => sql.startsWith("lock table supabase_migrations")));
  assert.ok(mock.calls[apply + 1].startsWith("insert into supabase_migrations.schema_migrations"));
  assert.ok(mock.calls.indexOf("commit") > apply);
  assert.match(mock.output.join("\n"), /ARTWORK_DEV_MIGRATION_PASS/);
});
test("postcheck failure rolls back and cannot emit a committed pass", async () => {
  const mock = mockIO({ failPost: true }); await assert.rejects(runOperator([], mock.io), /ARTWORK_BUCKET_INVALID migration_committed=false/);
  assert.ok(mock.calls.includes("rollback")); assert.ok(!mock.calls.includes("commit"));
  assert.ok(!mock.output.some(line => line.includes("MIGRATION_PASS")));
});
test("a ledger race after approval blocks the pinned SQL before application", async () => {
  const mock = mockIO({ raceLedger: true }); await assert.rejects(runOperator([], mock.io), /UNEXPECTED_PENDING_MIGRATION/);
  assert.equal(mock.appliedAtAll, false);
});
test("a schedule change before commit rolls back; after commit is reported truthfully", async () => {
  const before = mockIO({ schedulesChangedAt: 3 });
  await assert.rejects(runOperator([], before.io), /QSTASH_CHANGED_DURING_APPLY schedule=reminder field=labels migration_committed=false/);
  assert.ok(!before.calls.includes("commit"));
  const after = mockIO({ schedulesChangedAt: 4 });
  await assert.rejects(runOperator([], after.io), /QSTASH_CHANGED_AFTER_COMMIT schedule=reminder field=labels migration_committed=true/);
  assert.ok(!after.output.some(line => line.includes("MIGRATION_PASS")));
});
test("existing data/contract changes block commit", async () => {
  const mock = mockIO({ changedData: true }); await assert.rejects(runOperator([], mock.io), /EXISTING_DATA_OR_CONTRACT_CHANGED/);
  assert.ok(!mock.calls.includes("commit"));
});
test("uncertain commit is explicitly classified and never retried", async () => {
  const mock = mockIO({ failCommit: true }); await assert.rejects(runOperator([], mock.io), /migration_committed=UNKNOWN_DO_NOT_RERUN/);
  assert.equal(mock.calls.filter(sql => sql === "PINNED_BODY").length, 1);
});
test("bad ledger and invalid args abort before apply", async () => {
  const mock = mockIO({ badLedger: true }); await assert.rejects(runOperator([], mock.io), /UNEXPECTED_PENDING/);
  assert.equal(mock.appliedAtAll, false);
  await assert.rejects(runOperator(["--yes"], mock.io), /INVALID_ARGUMENTS/);
});
test("safe errors expose only known codes, never arbitrary raw messages", () => {
  assert.equal(safeCode(new Error("password-bearing URL secret"), "PRECHECK"), "ARTWORK_PRECHECK_FAILED");
  assert.equal(safeCode(new SafeFailure("WRONG_LINKED_PROJECT"), "PRECHECK"), "WRONG_LINKED_PROJECT");
  assert.equal(safeCode({ code: "28P01" }, "CONTEXT"), "PG_AUTH_FAILED");
  assert.equal(safeCode({ code: "SELF_SIGNED_CERT_IN_CHAIN" }, "CONTEXT"), "PG_TLS_FAILED");
});
test("transport is direct verified TLS, no migration CLI, filesystem snapshots, broad deploy or network mutation", () => {
  const src = readFileSync(new URL("../apply-dev-private-artwork-migration.mjs", import.meta.url), "utf8");
  assert.match(src, /rejectUnauthorized: true/); assert.match(src, /SUPABASE_DB_CA_CERT_PATH/);
  assert.match(src, /url\.username === `postgres\.\$\{REF\}`/);
  assert.match(src, /linked\.name === "watchflow-dev"/);
  assert.doesNotMatch(src, /rejectUnauthorized: false|db push|writeFileSync|migration up|method: "(?:POST|PUT|PATCH|DELETE)"/);
});
