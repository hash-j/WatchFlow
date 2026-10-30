import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { parseA2Arguments, dispatchA2, parseQstashLogPage, inspectScheduleLogs,
  recoverFinalResult, verifyCalendarSchedule } from "../part18-ops-unit2d-script-a2.mjs";

const root = resolve(import.meta.dirname, "../..");
const scheduleId = "watchflow-dev-part18-ops-unit2d-calendar";
const row = (state = "CREATED", time = 1000) => ({ scheduleId, time, state,
  messageId: "offline-message", header: { Authorization: ["DO_NOT_EXPOSE"] }, body: "DO_NOT_EXPOSE", responseBody: "DO_NOT_EXPOSE" });
const liveEmptyEvents = () => JSON.parse(readFileSync(new URL("./part18-ops-unit2d-qstash-empty-events.json", import.meta.url), "utf8"));
test("the exact observed events-only fixture passes the production parser and query path", async () => {
  assert.deepEqual(parseQstashLogPage(liveEmptyEvents()), {
    matchingRows: 0, deliveryAttemptRows: 0, successfulDeliveryRows: 0, cursor: null,
  });
  let requests = 0;
  assert.deepEqual(await inspectScheduleLogs("offline-token", undefined, undefined, async url => {
    requests += 1;
    assert.equal(new URL(url).searchParams.get("scheduleId"), scheduleId);
    return liveEmptyEvents();
  }), { matchingRows: 0, deliveryAttemptRows: 0, successfulDeliveryRows: 0, paginationComplete: true });
  assert.equal(requests, 1);
});
test("events with unobserved rows, ambiguous arrays, or unknown continuation fields fail closed", () => {
  for (const page of [{ events: null }, { events: {} }, { events: "[]" }, { events: [row()] },
    { events: [], logs: [] }, { events: [], nextCursor: "next" }, { events: [], hasMore: true },
    { events: [], cursor: null }, { events: [], cursor: false }, { events: [], cursor: "bad\ncursor" }]) {
    assert.throws(() => parseQstashLogPage(page));
  }
});
test("empty events pages follow valid body cursors and reject cursor loops or malformed successors", async () => {
  let requests = 0;
  assert.equal((await inspectScheduleLogs("offline-token", undefined, undefined, async url => {
    requests += 1;
    if (requests === 1) return { events: [], cursor: "next" };
    assert.equal(new URL(url).searchParams.get("cursor"), "next");
    return liveEmptyEvents();
  })).paginationComplete, true);
  assert.equal(requests, 2);
  await assert.rejects(inspectScheduleLogs("offline-token", undefined, undefined,
    async () => ({ events: [], cursor: "repeated" })), /QSTASH_LOG_CURSOR_INVALID/);
  requests = 0;
  await assert.rejects(inspectScheduleLogs("offline-token", undefined, undefined,
    async () => ++requests === 1 ? { events: [], cursor: "next" } : {}), /QSTASH_LOGS_FIELD_MISSING/);
});
test("the documented logs/cursor envelope produces only safe counters", () => {
  const result = parseQstashLogPage({ logs: [row(), row("ACTIVE"), row("DELIVERED")], cursor: "" }, 1000, 2000);
  assert.deepEqual(result, { matchingRows: 3, deliveryAttemptRows: 2, successfulDeliveryRows: 1, cursor: null });
  assert.doesNotMatch(JSON.stringify(result), /DO_NOT_EXPOSE|Authorization|messageId|body/);
});
test("an empty array is a valid final page, but absent/null/nonarray logs are not silently empty", () => {
  assert.equal(parseQstashLogPage({ logs: [] }).matchingRows, 0);
  for (const page of [{}, { logs: null }, { logs: {} }, { logs: "[]" }]) assert.throws(() => parseQstashLogPage(page));
});
test("invalid page size, cursor, row identity, timestamp, and unknown state fail closed", () => {
  for (const page of [{ logs: Array.from({ length: 101 }, () => row()) }, { logs: [], cursor: false },
    { logs: [], cursor: "bad\ncursor" }, { logs: [{ ...row(), scheduleId: "other" }] },
    { logs: [row("ACTIVE", "1000")] }, { logs: [row("UNKNOWN")] }]) assert.throws(() => parseQstashLogPage(page));
  assert.throws(() => parseQstashLogPage({ logs: [row("ACTIVE", 999)] }, 1000, 2000));
});
test("pagination follows opaque cursors and preserves exact schedule/date filters", async () => {
  const requests = [];
  const result = await inspectScheduleLogs("offline-token", 1000, 2000, async url => {
    const parsed = new URL(url); requests.push(parsed);
    return requests.length === 1 ? { logs: [row("CREATED")], cursor: "next-page" } : { logs: [row("DELIVERED", 1500)] };
  });
  assert.deepEqual(result, { matchingRows: 2, deliveryAttemptRows: 1, successfulDeliveryRows: 1, paginationComplete: true });
  assert.equal(requests[1].searchParams.get("cursor"), "next-page");
  for (const url of requests) {
    assert.equal(url.searchParams.get("scheduleId"), scheduleId);
    assert.equal(url.searchParams.get("fromDate"), "1000");
    assert.equal(url.searchParams.get("toDate"), "2000");
    assert.equal(url.searchParams.get("count"), "100");
  }
});
test("unknown incident timestamps use retained history without invented date filters", async () => {
  await inspectScheduleLogs("offline-token", undefined, undefined, async url => {
    const query = new URL(url).searchParams;
    assert.equal(query.has("fromDate") || query.has("toDate"), false);
    return { logs: [] };
  });
});
test("repeating cursors or a malformed final page cannot claim pagination complete", async () => {
  await assert.rejects(inspectScheduleLogs("offline-token", 1000, 2000, async () => ({ logs: [], cursor: "repeated" })), /QSTASH_LOG_CURSOR_INVALID/);
  let count = 0;
  await assert.rejects(inspectScheduleLogs("offline-token", 1000, 2000, async () => ++count === 1 ? { logs: [], cursor: "next" } : {}), /QSTASH_LOGS_FIELD_MISSING/);
});
test("the explicit recovery argument cannot fall through to normal mutation", async () => {
  const calls = [];
  await dispatchA2(["--postcheck-only"], { normal: () => { throw new Error("MUTATION_PATH"); }, recover: options => calls.push(options.mode) });
  assert.deepEqual(calls, ["postcheck-only"]);
  assert.equal(parseA2Arguments([]).mode, "normal");
  assert.equal(parseA2Arguments(["--postcheck-only"]).scope, "retained_schedule_history");
  const window = parseA2Arguments(["--postcheck-only", "--logs-from-ms=1000", "--logs-to-ms=2000"], 3000);
  assert.equal(window.scope, "operator_supplied_interval");
  for (const args of [["--unknown"], ["--postcheck-only", "--logs-from-ms=1"],
    ["--postcheck-only", "--logs-from-ms=1", "--logs-from-ms=2"],
    ["--postcheck-only", "--logs-from-ms=1", "--logs-to-ms=9999"]]) {
    assert.throws(() => parseA2Arguments(args, 3000));
  }
});
function harness() {
  const calls = [];
  const context = { admin: {}, ownerId: "offline-owner", qstashToken: "offline-token", githubToken: "offline-token",
    schedulerSecret: "offline-secret", approvedCalendar: { readCredential: () => {} } };
  return { calls, context, io: {
    context: async () => context,
    fixture: async () => { calls.push("fixture"); return { jobSnapshot: "same-job", providerSubject: "offline-subject" }; },
    calendar: async () => { calls.push("calendar-get"); return { isPaused: true }; },
    verifyCalendar: (schedule, cron) => { assert.equal(schedule.isPaused, true); assert.equal(cron, "4-59/5 * * * *"); },
    reminder: async () => { calls.push("reminder-get"); }, gates: async () => { calls.push("github-get"); },
    access: async () => ({ accessToken: "offline-access", fingerprint: "same-credential" }),
    event: async () => { calls.push("google-exact-get"); },
    logs: async () => ({ matchingRows: 3, deliveryAttemptRows: 2, successfulDeliveryRows: 1, paginationComplete: true }),
    credential: async () => ({ fingerprint: "same-credential", ciphertext: Buffer.alloc(1), nonce: Buffer.alloc(12), authTag: Buffer.alloc(16) }),
    log: text => calls.push(text),
  } };
}
test("transport delivery rows alone are not an application safety failure", async () => {
  const h = harness();
  const result = await recoverFinalResult(parseA2Arguments(["--postcheck-only"]), h.io);
  assert.equal(result.logs.deliveryAttemptRows, 2);
  assert.ok(h.calls.some(text => text.startsWith("SCRIPT_A2_RECOVERED_PASS")));
  assert.ok(h.calls.some(text => text.includes("incident_window_known=false")));
  assert.equal(h.calls.filter(text => text === "fixture").length, 2);
  assert.equal(h.calls.filter(text => text === "google-exact-get").length, 2);
});
test("zero retained events permits recovery but never claims zero incident-window deliveries", async () => {
  const h = harness();
  h.io.logs = (...args) => inspectScheduleLogs(...args, async () => liveEmptyEvents());
  const result = await recoverFinalResult(parseA2Arguments(["--postcheck-only"]), h.io);
  assert.equal(result.logs.matchingRows, 0);
  const output = h.calls.filter(text => text.startsWith("SCRIPT_A2_RECOVERY_LOGS"));
  assert.equal(output.length, 1);
  assert.match(output[0], /incident_window_known=false incident_window_transport_count=UNKNOWN retention_scope_only=true/);
  assert.match(output[0], /matchingRows=0 deliveryAttemptRows=0 successfulDeliveryRows=0 paginationComplete=true/);
  assert.ok(h.calls.some(text => text.includes("application_safe=true")));
  assert.ok(h.calls.some(text => text.startsWith("SCRIPT_A2_RECOVERED_PASS")));
  for (const name of ["fixture", "calendar-get", "reminder-get", "github-get", "google-exact-get"]) {
    assert.equal(h.calls.filter(text => text === name).length, 2);
  }
});
test("parser failure still triggers every independent recovery safety recheck", async () => {
  const h = harness(); h.io.logs = async () => parseQstashLogPage({});
  await assert.rejects(recoverFinalResult(parseA2Arguments(["--postcheck-only"]), h.io), /LOGS_QSTASH_LOGS_FIELD_MISSING/);
  for (const name of ["fixture", "calendar-get", "reminder-get", "github-get", "google-exact-get"]) {
    assert.equal(h.calls.filter(text => text === name).length, 2);
  }
  assert.ok(h.calls.some(text => text.includes("application_safe=true")));
  assert.equal(h.calls.some(text => text.startsWith("SCRIPT_A2_RECOVERED_PASS")), false);
});
test("an unpaused schedule fails without a repair or pause attempt", async () => {
  const h = harness(); h.io.calendar = async () => ({ isPaused: false });
  await assert.rejects(recoverFinalResult(parseA2Arguments(["--postcheck-only"]), h.io));
  assert.equal(h.calls.includes("google-exact-get"), false);
});
test("a changed controlled job prevents recovered success", async () => {
  const h = harness(); let count = 0;
  h.io.fixture = async () => ({ jobSnapshot: ++count === 1 ? "same" : "changed", providerSubject: "offline-subject" });
  await assert.rejects(recoverFinalResult(parseA2Arguments(["--postcheck-only"]), h.io), /FIXTURE_RECOVERY_FIXTURE_CHANGED/);
  assert.ok(h.calls.some(text => text.includes("application_safe=false")));
});
test("a changed provider subject or encrypted credential prevents recovered success", async () => {
  for (const changed of ["subject", "credential"]) {
    const h = harness(); let count = 0;
    if (changed === "subject") h.io.fixture = async () => ({ jobSnapshot: "same-job", providerSubject: ++count === 1 ? "original" : "changed" });
    else h.io.credential = async () => ({ fingerprint: "changed", ciphertext: Buffer.alloc(1), nonce: Buffer.alloc(12), authTag: Buffer.alloc(16) });
    await assert.rejects(recoverFinalResult(parseA2Arguments(["--postcheck-only"]), h.io));
    assert.ok(h.calls.some(text => text.includes("application_safe=false")));
    assert.equal(h.calls.some(text => text.startsWith("SCRIPT_A2_RECOVERED_PASS")), false);
  }
});
test("failed scheduler or GitHub rechecks prevent recovered success without repair", async () => {
  for (const changed of ["calendar", "reminder", "gates"]) {
    const h = harness(); let count = 0;
    const original = h.io[changed];
    h.io[changed] = async (...args) => {
      if (++count === 2) throw new Error("offline recheck failure");
      return original(...args);
    };
    await assert.rejects(recoverFinalResult(parseA2Arguments(["--postcheck-only"]), h.io));
    assert.ok(h.calls.some(text => text.includes("application_safe=false")));
    assert.equal(h.calls.some(text => text.startsWith("SCRIPT_A2_RECOVERED_PASS")), false);
  }
});
test("incomplete log pagination never produces recovered success", async () => {
  const h = harness(); h.io.logs = async () => ({ matchingRows: 0, deliveryAttemptRows: 0, successfulDeliveryRows: 0, paginationComplete: false });
  await assert.rejects(recoverFinalResult(parseA2Arguments(["--postcheck-only"]), h.io), /LOGS_QSTASH_LOG_RESULT_INCOMPLETE/);
});
function calendarFixture() {
  const secret = "offline-secret";
  return { secret, schedule: { scheduleId, destination: "https://watchflow-dev-ops.vercel.app/api/internal/calendar/sync",
    method: "GET", cron: "4-59/5 * * * *", retries: 0, timeout: 55000, isPaused: true,
    labels: ["watchflow-dev", "part18-ops-unit2d", "calendar"],
    header: { Authorization: [`REDACTED:${createHash("sha256").update(`Bearer ${secret}`).digest("hex")}`] } } };
}
test("normal A2 still rejects an acceptance-cron starting schedule", () => {
  const { schedule, secret } = calendarFixture();
  verifyCalendarSchedule(schedule, "4-59/5 * * * *", secret);
  assert.throws(() => verifyCalendarSchedule(schedule, "0 0 1 1 *", secret), /CALENDAR_SCHEDULE_MISMATCH/);
  const source = readFileSync(resolve(root, "scripts/part18-ops-unit2d-script-a2.mjs"), "utf8");
  const normal = source.slice(source.indexOf("async function main("));
  assert.match(normal, /verifyCalendarSchedule\(await getCalendarSchedule\(qstashToken\), OLD_CRON, schedulerSecret\)/);
});
test("recovery context creates no Auth session and enforces GET/HEAD-only admin requests", async () => {
  const source = readFileSync(resolve(root, "scripts/part18-ops-unit2d-script-a2.mjs"), "utf8");
  const code = source.slice(source.indexOf("async function recoveryContext("), source.indexOf("async function recoveryAccess("));
  let configuration; const requests = [];
  class SafeFailure extends Error {}
  const context = await runInNewContext(`${code}\nrecoveryContext()`, {
    verifyLocalTarget: () => "https://ckwadpmvxieekjlsfcks.supabase.co", verifyGoogleConfigTarget: () => {},
    requiredEnv: name => name === "E2E_USER_A_EMAIL" ? "offline@example.invalid" : "offline-secret".repeat(3),
    requireCondition: (ok, reason) => { if (!ok) throw new SafeFailure(reason); }, URL, SafeFailure,
    CONNECTION_ID: "e652e5c8-f08c-4736-88d8-073bce772ccc", assertOne: () => ({ user_id: "offline-owner" }),
    createClient: (_origin, _key, options) => {
      configuration = options;
      return { from: () => ({ select: () => ({ eq: async () => ({}) }) }),
        auth: { admin: { getUserById: async () => ({ data: { user: { id: "offline-owner", email: "offline@example.invalid" } } }) } } };
    },
    loadApprovedCalendarPath: async () => ({}), fetch: async (_input, init) => { requests.push(init); return {}; },
  });
  assert.equal(context.ownerId, "offline-owner");
  await configuration.global.fetch("https://ckwadpmvxieekjlsfcks.supabase.co/rest/v1/calendar_connections", { method: "GET" });
  await assert.rejects(configuration.global.fetch("https://ckwadpmvxieekjlsfcks.supabase.co/rest/v1/calendar_connections", { method: "POST" }), /RECOVERY_DATABASE_WRITE_REJECTED/);
  await assert.rejects(configuration.global.fetch("https://production.invalid/rest/v1/calendar_connections", { method: "GET" }), /RECOVERY_DATABASE_WRITE_REJECTED/);
  assert.equal(requests.length, 1);
});
