import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";

const root = resolve(import.meta.dirname, "../..");
const source = readFileSync(resolve(root, "scripts/part18j-apply-dev-reauth-migration.mjs"), "utf8");
const helpers = source.slice(source.indexOf("function prepareRollbackSnapshot("), source.indexOf("async function main("));
const mainCode = source.slice(source.indexOf("async function main("), source.indexOf("\nmain().catch("));
const hash = value => createHash("sha256").update(value).digest("hex");
class SafeFailure extends Error {}
function harness(options = {}) {
  const calls = [];
  const definitions = { old: "offline previous function", new: "offline replacement function" };
  const context = {
    SafeFailure, requireSafe: (condition, code) => { if (!condition) throw new SafeFailure(code); },
    sha256: hash, ROLLBACK_SNAPSHOT: "offline-snapshot", process: { argv: ["node", "operator", ...(options.precheck ? ["--precheck-only"] : [])], env: {}, execPath: "node" },
    existsSync: () => options.snapshot !== undefined,
    readFileSync: () => options.snapshot,
    writeFileSync: (...args) => calls.push(["write", ...args]),
    checkLocalTarget: () => { calls.push(["target"]); if (options.targetError) throw new SafeFailure("WRONG_LINKED_PROJECT"); return { origin: "offline", cli: "offline-cli" }; },
    readLedger: (_cli, applied) => {
      calls.push(["ledger", applied]);
      if (options.ledgerError || applied !== (options.applied ?? false)) throw new SafeFailure("LEDGER_FAILURE");
    },
    readFunction: async (_cli, applied, inspectOnly) => {
      calls.push(["function", applied, inspectOnly]);
      if (options.functionError) throw new SafeFailure("PG_TLS_FAILED");
      return options.changed ? definitions.new : definitions.old;
    },
    runCli: (...args) => { calls.push(["cli", ...args]); return { pid: 123, status: 0 }; },
    ROOT: root, resolve, requiredEnv: () => "offline-token", createClient: () => ({}),
    PREVIOUS_FUNCTION_SHA256: hash(definitions.old),
    readFixture: async () => { calls.push(["fixture"]); return "offline-fixture-hash"; },
    checkExternalHolds: async () => { calls.push(["holds"]); },
    confirmation: async () => calls.push(["approval"]),
    console: { log: () => calls.push(["log"]) },
    spawnSync: () => { calls.push(["integration"]); return { status: 0, stdout: "9 passed" }; },
  };
  const api = runInNewContext(`${helpers}\n(${mainCode})`, context);
  return { api, context, calls, definitions };
}

