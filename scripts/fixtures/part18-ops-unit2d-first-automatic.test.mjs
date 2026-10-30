import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { CONTRACTS } from "../part18-ops-unit2d-sync-reenable.mjs";
import { CONFIRMATION, FIRST_SQL, RECOVERY_WINDOW, acceptDeliveryProof, assertClock, calendarAction, checkHolds, cronPlan, executionObserved, eventExists,
  parseArguments, parseFirstLogPage, probeLogs, readOwner, runFirst, snapshot, sourceInput, verifyEvent, verifyLease,
  verifyPre, verifySuccess, verifyRecoveryState, verifyRecoveryProvenance } from "../part18-ops-unit2d-first-automatic.mjs";

const root = resolve(import.meta.dirname, "../.."), owner = "11111111-1111-4111-8111-111111111111";
const connection = "e652e5c8-f08c-4736-88d8-073bce772ccc", job = "b9eb8a77-0723-675b-3f2b-8503a0781ab8";
const eventId = "a2ab6758f9fedbb0344d416ac00f2ca7d", schedule = "watchflow-dev-part18-ops-unit2d-calendar";
const destination = "https://watchflow-dev-ops.vercel.app/api/internal/calendar/sync";
const start = Date.UTC(2026, 9, 29, 12, 0), plan = cronPlan(start);
const previousEnvironment = { ...process.env };
process.env.QSTASH_TOKEN_EU = "OFFLINE_QSTASH_TOKEN";
process.env.GH_TOKEN = "OFFLINE_GITHUB_TOKEN";
process.env.WATCHFLOW_SCHEDULER_SECRET = "offline-scheduler-secret".repeat(2);
process.env.SUPABASE_DB_PASSWORD = "OFFLINE_DATABASE_PASSWORD";
process.env.SUPABASE_SECRET_KEY = "OFFLINE_SERVICE_READ_KEY";
process.env.E2E_USER_A_EMAIL = "offline@example.invalid";
test.after(() => { for (const name of Object.keys(process.env)) if (!(name in previousEnvironment)) delete process.env[name]; Object.assign(process.env, previousEnvironment); });
function body(file, name) {
  const source = readFileSync(resolve(root, "supabase/migrations", file), "utf8").replace(/\r\n/g, "\n");
  return source.slice(source.indexOf(`create or replace function public.${name}(`)).split("as $$\n")[1].split("$$;")[0];
}
function baseline() {
  const controlled = { id: job, user_id: owner, connection_id: connection, user_movie_id: "9152882e-291a-47a2-b964-c1a4a6dd9630",
    source_key: "589038a338f409210b819e6a7e0e871c", source_version: "8ca7b4e9cabaac13bdda45d0089f3169", desired_operation: "upsert",
    state: "pending", attempt_count: 0, attempt_limit: 5, available_at: new Date(start - 60000).toISOString(),
    created_at: new Date(start - 60000).toISOString(), updated_at: new Date(start - 60000).toISOString(),
    lease_token: null, lease_expires_at: null, error_code: null, completed_at: null, provider_status_code: null };
  const other = { id: "other-job", user_id: "other-user", desired_operation: "connection_cleanup", state: "succeeded", attempt_count: 1 };
  return { database_name: "postgres", qa_owner_count: 1, owner_connection_count: 1,
    connections: [{ id: connection, user_id: owner, provider: "google", provider_calendar_id: "primary", provider_subject: "SECRET_SUBJECT",
      status: "connected", sync_enabled: true, updated_at: "before", last_successful_sync_at: null, last_error_code: null, last_error_at: null }],
    credentials: [{ connection_id: connection, refresh_token_ciphertext: "SECRET_CIPHERTEXT" }], jobs: [controlled],
    connection_jobs: [job], job_inventory: [job, other.id], mapping_count: 0, unrelated_actionable: 0, actionable_cleanup: 0,
    due_and_below_limit: true, source_matches: true, selection_eligible: true, event_id: eventId,
    global_jobs: [controlled, other], global_mappings: [], global_job_count: 2, global_mapping_count: 0,
    source: { id: controlled.user_movie_id, user_id: owner, status: "scheduled", movie_id: 42, movie_title: "Offline fixture",
      scheduled_for: "2027-01-01T10:00:00.000Z", schedule_timezone: "UTC", runtime_minutes: 120 },
    functions: CONTRACTS.map(spec => ({ name: spec.name, args: spec.args, result: spec.result, returns_set: spec.set,
      definer: spec.definer, language: spec.language, settings: ['search_path=""'], body: body(spec.file, spec.name),
      service_execute: spec.name === "watchflow_claim_calendar_sync_jobs", authenticated_execute: spec.name === "watchflow_set_calendar_sync_enabled", public_execute: false, anon_execute: false })),
    finalizers: [{ args: "uuid, uuid, text, text, text, text, integer, text", result: "boolean", returns_set: false, definer: true, language: "plpgsql",
      settings: ['search_path=""'], body: body("202609300005_part_18j_d_disconnect_reconciliation.sql", "watchflow_finalize_calendar_sync_job"),
      service_execute: true, authenticated_execute: false, public_execute: false, anon_execute: false }],
    triggers: [{ name: "watchflow_calendar_connections_updated_at", type: 19, enabled: "O", function_schema: "public", function_name: "watchflow_set_updated_at",
      body: "begin new.updated_at := now(); return new; end;" }] };
}
function leased(before) {
  const data = structuredClone(before);
  Object.assign(data.jobs[0], { state: "leased", attempt_count: 1, lease_token: "22222222-2222-4222-8222-222222222222",
    lease_expires_at: new Date(plan.first + 120000).toISOString(), updated_at: new Date(plan.first).toISOString() });
  data.global_jobs[0] = data.jobs[0]; data.selection_eligible = false;
  return data;
}
function succeeded(before) {
  const data = leased(before), timestamp = new Date(plan.first + 2000).toISOString();
  Object.assign(data.jobs[0], { state: "succeeded", lease_token: null, lease_expires_at: null, completed_at: timestamp,
    updated_at: timestamp, provider_status_code: 201 });
  Object.assign(data.connections[0], { last_successful_sync_at: timestamp, updated_at: timestamp });
  data.global_mappings = [{ id: "new-mapping", user_id: owner, connection_id: connection, user_movie_id: data.jobs[0].user_movie_id,
    source_key: data.jobs[0].source_key, source_version: data.jobs[0].source_version, provider_calendar_id: "primary", provider_event_id: eventId,
    provider_etag: "offline-etag", sync_state: "synced", synced_at: timestamp }];
  data.global_mapping_count = 1; data.mapping_count = 1;
  return data;
}
function proof(delivered = true) {
  return { scheduleId: schedule, destination, method: "GET", messageId: "offline-message-id", createdAt: plan.first,
    delivered, ...(delivered ? { deliveredAt: plan.first + 2000 } : {}) };
}
const recoveryPage = () => JSON.parse(readFileSync(new URL("./part18-ops-unit2d-calendar-recovery-events.json", import.meta.url), "utf8")).page;
function recovered() {
  const data = succeeded(baseline()), stamp = new Date(RECOVERY_WINDOW.first + 2000).toISOString();
  Object.assign(data.jobs[0], { completed_at: stamp, updated_at: stamp });
  Object.assign(data.connections[0], { last_successful_sync_at: stamp, updated_at: stamp });
  Object.assign(data.global_mappings[0], { synced_at: stamp, created_at: stamp, updated_at: stamp });
  Object.assign(data.global_jobs[1], { created_at: new Date(start - 60000).toISOString(),
    updated_at: new Date(start - 60000).toISOString(), completed_at: new Date(start - 60000).toISOString() });
  return data;
}
function recoveryHarness() {
  const data = recovered(), calls = [], output = [];
  const forbidden = () => { throw new Error("MUTATION_OR_APPROVAL_FORBIDDEN"); };
  return { data, calls, output, io: {
    context: async () => ({ ownerId: owner }), target: () => calls.push("target"),
    snapshot: async () => { calls.push("snapshot"); return structuredClone(data); },
    holds: async paused => { assert.equal(paused, true); calls.push("holds-paused"); },
    probe: async (from, to) => { assert.equal(from, RECOVERY_WINDOW.from); assert.equal(to, RECOVERY_WINDOW.to);
      calls.push("retained-logs-get"); return parseFirstLogPage(recoveryPage(), false, from, to); },
    eventExists: async (_context, state, mapping) => { assert.equal(state.jobs[0].state, "succeeded");
      assert.equal(mapping.provider_event_id, eventId); calls.push("exact-event-get"); },
    log: line => output.push(line), action: forbidden, confirm: forbidden, deadline: forbidden,
    signals: forbidden, write: forbidden, googleAbsent: forbidden, decoderReady: forbidden,
  } };
}
test("recovery validates the already-succeeded exact fixture with no synthetic pre-run baseline", () => {
  const data = recovered(); assert.equal(verifyRecoveryState(data, owner).sync_state, "synced");
  for (const change of [d => d.connections[0].sync_enabled = false, d => d.connections[0].status = "reconnect_required",
    d => d.jobs[0].attempt_count = 2, d => d.jobs[0].lease_token = "unexpected", d => d.jobs[0].state = "pending",
    d => d.jobs[0].desired_operation = "delete", d => d.jobs[0].source_key = "wrong", d => d.jobs[0].source_version = "wrong",
    d => d.jobs[0].user_id = "other-user", d => d.credentials = [], d => d.selection_eligible = true,
    d => d.global_mappings[0].provider_event_id = "wrong", d => d.global_mappings[0].user_id = "other-user",
    d => d.global_mappings[0].sync_state = "error", d => d.mapping_count = 0, d => d.qa_owner_count = 0,
    d => d.actionable_cleanup = 1, d => d.unrelated_actionable = 1, d => d.global_job_count = 2001,
    d => d.jobs[0].completed_at = new Date(RECOVERY_WINDOW.second).toISOString()]) {
    const invalid = structuredClone(data); change(invalid); assert.throws(() => verifyRecoveryState(invalid, owner));
  }
});
test("recovery fails on unrelated retained activity or missing timestamp history", () => {
  for (const change of [d => d.global_jobs[1].updated_at = new Date(RECOVERY_WINDOW.first).toISOString(),
    d => delete d.global_jobs[1].created_at,
    d => d.global_jobs[1].completed_at = new Date(RECOVERY_WINDOW.first).toISOString()]) {
    const data = recovered(); change(data);
    assert.throws(() => verifyRecoveryState(data, owner), /UNRELATED_JOB_ACTIVITY_OR_HISTORY_INCOMPLETE/);
  }
});
test("recovery core schema tolerates opaque optional metadata without returning secrets", () => {
  const page = recoveryPage(); page.events[0].extraMetadata = { secret: "SECRET_EXTRA_VALUE" };
  const parsed = parseFirstLogPage(page, false, RECOVERY_WINDOW.from, RECOVERY_WINDOW.to);
  assert.equal(verifyRecoveryProvenance(parsed), true);
  assert.doesNotMatch(JSON.stringify(parsed), /SECRET|OFFLINE_REDACTED|responseHeaders|responseBody|queueName|extraMetadata/);
  for (const row of page.events) for (const key of Object.keys(row)) {
    if (!["time", "messageId", "state", "url", "scheduleId", "method", "labels", "responseStatus"].includes(key)) delete row[key];
  }
  assert.equal(verifyRecoveryProvenance(parseFirstLogPage(page, false, RECOVERY_WINDOW.from, RECOVERY_WINDOW.to)), true);
});
test("recovery requires one complete correlated lifecycle with strict security fields", () => {
  for (const change of [p => delete p.events[0].scheduleId, p => p.events[0].scheduleId = "wrong",
    p => p.events[0].url = "https://production.invalid/", p => p.events[0].method = "POST",
    p => p.events[0].labels = ["wrong"], p => p.events[0].messageId = "", p => p.events[1].messageId = "another-message",
    p => p.events[0].time = "timestamp", p => p.events[0].state = "UNKNOWN", p => p.events[0].responseStatus = "200",
    p => p.events[0].responseStatus = 503, p => delete p.events[0].responseStatus,
    p => p.events.splice(1, 1), p => p.events.push({ ...p.events[1], time: p.events[1].time + 1 }),
    p => p.cursor = "unverified", p => p.events = []]) {
    const page = recoveryPage(); change(page);
    assert.throws(() => verifyRecoveryProvenance(parseFirstLogPage(page, false, RECOVERY_WINDOW.from, RECOVERY_WINDOW.to)));
  }
  const duplicate = recoveryPage(); duplicate.events.push(...structuredClone(duplicate.events));
  assert.equal(verifyRecoveryProvenance(parseFirstLogPage(duplicate, false, RECOVERY_WINDOW.from, RECOVERY_WINDOW.to)), true);
});
test("recovery uses only the fixed historical first window and excludes every second-occurrence row", async () => {
  const request = [];
  const logs = await probeLogs(RECOVERY_WINDOW.from, RECOVERY_WINDOW.to, async url => {
    request.push(new URL(url)); return { body: recoveryPage(), paginationHeader: false };
  });
  assert.equal(verifyRecoveryProvenance(logs), true);
  assert.equal(request[0].searchParams.get("scheduleId"), schedule);
  assert.equal(request[0].searchParams.get("fromDate"), String(RECOVERY_WINDOW.from));
  assert.equal(request[0].searchParams.get("toDate"), String(RECOVERY_WINDOW.to));
  for (const time of [RECOVERY_WINDOW.second, RECOVERY_WINDOW.to + 1]) {
    const page = recoveryPage(); page.events[0].time = time;
    assert.throws(() => parseFirstLogPage(page, false, RECOVERY_WINDOW.from, RECOVERY_WINDOW.to), /EVENT_TIME_INVALID/);
  }
  const early = recoveryPage(); early.events[2].time = RECOVERY_WINDOW.from;
  assert.throws(() => verifyRecoveryProvenance(parseFirstLogPage(early, false, RECOVERY_WINDOW.from, RECOVERY_WINDOW.to)), /FIRST_WINDOW_PROVENANCE_INVALID/);
});
test("explicit recovery performs only reads and never reaches the original first-run mutation engine", async () => {
  const h = recoveryHarness(); await runFirst("--recover", h.io);
  assert.equal(h.calls.filter(call => call === "snapshot").length, 2);
  assert.equal(h.calls.filter(call => call === "holds-paused").length, 2);
  assert.equal(h.calls.filter(call => call === "exact-event-get").length, 1);
  assert.match(h.output.join("\n"), /FIRST_AUTOMATIC_RECOVERED_PASS automatic_delivery_provenance_verified=true/);
  assert.match(h.output.join("\n"), /historical_baseline_available=false/);
  assert.doesNotMatch(h.output.join("\n"), /SECRET|offline-calendar-message|11111111|OFFLINE_DATABASE_PASSWORD/);
});
test("failed recovery has no compensating pause, resume, retry, reset, approval or write", async () => {
  for (const stage of ["snapshot", "holds", "probe", "eventExists"]) {
    const h = recoveryHarness(); h.io[stage] = async () => { throw new Error("OFFLINE_READ_FAILURE"); };
    await assert.rejects(runFirst("--recover", h.io), /OFFLINE_READ_FAILURE/);
    assert.equal(h.output.some(line => line.startsWith("FIRST_AUTOMATIC_RECOVERED_PASS")), false);
  }
});
test("final recovery state changes fail closed even when the initial state and logs pass", async () => {
  const h = recoveryHarness(), read = h.io.snapshot; let count = 0;
  h.io.snapshot = async () => { const data = await read(); if (++count === 2) data.credentials[0].refresh_token_ciphertext = "CHANGED"; return data; };
  await assert.rejects(runFirst("--recover", h.io), /APPLICATION_STATE_CHANGED_DURING_READS/);
  assert.equal(h.output.length, 0);
});
test("recovery Google transport refreshes only in memory then performs the exact primary-event GET", async () => {
  const data = recovered(), calls = [], input = sourceInput(data);
  const expected = { id: eventId, summary: input.movieTitle, start: { dateTime: input.scheduledFor, timeZone: input.scheduleTimezone },
    end: { dateTime: "2027-01-01T12:00:00.000Z", timeZone: input.scheduleTimezone },
    extendedProperties: { private: { watchflowSourceKey: input.sourceKey, watchflowSourceVersion: input.sourceVersion } } };
  const event = { ...expected, status: "confirmed", etag: "offline-etag", description: "Scheduled in WatchFlow. View movie: /library/42" };
  const access = { accessToken: "OFFLINE_ACCESS", replacementRefreshToken: null };
  const credential = { connectionId: connection, ciphertext: Buffer.from("offline"), nonce: Buffer.from("offline"), authTag: Buffer.from("offline") };
  const context = { ownerId: owner, buildEvent: () => expected, path: {
    read: async id => { assert.equal(id, owner); return credential; }, decrypt: () => "OFFLINE_REFRESH",
    refresh: async (token, read) => { assert.equal(token, "OFFLINE_REFRESH");
      await read("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ grant_type: "refresh_token" }) }); return access; },
  } };
  await eventExists(context, data, data.global_mappings[0], async (url, init) => {
    calls.push({ url, method: init.method }); assert.equal(init.redirect, "error");
    if (url === "https://oauth2.googleapis.com/token") return new Response("{}", { status: 200 });
    assert.equal(url, `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`);
    assert.equal(init.method, "GET"); return Response.json(event);
  });
  assert.deepEqual(calls.map(call => call.method), ["POST", "GET"]);
  assert.equal(access.accessToken, null);
  for (const name of ["ciphertext", "nonce", "authTag"]) assert.equal(credential[name].every(byte => byte === 0), true);
  let eventRequests = 0;
  context.path.refresh = async () => ({ accessToken: "OFFLINE_ACCESS", replacementRefreshToken: "DO_NOT_PERSIST" });
  await assert.rejects(eventExists(context, data, data.global_mappings[0], async () => { eventRequests++; }), /FRESH_GOOGLE_TOKEN_INVALID/);
  assert.equal(eventRequests, 0);
});
function harness(scenario = "unverified") {
  const before = baseline(), calls = [], logs = [];
  const state = { time: start, active: false, resumed: false, deadline: null, pauseVerified: false };
  const data = () => !state.resumed || state.time < plan.first || scenario === "timeout" ? structuredClone(before) :
    state.time < plan.first + 2000 ? leased(before) : succeeded(before);
  const io = { decoderReady: async () => {}, context: async () => ({ ownerId: owner }), target: () => {}, snapshot: async () => { calls.push("snapshot"); return data(); },
    holds: async expected => { calls.push("holds"); assert.equal(state.active, !expected); return {}; },
    googleAbsent: async () => calls.push("google-exact-absent-get"), eventExists: async () => calls.push("google-exact-present-get"),
    confirm: async () => CONFIRMATION, now: () => state.time, mono: () => state.time,
    sleep: async ms => {
      state.time += ms;
      if (state.deadline && state.time >= state.deadline.at) { const fn = state.deadline.fn; state.deadline = null; fn(); }
    },
    deadline: (fn, ms) => { state.deadline = { fn, at: state.time + ms }; return () => { state.deadline = null; }; },
    signals: handler => { state.signal = handler; return () => { state.signal = null; }; },
    action: async action => { calls.push({ action, time: state.time }); if (action === "resume") { state.active = true; state.resumed = true; } else state.active = false; },
    verifyPaused: async () => { calls.push("pause-get"); assert.equal(state.active, false); state.pauseVerified = true; },
    probe: async () => {
      if (!state.resumed || state.time < plan.first || scenario === "timeout" || scenario === "missing-proof") return parseFirstLogPage({ events: [] });
      if (scenario === "success") return { detected: true, verified: true, proof: proof(state.time >= plan.first + 2000) };
      return parseFirstLogPage({ events: [{ header: { Authorization: "SECRET_HEADER" }, responseBody: "SECRET_RESPONSE", scheduleId: schedule }] });
    }, log: line => logs.push(line) };
  return { before, state, calls, logs, io };
}
test("UTC cron planner handles minute/hour/day boundaries with a strict single-occurrence window", () => {
  for (const now of [start, start + 59999, Date.UTC(2026, 9, 29, 23, 58), Date.UTC(2026, 9, 29, 23, 59, 59)]) {
    const p = cronPlan(now);
    assert.equal(new Date(p.first).getUTCMinutes() % 5, 4); assert.equal(new Date(p.first).getUTCSeconds(), 0);
    assert.ok(p.first >= now + 90000); assert.equal(p.second - p.first, 300000);
    assert.ok(p.pauseCutoff + 200000 < p.second); assert.ok(p.latestResume < p.first);
  }
  assert.throws(() => assertClock(6000, 2000, { wall: 0, mono: 0 }), /CLOCK_DRIFT/);
});
test("explicit mode and exact typed phrase prevent accidental schedule mutation", async () => {
  assert.equal(parseArguments(["--recover"]), "--recover");
  assert.throws(() => parseArguments(["--first-run"]), /FIRST_EXECUTION_ALREADY_OCCURRED_USE_RECOVERY/);
  for (const args of [[], ["--first-run", "extra"], ["--run"]]) assert.throws(() => parseArguments(args));
  const h = harness(); h.io.confirm = async () => `${CONFIRMATION} `;
  await assert.rejects(runFirst("--first-run", h.io), /TYPED_CONFIRMATION_MISMATCH/);
  assert.equal(h.calls.some(call => typeof call === "object"), false);
});
test("precheck-only checks the live-contract/fixture path without schedule writes", async () => {
  const h = harness(); await runFirst("--precheck-only", h.io);
  assert.equal(h.calls.filter(call => call === "snapshot").length, 2);
  assert.equal(h.calls.some(call => typeof call === "object"), false);
});
test("preconditions pin success semantics, identity, source, complete inventories, and claimability", () => {
  const base = baseline(); assert.equal(typeof verifyPre(base, owner), "string");
  for (const change of [d => d.connections[0].sync_enabled = false, d => d.jobs[0].attempt_count = 1,
    d => d.global_job_count = 2001, d => d.global_mapping_count = 1, d => d.selection_eligible = false,
    d => d.finalizers[0].body += "extra", d => d.finalizers[0].public_execute = true, d => d.source.user_id = "other-user"]) {
    const data = structuredClone(base); change(data); assert.throws(() => verifyPre(data, owner));
  }
});
test("only exact calendar resume/pause POST paths are permitted; never the executor destination", async () => {
  const calls = [];
  for (const action of ["resume", "pause"]) await calendarAction(action, "offline-token", async (url, init) => {
    calls.push({ url, method: init.method }); assert.equal(init.redirect, "error"); return new Response(null, { status: 200 });
  });
  await assert.rejects(calendarAction("replace", "offline-token"), /UNAPPROVED/);
  assert.deepEqual(calls, ["resume", "pause"].map(action => ({ url: `https://qstash-eu-central-1.upstash.io/v2/schedules/${schedule}/${action}`, method: "POST" })));
});
test("owner discovery supplies the required apikey only to the pinned development connection GET", async () => {
  const result = await readOwner(async (url, token, headers) => {
    assert.equal(url, `https://ckwadpmvxieekjlsfcks.supabase.co/rest/v1/calendar_connections?select=user_id&id=eq.${connection}`);
    assert.equal(token, process.env.SUPABASE_SECRET_KEY); assert.equal(headers.apikey, process.env.SUPABASE_SECRET_KEY);
    return { body: [{ user_id: owner }] };
  });
  assert.equal(result, owner);
  await assert.rejects(readOwner(async () => ({ body: [] })), /QA_OWNER_READ_FAILED/);
});
test("empty events are query evidence only; unknown nonempty rows fail without exposing values", () => {
  assert.deepEqual(parseFirstLogPage({ events: [] }), { detected: false, verified: false, cursor: null });
  assert.throws(() => parseFirstLogPage({ events: [{ scheduleId: schedule, header: { Authorization: "SECRET_AUTH" }, body: "SECRET_BODY", SECRET_KEY_NAME: "SECRET_VALUE" }] }), /QSTASH_EVENT_STATE_UNKNOWN/);
  for (const page of [{}, { logs: [] }, { events: null }, { events: [], logs: [] }, { events: [], nextCursor: "x" }, { events: [], cursor: null }]) assert.throws(() => parseFirstLogPage(page));
  assert.throws(() => parseFirstLogPage({ events: [] }, true), /PAGINATION_HEADER/);
});
test("the production probe uses the exact live empty fixture, follows cursors and rejects incomplete pagination", async () => {
  const fixture = JSON.parse(readFileSync(new URL("./part18-ops-unit2d-qstash-empty-events.json", import.meta.url), "utf8"));
  const requests = [];
  const result = await probeLogs(start, start + 1000, async url => {
    const query = new URL(url).searchParams; requests.push(query);
    return { body: requests.length === 1 ? { events: [], cursor: "next" } : fixture, paginationHeader: false };
  });
  assert.equal(result.detected, false); assert.equal(result.verified, false);
  assert.equal(requests[1].get("cursor"), "next");
  assert.equal(requests[0].get("scheduleId"), schedule); assert.equal(requests[0].get("fromDate"), String(start));
  await assert.rejects(probeLogs(start, start + 1, async () => ({ body: { events: [], cursor: "loop" } })), /CURSOR_LOOP/);
  let i = 0;
  await assert.rejects(probeLogs(start, start + 1, async () => ({ body: { events: [], cursor: `page-${++i}` } })), /PAGINATION_INCOMPLETE/);
  await assert.rejects(probeLogs(start, start + 1, async () => ({ body: fixture, paginationHeader: true })), /PAGINATION_HEADER/);
});
test("unverified first nonempty events cause immediate shared pause and stop without fabricated provenance", async () => {
  const h = harness(); await assert.rejects(runFirst("--first-run", h.io), /QSTASH_EVENT_STATE_UNKNOWN/);
  const writes = h.calls.filter(call => typeof call === "object");
  assert.deepEqual(writes.map(call => call.action), ["resume", "pause"]);
  assert.equal(writes[1].time, plan.first); assert.equal(h.state.pauseVerified, true);
  assert.equal(h.state.active, false);
  assert.doesNotMatch(h.logs.join("\n"), /SECRET|OFFLINE_DATABASE_PASSWORD|offline-message-id/);
  assert.equal(h.logs.some(line => line.startsWith("FIRST_AUTOMATIC_PASS")), false);
});
test("no-execution timeout pauses at the hard cutoff before the second cron occurrence", async () => {
  const h = harness("timeout"); await assert.rejects(runFirst("--first-run", h.io), /HARD_CUTOFF/);
  const pause = h.calls.find(call => call.action === "pause");
  assert.equal(pause.time, plan.pauseCutoff); assert.ok(pause.time < plan.second);
  assert.equal(h.calls.filter(call => call.action === "resume").length, 1); assert.equal(h.state.active, false);
});
test("resume response loss still triggers one pause POST and verifies its GET", async () => {
  const h = harness(), action = h.io.action;
  h.io.action = async name => { await action(name); if (name === "resume") throw new Error("SECRET_RAW_RESPONSE"); };
  await assert.rejects(runFirst("--first-run", h.io), /UNEXPECTED_FAILURE/);
  assert.deepEqual(h.calls.filter(call => typeof call === "object").map(call => call.action), ["resume", "pause"]);
  assert.equal(h.state.pauseVerified, true); assert.doesNotMatch(h.logs.join("\n"), /SECRET_RAW/);
});
test("interrupt and clock drift while active pause the calendar and stop before a delivery", async () => {
  for (const failure of ["interrupt", "clock"]) {
    const h = harness();
    if (failure === "interrupt") {
      const sleep = h.io.sleep;
      h.io.sleep = async ms => { if (h.state.resumed && h.state.signal) h.state.signal(); await sleep(ms); };
    } else {
      const action = h.io.action;
      h.io.action = async name => { await action(name); if (name === "resume") h.io.mono = () => h.state.time - 10000; };
    }
    await assert.rejects(runFirst("--first-run", h.io));
    assert.equal(h.calls.filter(call => call.action === "pause").length, 1); assert.equal(h.state.active, false);
  }
});
test("missed safe resume window never resumes and issues the approved fail-safe pause", async () => {
  const h = harness(); let count = 0;
  h.io.googleAbsent = async () => { if (++count === 3) h.state.time = plan.first - 9000; };
  await assert.rejects(runFirst("--first-run", h.io), /SAFE_RESUME_WINDOW_MISSED/);
  assert.deepEqual(h.calls.filter(call => typeof call === "object").map(call => call.action), ["pause"]);
});
test("a lost pause response is verified without retry and fails closed even if GET proves paused", async () => {
  const h = harness(), action = h.io.action;
  h.io.action = async name => { await action(name); if (name === "pause") throw new Error("SECRET_PAUSE_ERROR"); };
  await assert.rejects(runFirst("--first-run", h.io), /FAIL_SAFE_PAUSE_OR_FINAL_CHECK_FAILED/);
  assert.equal(h.calls.filter(call => call.action === "pause").length, 1); assert.equal(h.state.pauseVerified, true);
});
test("a failed pause verification is never reported paused or retried automatically", async () => {
  const h = harness(); h.io.verifyPaused = async () => { throw new Error("offline GET failed"); };
  await assert.rejects(runFirst("--first-run", h.io), /FAIL_SAFE_PAUSE_OR_FINAL_CHECK_FAILED/);
  assert.equal(h.calls.filter(call => call.action === "pause").length, 1);
  assert.ok(h.logs.some(line => line.includes('"calendar_pause_verified":false')));
});
test("source or holds changed after approval prevent resume", async () => {
  const h = harness(), confirm = h.io.confirm;
  h.io.confirm = async () => { h.before.source.movie_title = "changed"; return confirm(); };
  await assert.rejects(runFirst("--first-run", h.io), /FAIL_SAFE_PAUSE_OR_FINAL_CHECK_FAILED/);
  assert.ok(h.logs.some(line => line.includes("POST_APPROVAL_STATE_CHANGED") && line.includes("CONTROLLED_SOURCE_CHANGED")));
  assert.deepEqual(h.calls.filter(call => typeof call === "object").map(call => call.action), ["pause"]);
});
test("only the controlled successful job/mapping may change; cross-user and cleanup mutations fail", () => {
  const before = baseline(), after = succeeded(before), leaseState = {};
  verifyLease(leased(before), plan, leaseState); assert.equal(leaseState.leaseObserved, true);
  assert.equal(verifySuccess(before, after, plan, leaseState).provider_event_id, eventId);
  assert.equal(executionObserved(before, after), true);
  for (const change of [d => d.global_jobs[1].attempt_count++, d => d.global_jobs[1].state = "leased",
    d => d.global_mappings[0].connection_id = "other-connection", d => d.connections[0].sync_enabled = false,
    d => d.jobs[0].attempt_count = 2, d => d.jobs[0].lease_token = "uncleared", d => d.jobs[0].state = "retryable",
    d => d.global_mappings[0].provider_event_id = "wrong", d => d.global_mappings[0].sync_state = "error",
    d => d.connections[0].last_successful_sync_at = new Date(plan.second).toISOString(), d => d.global_mappings[0].synced_at = new Date(plan.second).toISOString()]) {
    const data = structuredClone(after); change(data); assert.throws(() => verifySuccess(before, data, plan, {}));
  }
  const changed = leased(before); changed.jobs[0].lease_token = "33333333-3333-4333-8333-333333333333";
  assert.throws(() => verifyLease(changed, plan, leaseState), /LEASE_LIFECYCLE/);
});
test("successful terminal data alone cannot establish automatic QStash provenance", async () => {
  const h = harness("missing-proof"); await assert.rejects(runFirst("--first-run", h.io), /AUTOMATIC_DELIVERY_PROVENANCE_UNVERIFIED/);
  assert.equal(h.state.active, false); assert.equal(h.calls.filter(call => call.action === "pause").length, 1);
  assert.ok(h.logs.some(line => line.includes('"automatic_delivery_provenance_verified":false')));
});
test("normalized proof must correlate one exact scheduled message in the first occurrence window", () => {
  const state = {}; acceptDeliveryProof(proof(false), plan, state); acceptDeliveryProof(proof(true), plan, state);
  for (const change of [p => p.messageId = "another", p => p.scheduleId = "another", p => p.destination = "https://production.invalid",
    p => p.method = "POST", p => p.createdAt = plan.second, p => p.deliveredAt = plan.second]) {
    const p = proof(); change(p); assert.throws(() => acceptDeliveryProof(p, plan, state));
  }
});
test("future verified decoder success exercises the full success contract without any real execution", async () => {
  const h = harness("success"); await runFirst("--first-run", h.io);
  assert.equal(h.state.active, false); assert.equal(h.calls.filter(call => call.action === "pause").length, 1);
  assert.ok(h.calls.includes("google-exact-present-get"));
  assert.ok(h.logs.some(line => line.startsWith("FIRST_AUTOMATIC_PASS")));
});
test("the final post-pause snapshot is validated and cannot silently override a prior success check", async () => {
  const h = harness("success"), read = h.io.snapshot;
  let eventRead = false, afterEvent = 0;
  h.io.eventExists = async () => { eventRead = true; };
  h.io.snapshot = async () => {
    const data = await read();
    if (eventRead && ++afterEvent === 2) data.global_jobs[1].attempt_count++;
    return data;
  };
  await assert.rejects(runFirst("--first-run", h.io), /FAIL_SAFE_PAUSE_OR_FINAL_CHECK_FAILED/);
  assert.equal(h.state.active, false);
  assert.equal(h.logs.some(line => line.startsWith("FIRST_AUTOMATIC_PASS")), false);
  assert.ok(h.logs.some(line => line.includes("UNRELATED_OR_CROSS_USER_JOB_CHANGED")));
});
test("event validation checks controlled title/times/timezone/private source IDs and mapping etag", () => {
  const data = succeeded(baseline()), mapping = { ...data.global_mappings[0], movieId: 42 };
  const input = sourceInput(data);
  const expected = { id: eventId, summary: input.movieTitle, start: { dateTime: input.scheduledFor, timeZone: input.scheduleTimezone },
    end: { dateTime: "2027-01-01T12:00:00.000Z", timeZone: input.scheduleTimezone },
    extendedProperties: { private: { watchflowSourceKey: input.sourceKey, watchflowSourceVersion: input.sourceVersion } } };
  const event = { ...structuredClone(expected), status: "confirmed", etag: "offline-etag", description: "Scheduled in WatchFlow. View movie: https://watchflow-dev-ops.vercel.app/library/42" };
  verifyEvent(event, expected, mapping);
  for (const change of [e => e.summary = "wrong", e => e.status = "cancelled", e => e.etag = "wrong",
    e => e.start.dateTime = "2027-01-02T10:00:00Z", e => e.extendedProperties.private.watchflowSourceVersion = "wrong",
    e => e.description = "Scheduled in WatchFlow. View movie: https://production.invalid/library/42"]) {
    const invalid = structuredClone(event); change(invalid); assert.throws(() => verifyEvent(invalid, expected, mapping));
  }
});
test("snapshot remains SELECT-only with no claim/finalize invocation or row lock", async () => {
  const queries = [];
  class Client { on() {} async connect() {} async end() {} async query(sql) { queries.push(sql); return sql === FIRST_SQL ? { rows: [{ snapshot: baseline() }] } : {}; } }
  await snapshot({ ownerId: owner }, Client);
  assert.equal(queries[0], "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); assert.equal(queries[1], FIRST_SQL); assert.equal(queries[2], "ROLLBACK");
  assert.match(FIRST_SQL, /global_jobs/); assert.match(FIRST_SQL, /global_mappings/);
  assert.doesNotMatch(FIRST_SQL, /\b(update|insert|delete|for update)\b|watchflow_(claim|finalize)_calendar_sync_\w+\s*\(/i);
});
test("the real hold checker validates paused/active calendar states without changing reminders or gates", async () => {
  const now = Date.now(), secret = process.env.WATCHFLOW_SCHEDULER_SECRET;
  const calendar = { scheduleId: schedule, destination, method: "GET", cron: "4-59/5 * * * *", retries: 0, timeout: 55000,
    isPaused: true, labels: ["watchflow-dev", "part18-ops-unit2d", "calendar"], header: { Authorization: ["REDACTED:" + createHash("sha256").update(`Bearer ${secret}`).digest("hex")] } };
  const read = async url => ({ serverTime: now, body: url.endsWith(`/schedules/${schedule}`) ? calendar : url.includes("/schedules/") ?
    { scheduleId: "watchflow-dev-part18-ops-unit2d-reminders", destination: "https://watchflow-dev-ops.vercel.app/api/internal/notifications/scheduled-reminders", isPaused: true } :
    { name: url.split("/").at(-1), value: "false" } });
  await checkHolds(true, read, now); calendar.isPaused = false; await checkHolds(false, read, now);
  await assert.rejects(checkHolds(true, read, now), /PAUSED_STATE/);
  await assert.rejects(checkHolds(false, read, now + 10000), /CLOCK_UNVERIFIED/);
});
