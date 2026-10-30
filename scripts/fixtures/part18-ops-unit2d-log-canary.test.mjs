// All event rows in this test are synthetic. No canary or remote call is run.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { SafeFailure as OwnerSafeFailure } from "../part18-ops-unit2d-sync-reenable.mjs";
import { SafeFailure as ReauthSafeFailure } from "../part18j-google-reauth-checkpoint.mjs";
import { CANARY, CONFIRMATION, DESTINATION, LABELS, analyzeRows, canaryPlan, canaryRequest, inspectPage, mutateCanary,
  parseArguments, propertyTypes, readCanary, readEvents, runCanary, sanitizePage, verifyAsset, verifyCanary, verifyStaticSources,
  classifyPgFailure, classifiedPgClient, formatCanaryStop, precheckStage, readPrecheckJson, readRealHolds,
  requirePrecheckEnvironment, safeErrorCode } from "../part18-ops-unit2d-log-canary.mjs";

const root = resolve(import.meta.dirname, "../.."), initial = Date.UTC(2026, 9, 29, 12, 0), plan = canaryPlan(initial);
const oldToken = process.env.QSTASH_TOKEN_EU;
process.env.QSTASH_TOKEN_EU = "OFFLINE_QSTASH_API_TOKEN";
test.after(() => { if (oldToken === undefined) delete process.env.QSTASH_TOKEN_EU; else process.env.QSTASH_TOKEN_EU = oldToken; });
function row(state = "CREATED", time = plan.first) {
  return { scheduleId: CANARY, url: DESTINATION, method: "GET", state, messageId: "RAW_MESSAGE_ID_NEVER_PRINT",
    time, timeout: 10000, labels: [...LABELS], header: { "Upstash-Signature": ["SECRET_HEADER_VALUE"] },
    label: "synthetic-label", callerIp: "192.0.2.1", host: "watchflow-dev-ops.vercel.app", path: "/icons/watchflow-icon.svg",
    ...(state === "CREATED" ? { nextDeliveryTime: time } : state === "DELIVERED" ? { responseStatus: 200, duration: 10 } : {}) };
}
function schedule(p, paused = true) {
  return { scheduleId: CANARY, destination: DESTINATION, method: "GET", cron: p.cron, retries: 0, timeout: 10000,
    isPaused: paused, labels: [...LABELS], header: { "Content-Type": ["application/json"] } };
}
function seen() { return { messages: new Set(), ACTIVE: new Set(), DELIVERED: new Set() }; }
function harness(scenario = "success") {
  const calls = [], logs = [], writes = [];
  const state = { time: initial, exists: false, paused: true, resumed: false, appDigest: "UNCHANGED_APPLICATION", deadline: null, plan: null };
  const io = {
    context: async () => ({}), capture: async () => { calls.push("full-isolation-google-get"); return { digest: state.appDigest }; },
    isolation: async () => { calls.push("isolation-real-holds-read"); return { digest: state.appDigest }; },
    asset: async () => calls.push("public-static-get"), confirm: async () => CONFIRMATION,
    now: () => state.time, mono: () => state.time,
    sleep: async ms => { state.time += ms; if (state.deadline && state.time >= state.deadline.at) { const fn = state.deadline.fn; state.deadline = null; fn(); } },
    deadline: (fn, ms) => { state.deadline = { fn, at: state.time + ms }; return () => { state.deadline = null; }; },
    signals: handler => { state.signal = handler; return () => { state.signal = null; }; },
    read: async () => { calls.push("canary-get"); return state.exists ? schedule(state.plan, state.paused) : null; },
    mutate: async (action, p) => {
      calls.push(action);
      if (action === "create") { assert.equal(state.exists, false); state.exists = true; state.paused = false; state.plan = p; }
      if (action === "pause") state.paused = true;
      if (action === "resume") { state.paused = false; state.resumed = true; }
      if (action === "delete") state.exists = false;
    },
    logs: async () => {
      if (!state.resumed || state.time < plan.first || scenario === "timeout") return { page: { events: [] }, paginationHeaders: [] };
      if (scenario === "unknown") return { page: { events: [{ undocumentedField: "SECRET_UNKNOWN_VALUE" }] }, paginationHeaders: [] };
      return { page: { events: state.time < plan.first + 2000 ? [row()] : [row("DELIVERED", plan.first + 2000), row("ACTIVE", plan.first + 1000), row()] }, paginationHeaders: [] };
    }, log: line => logs.push(line), write: record => writes.push(structuredClone(record)),
  };
  return { state, calls, logs, writes, io };
}
test("verified static asset/routing pins match repository and public GET never has credentials", async () => {
  verifyStaticSources();
  const svg = readFileSync(resolve(root, "public/icons/watchflow-icon.svg"), "utf8");
  await verifyAsset(async (url, options) => {
    assert.equal(url, DESTINATION); assert.equal(options.method, "GET"); assert.equal(options.redirect, "error");
    assert.equal(options.credentials, "omit"); assert.equal(options.headers, undefined);
    return new Response(svg, { status: 200, headers: { "content-type": "image/svg+xml; charset=utf-8" } });
  });
  for (const response of [new Response("login", { status: 200, headers: { "content-type": "text/html" } }),
    new Response(svg, { status: 200, headers: { "content-type": "image/svg+xml", "set-cookie": "offline-cookie" } }),
    new Response("wrong SVG", { status: 200, headers: { "content-type": "image/svg+xml" } })]) {
    await assert.rejects(verifyAsset(async () => response));
  }
});
test("annual cron has one near-future occurrence and no second in the observation window", () => {
  for (const now of [initial, Date.UTC(2028, 1, 29, 12, 0), Date.UTC(2096, 1, 29, 12, 0), Date.UTC(2026, 11, 31, 23, 58)]) {
    const p = canaryPlan(now), date = new Date(p.first);
    assert.ok(p.first - now >= 300000); assert.ok(p.second - p.first > 300 * 86400000);
    assert.equal(p.cron, `${date.getUTCMinutes()} ${date.getUTCHours()} ${date.getUTCDate()} ${date.getUTCMonth() + 1} *`);
    assert.ok(p.cutoff < p.second); assert.ok(p.latestResume <= p.first - 65000);
  }
});
test("canary mutation transport pins the ID/destination and carries no forwarded authentication or body/callback", async () => {
  const create = canaryRequest("create", plan);
  assert.equal(create.url, `https://qstash-eu-central-1.upstash.io/v2/schedules/${DESTINATION}`);
  assert.equal(create.init.headers["Upstash-Schedule-Id"], CANARY);
  assert.equal(create.init.headers["Upstash-Method"], "GET"); assert.equal(create.init.headers["Upstash-Retries"], "0");
  assert.equal(create.init.body, undefined); assert.equal(create.init.redirect, "error");
  assert.equal(Object.keys(create.init.headers).some(name => /forward|callback|scheduler|api.?key/i.test(name)), false);
  for (const action of ["pause", "resume", "delete"]) {
    const request = canaryRequest(action, plan);
    assert.equal(request.url, `https://qstash-eu-central-1.upstash.io/v2/schedules/${CANARY}${action === "delete" ? "" : `/${action}`}`);
    assert.equal(request.init.method, action === "delete" ? "DELETE" : "POST");
  }
  assert.throws(() => canaryRequest("publish", plan));
  await mutateCanary("create", plan, async () => new Response(JSON.stringify({ scheduleId: CANARY }), { status: 200 }));
  await assert.rejects(mutateCanary("create", plan, async () => new Response('{"scheduleId":"wrong"}', { status: 200 })), /CREATE_ID/);
});
test("canary schedule assertions reject credentials, callbacks, body, wrong target and duplicate labels", () => {
  verifyCanary(schedule(plan), plan, true);
  for (const change of [d => d.header.Authorization = ["SECRET"], d => d.header["Upstash-Forward-Authorization"] = ["SECRET"],
    d => d.callback = "https://other.invalid", d => d.failureCallbackHeaders = { secret: ["SECRET"] },
    d => d.body = "SECRET", d => d.destination = "https://watchflow-dev-ops.vercel.app/api/internal/calendar/sync",
    d => d.labels = ["watchflow-dev", "log-canary", "log-canary"], d => d.retries = 1, d => d.isPaused = false]) {
    const s = schedule(plan); change(s); assert.throws(() => verifyCanary(s, plan, true));
  }
});
test("explicit mode and exact approval fail with zero canary mutation", async () => {
  for (const args of [[], ["--canary", "extra"], ["--resume"]]) assert.throws(() => parseArguments(args));
  const h = harness(); h.io.confirm = async () => `${CONFIRMATION} `;
  await assert.rejects(runCanary("--canary", h.io), /TYPED_CONFIRMATION_MISMATCH/);
  assert.equal(h.calls.some(call => ["create", "pause", "resume", "delete"].includes(call)), false);
});
test("precheck-only performs read guards and never creates or writes evidence", async () => {
  const h = harness(); await runCanary("--precheck-only", h.io);
  assert.equal(h.calls.some(call => ["create", "pause", "resume", "delete"].includes(call)), false); assert.equal(h.writes.length, 0);
});
test("an existing canary ID is never overwritten, resumed or deleted", async () => {
  const h = harness(); h.io.read = async () => ({ scheduleId: CANARY, isPaused: true });
  await assert.rejects(runCanary("--canary", h.io), /ALREADY_EXISTS/);
  assert.equal(h.calls.some(call => ["create", "pause", "resume", "delete"].includes(call)), false);
});
test("one synthetic automatic message is paused on observation, deleted, and leaves app state unchanged", async () => {
  const h = harness(); await runCanary("--canary", h.io);
  assert.deepEqual(h.calls.filter(call => ["create", "pause", "resume", "delete"].includes(call)), ["create", "pause", "resume", "pause", "delete"]);
  assert.equal(h.state.exists, false); assert.equal(h.writes.length, 1);
  assert.ok(h.logs.some(line => line.startsWith("CANARY_CAPTURE_PASS")));
  assert.equal(h.writes[0].requires_human_schema_review, true); assert.equal(h.writes[0].real_first_run_decoder_ready, false);
  assert.doesNotMatch(JSON.stringify(h.logs) + JSON.stringify(h.writes), /SECRET_|RAW_MESSAGE_ID_NEVER_PRINT|OFFLINE_QSTASH_API_TOKEN|Authorization/);
});
test("unknown live-shaped fields are captured only as redacted structure and force cleanup/failure", async () => {
  const h = harness("unknown"); await assert.rejects(runCanary("--canary", h.io), /QSTASH_EVENT_STATE_UNKNOWN/);
  assert.equal(h.state.exists, false); assert.ok(h.calls.includes("pause")); assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].structures.some(s => s.first_event?.properties.undocumentedField === "string"), true);
  assert.doesNotMatch(JSON.stringify(h.writes) + h.logs.join("\n"), /SECRET_UNKNOWN_VALUE/);
  assert.equal(h.logs.some(line => line.startsWith("CANARY_CAPTURE_PASS")), false);
});
test("create response loss still deletes only the attempted canary and verifies absence", async () => {
  const h = harness(), mutate = h.io.mutate;
  h.io.mutate = async (...args) => { await mutate(...args); if (args[0] === "create") throw new Error("SECRET_ERROR_RESPONSE"); };
  await assert.rejects(runCanary("--canary", h.io), /CANARY_OPERATION_FAILED/);
  assert.deepEqual(h.calls.filter(call => ["create", "pause", "resume", "delete"].includes(call)), ["create", "delete"]);
  assert.equal(h.state.exists, false); assert.doesNotMatch(h.logs.join("\n"), /SECRET_ERROR_RESPONSE/);
});
test("interrupt during creation cannot recreate a canary after cleanup", async () => {
  const h = harness(), mutate = h.io.mutate;
  h.io.mutate = async (action, p) => {
    if (action === "create") { h.state.signal(); await Promise.resolve(); }
    await mutate(action, p);
  };
  await assert.rejects(runCanary("--canary", h.io), /OPERATOR_INTERRUPTED/);
  assert.deepEqual(h.calls.filter(call => ["create", "pause", "resume", "delete"].includes(call)), ["create", "delete"]);
  assert.equal(h.state.exists, false);
});
test("resume response loss does not retry activation and always deletes", async () => {
  const h = harness(), mutate = h.io.mutate;
  h.io.mutate = async (...args) => { await mutate(...args); if (args[0] === "resume") throw new Error("offline response lost"); };
  await assert.rejects(runCanary("--canary", h.io));
  assert.equal(h.calls.filter(call => call === "resume").length, 1); assert.equal(h.calls.filter(call => call === "delete").length, 1);
  assert.equal(h.state.exists, false);
});
test("hard cutoff deletes a silent canary before its second annual occurrence", async () => {
  const h = harness("timeout"); await assert.rejects(runCanary("--canary", h.io), /CANARY_HARD_CUTOFF/);
  assert.equal(h.state.exists, false); assert.ok(h.state.time < plan.second);
  assert.equal(h.calls.filter(call => call === "delete").length, 1);
});
test("lost delete response still verifies GET absence and reports unconfirmed response without retry", async () => {
  const h = harness(), mutate = h.io.mutate;
  h.io.mutate = async (...args) => { await mutate(...args); if (args[0] === "delete") throw new Error("offline response lost"); };
  await assert.rejects(runCanary("--canary", h.io), /CLEANUP_OR_ISOLATION_FAILED/);
  assert.equal(h.state.exists, false); assert.equal(h.calls.filter(call => call === "delete").length, 1);
  assert.ok(h.logs.some(line => line.includes('"canary_deleted_verified":true') && line.includes("DELETE_RESPONSE_UNCONFIRMED")));
});
test("failed absence proof never reports canary deletion success", async () => {
  const h = harness(), mutate = h.io.mutate;
  h.io.mutate = async (...args) => { if (args[0] === "delete") h.calls.push("delete"); else await mutate(...args); };
  await assert.rejects(runCanary("--canary", h.io), /CLEANUP_OR_ISOLATION_FAILED/);
  assert.ok(h.logs.some(line => line.includes('"canary_deleted_verified":false')));
  assert.equal(h.calls.filter(call => call === "delete").length, 1);
});
test("any application/real-hold change fails and cleans only the canary", async () => {
  const h = harness(), isolation = h.io.isolation;
  h.io.isolation = async () => { const value = await isolation(); h.state.appDigest = "CHANGED"; return { ...value, digest: "CHANGED" }; };
  await assert.rejects(runCanary("--canary", h.io), /CLEANUP_OR_ISOLATION_FAILED/);
  assert.equal(h.state.exists, false); assert.equal(h.writes[0].application_data_isolation_verified, false);
});
test("empty rows never prove provenance and malformed/ambiguous rows are rejected", () => {
  assert.equal(analyzeRows({ events: [] }, plan, seen()).schedule_id_matches, false);
  for (const change of [r => r.scheduleId = "another", r => r.url = "https://production.invalid", r => r.method = "POST",
    r => r.messageId = 123, r => r.time = "timestamp", r => r.state = "UNKNOWN", r => r.maxRetries = 1,
    r => r.header = "unexpected", r => r.header.Authorization = ["SECRET"],
    r => r.body = "SECRET", r => r.callback = "https://other.invalid", r => r.time = plan.second]) {
    const item = row(); change(item); assert.throws(() => analyzeRows({ events: [item] }, plan, seen()));
  }
  assert.throws(() => analyzeRows({ events: [], logs: [] }, plan, seen()));
  assert.throws(() => analyzeRows({ logs: [] }, plan, seen()));
  assert.throws(() => analyzeRows({ events: Array.from({ length: 100 }, () => row()) }, plan, seen()), /FULL_PAGE_PAGINATION_UNVERIFIED/);
  assert.equal(analyzeRows({ events: [{ ...row(), unknownAlias: "OPAQUE_METADATA" }] }, plan, seen()).uniqueMessages, 1);
});
test("message correlation rejects a second message or distinct duplicate delivery attempt", () => {
  const tracker = seen(); analyzeRows({ events: [row("ACTIVE")] }, plan, tracker);
  analyzeRows({ events: [row("ACTIVE")] }, plan, tracker); // repeat of the same retained row
  assert.throws(() => analyzeRows({ events: [row("ACTIVE", plan.first + 1)] }, plan, tracker), /MULTIPLE_MESSAGE_STATE_TRANSITIONS/);
  assert.throws(() => analyzeRows({ events: [{ ...row(), messageId: "another-message" }] }, plan, tracker), /MULTIPLE_CANARY_MESSAGES/);
  for (const state of ["RETRY", "ERROR", "FAILED"]) assert.throws(() => analyzeRows({ events: [row(state)] }, plan, seen()), /STATE_UNKNOWN/);
});
test("structural output and fixtures remove secrets while preserving anonymous message/time relationships", () => {
  const page = { events: [{ ...row(), body: "SECRET_BODY_VALUE" }, row("DELIVERED", plan.first + 2000), { ...row(), messageId: "another-message" }] };
  const fixture = sanitizePage(page, new Map(), plan.first), shape = inspectPage(page);
  assert.equal(fixture.events[0].messageId, fixture.events[1].messageId); assert.notEqual(fixture.events[0].messageId, fixture.events[2].messageId);
  assert.equal(fixture.events[1].time - fixture.events[0].time, 2000);
  assert.equal(shape.row_array_property, "events"); assert.equal(shape.event_count, 3); assert.equal(shape.first_event.properties.header, "object");
  assert.doesNotMatch(JSON.stringify({ fixture, shape }), /SECRET_|RAW_MESSAGE_ID_NEVER_PRINT|Authorization/);
  assert.equal(propertyTypes({ Authorization: "secret", access_token: "secret", normalField: "value" }).omitted_property_count, 2);
});
test("live logs requests and absence checks are GET-only and scoped to the canary", async () => {
  await readEvents(initial, plan.first, async (url, init) => {
    assert.equal(init.method, "GET"); const parsed = new URL(url); assert.equal(parsed.hostname, "qstash-eu-central-1.upstash.io");
    assert.equal(parsed.searchParams.get("scheduleId"), CANARY); assert.equal(parsed.searchParams.get("count"), "100");
    return new Response('{"events":[]}', { status: 200 });
  });
  assert.equal(await readCanary(async (url, init) => {
    assert.equal(url, `https://qstash-eu-central-1.upstash.io/v2/schedules/${CANARY}`); assert.equal(init.method, "GET");
    return new Response(null, { status: 404 });
  }), null);
});
test("unobserved pagination fails closed after safely capturing its shape and deleting canary", async () => {
  const h = harness(), logs = h.io.logs;
  h.io.logs = async (...args) => { const response = await logs(...args); if (h.state.time >= plan.first) response.page.cursor = "OPAQUE_CURSOR_NEVER_PRINT"; return response; };
  await assert.rejects(runCanary("--canary", h.io), /PAGINATION_REQUIRES_REVIEW/);
  assert.equal(h.state.exists, false); assert.equal(h.writes[0].structures.some(s => s.body_cursor_present), true);
  assert.doesNotMatch(JSON.stringify(h.writes), /OPAQUE_CURSOR_NEVER_PRINT/);
});
test("all four precheck boundaries sanitize unknown native failures and make zero writes", async () => {
  for (const [method, expected] of [["context", "CONTEXT"], ["capture", "CAPTURE"], ["asset", "ASSET"], ["read", "LOOKUP"]]) {
    const h = harness();
    h.io[method] = async () => { throw new Error("SECRET_EXCEPTION postgresql://user:password@private.invalid"); };
    h.io.confirm = async () => { throw new Error("APPROVAL_MUST_NOT_BE_REQUESTED"); };
    h.io.deadline = () => { throw new Error("WATCHDOG_MUST_NOT_START"); };
    await assert.rejects(runCanary("--precheck-only", h.io), error => {
      const output = formatCanaryStop(error);
      assert.match(output, new RegExp(`code=CANARY_PRECHECK_${expected}_FAILED`));
      assert.doesNotMatch(output, /SECRET|password|postgresql|UNEXPECTED_FAILURE/);
      return true;
    });
    assert.equal(h.calls.some(call => ["create", "pause", "resume", "delete"].includes(call)), false);
    assert.equal(h.writes.length, 0);
  }
});
test("SafeFailure codes survive owner, reauth and independent A2-style class boundaries", async () => {
  class SafeFailure extends Error { constructor(value) { super("SECRET_IGNORED_MESSAGE"); this.code = value; } }
  for (const failure of [new OwnerSafeFailure("MISSING_GH_TOKEN"), new ReauthSafeFailure("GOOGLE_REFRESH_FAILED classification=invalid_grant"),
    new SafeFailure("SCHEDULE_HEADERS_MISMATCH")]) {
    const value = safeErrorCode(failure);
    await assert.rejects(precheckStage("CANARY_PRECHECK_CAPTURE_FAILED", async () => { throw failure; }), error => {
      assert.equal(safeErrorCode(error), value); assert.doesNotMatch(formatCanaryStop(error), /SECRET_IGNORED/); return true;
    });
  }
  const native = new Error("SECRET_RAW_MESSAGE"); native.stage = "SECRET_UNTRUSTED_STAGE";
  assert.equal(formatCanaryStop(native), "CANARY_STOP code=CANARY_OPERATION_FAILED");
});
test("missing existing credentials are named and optional CA handling adds no new requirement", () => {
  const complete = { SUPABASE_DB_PASSWORD: " keep password bytes ", QSTASH_TOKEN_EU: "offline-qstash", GH_TOKEN: "offline-github" };
  requirePrecheckEnvironment(complete, () => false);
  for (const name of Object.keys(complete)) {
    assert.throws(() => requirePrecheckEnvironment({ ...complete, [name]: undefined }), new RegExp(`MISSING_${name}`));
  }
  assert.throws(() => requirePrecheckEnvironment({ ...complete, SUPABASE_DB_CA_CERT_PATH: "missing-ca.pem" }, () => false), /MISSING_SUPABASE_DB_CA_CERT_PATH/);
  requirePrecheckEnvironment({ ...complete, SUPABASE_DB_CA_CERT_PATH: "existing-ca.pem" }, () => true);
});
test("PG errors are classified before the shared snapshot catch without changing TLS or transaction configuration", async () => {
  assert.equal(safeErrorCode(classifyPgFailure({ code: "28P01", message: "SECRET_PASSWORD" })), "PG_AUTH_FAILED");
  assert.equal(safeErrorCode(classifyPgFailure({ code: "SELF_SIGNED_CERT_IN_CHAIN" }, "existing-ca.pem")), "PG_TLS_FAILED");
  assert.equal(safeErrorCode(classifyPgFailure({ cause: { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" } }, "")), "MISSING_SUPABASE_DB_CA_CERT_PATH");
  assert.equal(safeErrorCode(classifyPgFailure({ code: "ERR_TLS_CERT_ALTNAME_INVALID" }, undefined)), "PG_TLS_FAILED");
  assert.equal(safeErrorCode(classifyPgFailure({ code: "42P01" })), "APPLICATION_SNAPSHOT_FAILED");
  const options = { ssl: { rejectUnauthorized: true, ca: "offline-ca" }, password: "OFFLINE_PASSWORD" };
  class Client {
    constructor(config) { this.config = config; }
    async connect() { throw Object.assign(new Error("SECRET_NATIVE_CONNECT_ERROR"), { code: "28P01" }); }
    async query() { throw Object.assign(new Error("SECRET_SQL_ERROR"), { code: "42501" }); }
  }
  const ClientWithErrors = classifiedPgClient(Client), client = new ClientWithErrors(options);
  assert.equal(client.config, options); assert.equal(client.config.ssl.rejectUnauthorized, true);
  await assert.rejects(client.connect(), /PG_AUTH_FAILED/); await assert.rejects(client.query("SELECT"), /APPLICATION_SNAPSHOT_FAILED/);
});
test("QStash auth/read, GitHub and owner-read failures retain their service classifications without bodies", async () => {
  const qstash = `https://qstash-eu-central-1.upstash.io/v2/schedules/${CANARY}`;
  const github = "https://api.github.com/repos/hash-j/WatchFlow/actions/variables/WATCHFLOW_DEV_CALENDAR_SCHEDULER_ENABLED";
  for (const [url, status, expected] of [[qstash, 401, "QSTASH_AUTH_FAILED"], [qstash, 403, "QSTASH_AUTH_FAILED"],
    [qstash, 500, "QSTASH_READ_FAILED"], [github, 401, "GITHUB_READ_FAILED"], [github, 500, "GITHUB_READ_FAILED"],
    ["https://ckwadpmvxieekjlsfcks.supabase.co/rest/v1/calendar_connections", 500, "APPLICATION_SNAPSHOT_FAILED"]]) {
    await assert.rejects(readPrecheckJson(url, "offline-token", {}, async (_url, options) => {
      assert.equal(options.method, "GET"); assert.equal(options.redirect, "error");
      return new Response("SECRET_RESPONSE_BODY", { status });
    }), error => { assert.equal(safeErrorCode(error), expected); assert.doesNotMatch(formatCanaryStop(error), /SECRET_RESPONSE/); return true; });
  }
  await assert.rejects(readPrecheckJson(qstash, "offline", {}, async () => { throw new TypeError("SECRET_NETWORK_MESSAGE"); }), /QSTASH_READ_FAILED/);
  await assert.rejects(readPrecheckJson(github, "offline", {}, async () => new Response("SECRET_INVALID_JSON", { status: 200 })), /GITHUB_READ_FAILED/);
});
test("real-hold allSettled preserves the underlying service failure and still attempts all four reads", async () => {
  const previous = process.env.GH_TOKEN; process.env.GH_TOKEN = "offline-github";
  try {
    let count = 0;
    await assert.rejects(readRealHolds(async url => {
      count++;
      if (url.startsWith("https://api.github.com")) throw new OwnerSafeFailure("GITHUB_READ_FAILED");
      return { body: {} };
    }), /GITHUB_READ_FAILED/);
    assert.equal(count, 4);
    await assert.rejects(readRealHolds(async () => { throw new Error("SECRET_UNKNOWN_HOLD_FAILURE"); }), error => {
      assert.equal(safeErrorCode(error), "REAL_SCHEDULE_STATE_INVALID"); return true;
    });
  } finally { if (previous === undefined) delete process.env.GH_TOKEN; else process.env.GH_TOKEN = previous; }
});
test("asset and canary lookup distinguish native failures, auth rejection and valid 404 absence", async () => {
  await assert.rejects(verifyAsset(async () => { throw new TypeError("SECRET_ASSET_NETWORK_MESSAGE"); }), /ASSET_VERIFY_FAILED/);
  await assert.rejects(readCanary(async () => { throw new TypeError("SECRET_LOOKUP_NETWORK_MESSAGE"); }), /CANARY_LOOKUP_FAILED/);
  await assert.rejects(readCanary(async () => new Response("SECRET_BODY", { status: 401 })), /QSTASH_AUTH_FAILED/);
  await assert.rejects(readCanary(async () => new Response("SECRET_BODY", { status: 500 })), /QSTASH_READ_FAILED/);
  assert.equal(await readCanary(async () => new Response(null, { status: 404 })), null);
});
test("precheck success is exact, ends before approval and uses the working no-login target guard", async () => {
  const h = harness(); await runCanary("--precheck-only", h.io);
  assert.equal(h.logs.at(-1), "CANARY_PRECHECK_PASS real_schedules_paused=true canary_absent=true application_data_unchanged=true");
  const source = readFileSync(resolve(root, "scripts/part18-ops-unit2d-log-canary.mjs"), "utf8");
  const target = source.slice(source.indexOf("function localTarget()"), source.indexOf("export function classifyPgFailure"));
  assert.match(target, /checkLocalTarget\(\)/); assert.match(target, /verifyRepositoryContracts\(\)/);
  assert.doesNotMatch(source, /E2E_USER_A_PASSWORD|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY|SUPABASE_ACCESS_TOKEN/);
});