test("application uses only --linked with a final target and sole-pending ledger check", () => {
  const h = harness();
  h.context.runPinnedMigration("offline-cli");
  assert.deepEqual(h.calls.slice(0, 2), [["target"], ["ledger", false]]);
  const invocation = h.calls[2];
  assert.equal(invocation[0], "cli");
  assert.deepEqual(Array.from(invocation[2]), ["migration", "up", "--linked"]);
  assert.equal(invocation[3], 120000);
});
test("CLI receives the exact database password only through its environment", () => {
  const code = source.slice(source.indexOf("function runCli("), source.indexOf("function sha256("));
  let invocation;
  const runCli = runInNewContext(`${code}\nrunCli`, {
    ROOT: root, process: { env: { SUPABASE_DB_PASSWORD: " offline-password " } },
    spawnSync: (...args) => { invocation = args; return { status: 0 }; },
  });
  runCli({ command: "offline-cli", prefix: [] }, ["migration", "up", "--linked"]);
  assert.equal(invocation[2].env.SUPABASE_DB_PASSWORD, " offline-password ");
  assert.equal(invocation[1].some(arg => arg.includes("offline-password")), false);
});
test("wrong linked target blocks application", () => {
  const h = harness({ targetError: true });
  assert.throws(() => h.context.runPinnedMigration("offline-cli"), { message: "WRONG_LINKED_PROJECT" });
  assert.equal(h.calls.some(call => call[0] === "cli"), false);
});
test("a failed sole-pending check blocks application", () => {
  const h = harness({ ledgerError: true });
  assert.throws(() => h.context.runPinnedMigration("offline-cli"), { message: "LEDGER_FAILURE" });
  assert.equal(h.calls.some(call => call[0] === "cli"), false);
});
for (const [result, classification, started] of [
  [{ pid: 123, status: 1, stderr: "unknown flag --offline-secret" }, "CLI_ARGUMENT_REJECTED", true],
  [{ pid: 123, status: 1, stderr: "password authentication failed offline-secret" }, "CLI_AUTH_FAILED", true],
  [{ pid: 123, status: 1, stderr: "certificate offline-secret" }, "CLI_TLS_FAILED", true],
  [{ pid: 123, status: null, error: { code: "ETIMEDOUT" } }, "CLI_TIMEOUT", true],
  [{ status: null, error: { code: "ENOENT" } }, "CLI_START_FAILED", false],
  [{ pid: 123, status: 1, stderr: "offline-secret" }, "CLI_NONZERO_EXIT", true],
]) {
  test(`sanitizes application evidence as ${classification}`, () => {
    const h = harness();
    const evidence = h.context.migrationCommandEvidence(result);
    assert.match(evidence, new RegExp(`cli_classification=${classification}`));
    assert.match(evidence, new RegExp(`application_command_started=${started}`));
    assert.doesNotMatch(evidence, /offline-secret|ENOENT|unknown flag/);
  });
}
for (const [options, expected] of [
  [{ applied: false, changed: false }, "MIGRATION_APPLY_FAILED_UNCHANGED"],
  [{ applied: false, changed: true }, "MIGRATION_APPLY_STATE_AMBIGUOUS"],
  [{ applied: true, changed: true }, "MIGRATION_APPLY_SUCCEEDED_POSTCHECK_FAILED"],
  [{ applied: true, changed: false }, "MIGRATION_APPLY_STATE_AMBIGUOUS"],
  [{ ledgerError: true }, "MIGRATION_APPLY_STATE_AMBIGUOUS"],
  [{ functionError: true }, "MIGRATION_APPLY_STATE_AMBIGUOUS"],
]) {
  test(`failure state requires both independent observations: ${JSON.stringify(options)}`, async () => {
    const h = harness(options);
    const error = await h.context.migrationFailureState("offline-cli", hash(h.definitions.old), "safe-evidence");
    assert.equal(error.message, `${expected} safe-evidence`);
    const observation = h.calls.find(call => call[0] === "function");
    assert.ok(observation);
    assert.equal(observation[2], true);
  });
}
test("matching prior snapshot is reused without writing", () => {
  const h = harness({ snapshot: "offline previous function\n" });
  h.context.prepareRollbackSnapshot(h.definitions.old);
  assert.equal(h.calls.length, 0);
});
test("a mismatched prior snapshot cannot be overwritten", () => {
  const h = harness({ snapshot: "different snapshot\n" });
  assert.throws(() => h.context.prepareRollbackSnapshot(h.definitions.old), { message: "ROLLBACK_SNAPSHOT_MISMATCH" });
  assert.equal(h.calls.length, 0);
});
test("a new snapshot retains exclusive creation", () => {
  const h = harness();
  h.context.prepareRollbackSnapshot(h.definitions.old);
  assert.equal(h.calls[0][0], "write");
  assert.equal(h.calls[0][3].flag, "wx");
});
test("precheck exits before snapshot, approval, application, or integration fixtures", async () => {
  const h = harness({ precheck: true });
  await h.api();
  for (const forbidden of ["write", "approval", "cli", "integration"]) {
    assert.equal(h.calls.some(call => call[0] === forbidden), false);
  }
  assert.equal(h.calls.some(call => call[0] === "holds"), true);
});
test("successful application verifies ledger, function, fixture, and holds before integration", async () => {
  const options = { snapshot: "offline previous function\n" };
  const h = harness(options);
  h.context.runCli = (...args) => {
    h.calls.push(["cli", ...args]);
    options.applied = true;
    options.changed = true;
    return { pid: 123, status: 0 };
  };
  await h.api();
  const integrationIndex = h.calls.findIndex(call => call[0] === "integration");
  assert.ok(integrationIndex > 0);
  const beforeIntegration = h.calls.slice(0, integrationIndex);
  assert.equal(beforeIntegration.filter(call => call[0] === "fixture").length, 3);
  assert.equal(beforeIntegration.filter(call => call[0] === "holds").length, 3);
  assert.ok(beforeIntegration.some(call => call[0] === "ledger" && call[1] === true));
  assert.ok(beforeIntegration.some(call => call[0] === "function" && call[1] === true && call[2] === undefined));
  const applyIndex = h.calls.findIndex(call => call[0] === "cli");
  assert.deepEqual(h.calls[applyIndex - 1], ["ledger", false]);
});
test("a failed CLI command is inspected and cannot start integration fixtures", async () => {
  const h = harness({ snapshot: "offline previous function\n" });
  h.context.runCli = () => ({ pid: 123, status: 1, stderr: "unknown flag offline-secret" });
  await assert.rejects(h.api(), error => {
    assert.match(error.message, /^MIGRATION_APPLY_FAILED_UNCHANGED /);
    assert.match(error.message, /apply_exit_code=1 cli_classification=CLI_ARGUMENT_REJECTED application_command_started=true/);
    assert.doesNotMatch(error.message, /offline-secret/);
    return true;
  });
  assert.equal(h.calls.some(call => call[0] === "integration"), false);
});
test("successful command followed by a failed fixture check is classified from observed state", async () => {
  const options = { snapshot: "offline previous function\n" };
  const h = harness(options);
  let fixtureReads = 0;
  h.context.readFixture = async () => ++fixtureReads === 3 ? "changed-fixture" : "offline-fixture-hash";
  h.context.runCli = () => {
    options.applied = true;
    options.changed = true;
    return { pid: 123, status: 0 };
  };
  await assert.rejects(h.api(), error => /^MIGRATION_APPLY_SUCCEEDED_POSTCHECK_FAILED /.test(error.message));
  assert.equal(h.calls.some(call => call[0] === "integration"), false);
});
