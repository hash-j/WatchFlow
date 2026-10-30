import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { CONFIRMATION, CONTRACTS, SNAPSHOT_SQL, SafeFailure, assertConfirmation, compareEvidence,
  googleAbsent, parseArguments, poolerConfiguration, qaFetchGuard, readHolds, readSnapshot,
  runCheckpoint, sanitizedObservation, validateFixture, verifyRepositoryContracts } from "../part18-ops-unit2d-sync-reenable.mjs";

const root = resolve(import.meta.dirname, "../..");
const owner = "11111111-1111-4111-8111-111111111111";
const connection = "e652e5c8-f08c-4736-88d8-073bce772ccc";
const job = "b9eb8a77-0723-675b-3f2b-8503a0781ab8";
const origin = "https://ckwadpmvxieekjlsfcks.supabase.co";
const marker = "postgresql://postgres.ckwadpmvxieekjlsfcks@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres";
const envBefore = { ...process.env };
test.after(() => { for (const key of Object.keys(process.env)) if (!(key in envBefore)) delete process.env[key]; Object.assign(process.env, envBefore); });
process.env.E2E_USER_A_EMAIL = "offline@example.invalid";
process.env.SUPABASE_DB_PASSWORD = "OFFLINE_PASSWORD_NOT_FOR_LOGGING";
process.env.QSTASH_TOKEN_EU = "OFFLINE_QSTASH_NOT_FOR_LOGGING";
process.env.GH_TOKEN = "OFFLINE_GITHUB_NOT_FOR_LOGGING";
process.env.WATCHFLOW_SCHEDULER_SECRET = "offline-scheduler-secret".repeat(2);
function functionRows() {
  return CONTRACTS.map(spec => {
    const source = readFileSync(resolve(root, "supabase/migrations", spec.file), "utf8").replace(/\r\n/g, "\n");
    const body = source.slice(source.indexOf(`create or replace function public.${spec.name}(`)).split("as $$\n")[1].split("$$;")[0];
    return { name: spec.name, args: spec.args, result: spec.result, returns_set: spec.set, definer: spec.definer,
      language: spec.language, settings: ['search_path=""'], body, authenticated_execute: spec.name === "watchflow_set_calendar_sync_enabled",
      service_execute: spec.name === "watchflow_claim_calendar_sync_jobs", anon_execute: false, public_execute: false };
  });
}
function fixture(enabled = false) {
  return { database_name: "postgres", qa_owner_count: 1, owner_connection_count: 1,
    connections: [{ id: connection, user_id: owner, provider: "google", provider_calendar_id: "primary", provider_subject: "DO_NOT_PRINT_SUBJECT",
      status: "connected", sync_enabled: enabled, updated_at: enabled ? "after" : "before", granted_scopes: ["offline-scope"] }],
    credentials: [{ connection_id: connection, refresh_token_ciphertext: "\\x01", refresh_token_nonce: `\\x${"00".repeat(12)}`,
      refresh_token_auth_tag: `\\x${"00".repeat(16)}`, encryption_key_version: 1 }],
    jobs: [{ id: job, connection_id: connection, user_id: owner, user_movie_id: "9152882e-291a-47a2-b964-c1a4a6dd9630",
      source_key: "589038a338f409210b819e6a7e0e871c", source_version: "8ca7b4e9cabaac13bdda45d0089f3169", desired_operation: "upsert",
      state: "pending", attempt_count: 0, attempt_limit: 5, lease_token: null, lease_expires_at: null, available_at: "past" }],
    connection_jobs: [job], job_inventory: [job], mapping_count: 0, unrelated_actionable: 0, actionable_cleanup: 0,
    due_and_below_limit: true, source_matches: true, selection_eligible: enabled, event_id: "a2ab6758f9fedbb0344d416ac00f2ca7d",
    functions: functionRows(), triggers: [{ name: "watchflow_calendar_connections_updated_at", type: 19, enabled: "O", function_schema: "public",
      function_name: "watchflow_set_updated_at", body: "begin new.updated_at := now(); return new; end;" }] };
}
function harness() {
  const calls = [], logs = [];
  const context = { ownerId: owner, boundary: { armed: false, used: false }, enabled: false };
  const io = { context: async () => context, target: () => calls.push("target"), identity: async () => calls.push("identity"),
    snapshot: async () => { calls.push("snapshot"); return fixture(context.enabled); },
    holds: async () => { calls.push("holds"); return { calendar_paused: true, reminder_paused: true, github_gates_false: true }; },
    google: async () => calls.push("google-exact-get"), confirm: async () => { calls.push("confirmation"); return CONFIRMATION; },
    mutate: async () => { calls.push("owner-rpc"); assert.equal(context.boundary.armed, true); context.enabled = true; return { data: true, error: null }; },
    log: value => logs.push(value) };
  return { context, calls, logs, io };
}
test("reviewed owner RPC and claim/helper bodies match their pins", verifyRepositoryContracts);
test("only explicit modes and exact typed approval are accepted", () => {
  for (const args of [[], ["--reenable", "extra"], ["--run"], ["--postcheck-only"]]) assert.throws(() => parseArguments(args));
  assert.equal(parseArguments(["--precheck-only"]), "--precheck-only");
  assert.equal(parseArguments(["--reenable"]), "--reenable");
  assertConfirmation(CONFIRMATION);
  for (const answer of ["ABORT", "", `${CONFIRMATION} `, CONFIRMATION.toLowerCase()]) assert.throws(() => assertConfirmation(answer));
});
test("precheck-only performs every safety check without approval or the mutation boundary", async () => {
  const h = harness(); await runCheckpoint("--precheck-only", h.io);
  assert.equal(h.calls.includes("confirmation") || h.calls.includes("owner-rpc"), false);
  assert.equal(h.context.boundary.armed || h.context.boundary.used, false);
  assert.equal(h.calls.filter(call => call === "snapshot").length, 2);
  assert.equal(h.calls.filter(call => call === "holds").length, 2);
  assert.ok(h.calls.includes("google-exact-get"));
});
test("reenable makes one owner RPC after full post-confirmation rechecks and leaves the job eligible/unclaimed", async () => {
  const h = harness(); await runCheckpoint("--reenable", h.io);
  assert.equal(h.calls.filter(call => call === "owner-rpc").length, 1);
  const approved = h.calls.indexOf("confirmation"), written = h.calls.indexOf("owner-rpc");
  assert.ok(h.calls.slice(approved + 1, written).includes("target"));
  assert.equal(h.calls.slice(approved + 1, written).filter(call => call === "snapshot").length, 2);
  assert.ok(h.calls.slice(approved + 1, written).includes("google-exact-get"));
  assert.equal(h.context.boundary.armed, false);
  const state = JSON.parse(h.logs.find(line => line.startsWith("SYNC_REENABLE_POST_STATE ")).split("SYNC_REENABLE_POST_STATE ")[1]);
  assert.equal(state.sync_enabled, true); assert.equal(state.attempt_count, 0); assert.equal(state.lease_null, true);
  assert.equal(state.claim_selection_eligible, true); assert.equal(state.calendar_paused, true); assert.equal(state.reminder_paused, true);
  assert.ok(h.logs.some(line => line.startsWith("SYNC_REENABLE_PASS")));
  assert.doesNotMatch(h.logs.join("\n"), /DO_NOT_PRINT|OFFLINE_PASSWORD|ciphertext|provider_subject/);
});
test("incorrect approval and changed holds after approval prevent the owner RPC", async () => {
  for (const failure of ["approval", "holds"]) {
    const h = harness();
    if (failure === "approval") h.io.confirm = async () => "ABORT";
    else {
      let approved = false; h.io.confirm = async () => { approved = true; return CONFIRMATION; };
      h.io.holds = async () => { if (approved) throw new SafeFailure("CALENDAR_UNPAUSED"); };
    }
    await assert.rejects(runCheckpoint("--reenable", h.io));
    assert.equal(h.calls.includes("owner-rpc"), false);
  }
});
test("preconditions fail for unsafe owner/connection/job/isolation/claimability/security state", () => {
  const changes = [d => d.qa_owner_count = 0, d => d.connections[0].user_id = "other", d => d.connections[0].sync_enabled = true,
    d => d.connections[0].status = "reconnect_required", d => d.credentials = [], d => d.jobs[0].attempt_count = 1,
    d => d.jobs[0].lease_token = "leased", d => d.jobs[0].source_version = "changed", d => d.jobs[0].desired_operation = "delete",
    d => d.mapping_count = 1, d => d.unrelated_actionable = 1, d => d.actionable_cleanup = 1,
    d => d.connection_jobs.push("new"), d => d.due_and_below_limit = false, d => d.source_matches = false,
    d => d.event_id = "other", d => d.selection_eligible = true, d => d.functions.push(d.functions[0]),
    d => d.functions[0].body += "extra", d => d.functions[0].authenticated_execute = false,
    d => d.functions[0].service_execute = true, d => d.functions[0].public_execute = true,
    d => d.functions[0].settings = ["search_path=public"], d => d.triggers.push(d.triggers[0])];
  for (const change of changes) { const data = fixture(); change(data); assert.throws(() => validateFixture(data, owner, false)); }
});
test("only sync_enabled and its documented updated_at may change", () => {
  const before = validateFixture(fixture(), owner, false);
  compareEvidence(before, validateFixture(fixture(true), owner, true), true);
  for (const change of [d => d.credentials[0].refresh_token_ciphertext = "\\x02", d => d.connections[0].provider_subject = "other",
    d => d.connections[0].granted_scopes.push("new"), d => d.jobs[0].available_at = "changed", d => d.job_inventory.push("new-job")]) {
    const after = fixture(true); change(after);
    assert.throws(() => compareEvidence(before, validateFixture(after, owner, true), true));
  }
});
test("a postcheck failure never retries or repairs and still inspects database, Google, and holds", async () => {
  for (const failure of ["job", "google", "holds"]) {
    const h = harness(), read = h.io.snapshot, holds = h.io.holds, google = h.io.google;
    if (failure === "job") h.io.snapshot = async () => { const data = await read(); if (h.context.enabled) data.jobs[0].attempt_count = 1; return data; };
    if (failure === "google") h.io.google = async (...args) => { await google(...args); if (h.context.enabled) throw new SafeFailure("GOOGLE_EVENT_PRESENT"); };
    if (failure === "holds") h.io.holds = async () => { await holds(); if (h.context.enabled) throw new SafeFailure("GITHUB_GATE_NOT_FALSE"); };
    await assert.rejects(runCheckpoint("--reenable", h.io));
    assert.equal(h.calls.filter(call => call === "owner-rpc").length, 1);
    assert.equal(h.calls.filter(call => call === "snapshot").length, 6);
    assert.equal(h.calls.filter(call => call === "google-exact-get").length, 3);
    assert.equal(h.calls.filter(call => call === "holds").length, 6);
    assert.ok(h.logs.some(line => line.includes('"sync_enabled":true')));
    assert.equal(h.logs.some(line => line.startsWith("SYNC_REENABLE_PASS")), false);
    assert.equal(h.context.enabled, true);
  }
});
test("a lost RPC response still observes the actual post-state and never retries", async () => {
  const h = harness(); h.io.mutate = async () => { h.calls.push("owner-rpc"); h.context.enabled = true; throw new Error("SECRET_RAW_ERROR"); };
  await assert.rejects(runCheckpoint("--reenable", h.io), /RPC_UNEXPECTED_FAILURE/);
  assert.equal(h.calls.filter(call => call === "owner-rpc").length, 1);
  assert.ok(h.logs.some(line => line.includes('"sync_enabled":true') && line.includes('"rpc_reported_success":false')));
  assert.doesNotMatch(h.logs.join("\n"), /SECRET_RAW_ERROR/);
});
test("QA transport allows only authentication and one armed true RPC; no direct writes or claims", async () => {
  const boundary = { armed: false, used: false }, calls = [];
  const fetcher = qaFetchGuard(boundary, async (...args) => { calls.push(args); return new Response("true", { headers: { "content-type": "application/json" } }); });
  const rpc = `${origin}/rest/v1/rpc/watchflow_set_calendar_sync_enabled`;
  await assert.rejects(fetcher(rpc, { method: "POST", body: '{"p_enabled":true}' }));
  boundary.armed = true;
  for (const [url, init] of [[rpc, { method: "POST", body: '{"p_enabled":false}' }],
    [`${origin}/rest/v1/calendar_connections`, { method: "PATCH" }],
    [`${origin}/rest/v1/rpc/watchflow_claim_calendar_sync_jobs`, { method: "POST" }],
    ["https://production.invalid/rest/v1/rpc/watchflow_set_calendar_sync_enabled", { method: "POST", body: '{"p_enabled":true}' }]]) {
    await assert.rejects(fetcher(url, init), /UNAPPROVED_QA_REQUEST/);
  }
  const qa = createClient(origin, "offline-publishable-key", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetcher } });
  const result = await qa.rpc("watchflow_set_calendar_sync_enabled", { p_enabled: true });
  assert.equal(result.data, true); assert.equal(boundary.used, true); assert.equal(boundary.armed, false);
  await assert.rejects(fetcher(rpc, { method: "POST", body: '{"p_enabled":true}' }));
  assert.equal(calls.length, 1); assert.equal(calls[0][1].redirect, "error");
});
test("the pooler is pinned and keeps password bytes in memory with strict TLS", () => {
  const config = poolerConfiguration(marker, { SUPABASE_DB_PASSWORD: " keep bytes " });
  assert.equal(config.password, " keep bytes "); assert.equal(config.ssl.rejectUnauthorized, true); assert.equal(config.port, 5432);
  for (const bad of [marker.replace("ckwadpmvxieekjlsfcks", "production"), marker.replace(":5432", ":6543"),
    marker.replace("/postgres", "/other"), marker.replace("@", ":password@"), `${marker}?sslmode=disable`]) {
    assert.throws(() => poolerConfiguration(bad, { SUPABASE_DB_PASSWORD: "offline" }));
  }
});
test("direct metadata/claimability path executes only a SELECT in a read-only transaction", async () => {
  const queries = [];
  class Client {
    on() {} async connect() {} async end() {}
    async query(sql, args) { queries.push({ sql, args }); return sql === SNAPSHOT_SQL ? { rows: [{ snapshot: fixture() }] } : {}; }
  }
  await readSnapshot({ ownerId: owner }, Client);
  assert.equal(queries[0].sql, "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  assert.equal(queries[1].sql, SNAPSHOT_SQL); assert.equal(queries[2].sql, "ROLLBACK");
  assert.match(SNAPSHOT_SQL, /^select /);
  assert.doesNotMatch(SNAPSHOT_SQL, /\b(update|insert|delete|for update)\b|watchflow_claim_calendar_sync_jobs\s*\(/i);
  assert.match(SNAPSHOT_SQL, /candidate\.available_at<=now\(\)/);
  assert.match(SNAPSHOT_SQL, /candidate\.attempt_count<candidate\.attempt_limit/);
  assert.match(SNAPSHOT_SQL, /eligible_connection\.sync_enabled/);
  assert.match(SNAPSHOT_SQL, /j\.source_version=public\.watchflow_calendar_upsert_version/);
  assert.equal(queries[1].args[0], connection); assert.equal(queries[1].args[1], job);
});
test("actual hold reader attempts all exact GET resources and validates acceptance cron", async () => {
  const calls = [];
  await assert.rejects(readHolds(async url => {
    calls.push(url); throw new Error("OFFLINE_SECRET_ERROR");
  }), /HOLD_READ_FAILED/);
  assert.equal(calls.length, 4);
  assert.ok(calls.some(url => url.endsWith("/schedules/watchflow-dev-part18-ops-unit2d-calendar")));
  assert.ok(calls.some(url => url.endsWith("/schedules/watchflow-dev-part18-ops-unit2d-reminders")));
});
test("acceptance schedule, reminder pause, exact labels/header evidence, and both false gates are mandatory", async () => {
  const calendar = { scheduleId: "watchflow-dev-part18-ops-unit2d-calendar", destination: "https://watchflow-dev-ops.vercel.app/api/internal/calendar/sync",
    method: "GET", cron: "4-59/5 * * * *", retries: 0, timeout: 55000, isPaused: true,
    labels: ["watchflow-dev", "part18-ops-unit2d", "calendar"], header: { Authorization: ["REDACTED:" +
      createHash("sha256").update(`Bearer ${process.env.WATCHFLOW_SCHEDULER_SECRET}`).digest("hex")] } };
  const reminder = { scheduleId: "watchflow-dev-part18-ops-unit2d-reminders", isPaused: true,
    destination: "https://watchflow-dev-ops.vercel.app/api/internal/notifications/scheduled-reminders" };
  const read = async url => url.endsWith(`/schedules/${calendar.scheduleId}`) ? calendar : url.endsWith(`/schedules/${reminder.scheduleId}`) ? reminder :
    { name: url.split("/").at(-1), value: "false" };
  assert.deepEqual(await readHolds(read), { calendar_paused: true, reminder_paused: true, github_gates_false: true });
  for (const field of ["cron", "isPaused", "timeout", "destination", "labels", "header"]) {
    const bad = structuredClone(calendar); bad[field] = field === "isPaused" ? false : "incorrect";
    await assert.rejects(readHolds(async url => url.endsWith(`/schedules/${calendar.scheduleId}`) ? bad : read(url)));
  }
  await assert.rejects(readHolds(async url => url.includes("/variables/") ? { name: url.split("/").at(-1), value: "true" } : read(url)), /GITHUB_GATE_NOT_FALSE/);
  await assert.rejects(readHolds(async url => url.endsWith(`/schedules/${reminder.scheduleId}`) ? { ...reminder, isPaused: false } : read(url)), /REMINDER_HOLD_FAILED/);
});
test("approved credential read is checked against the exact envelope before refresh, without persistence", async () => {
  const credential = { connectionId: connection, ciphertext: Buffer.from([1]), nonce: Buffer.alloc(12), authTag: Buffer.alloc(16), keyVersion: 1 };
  let decrypted = false;
  const context = { ownerId: owner, path: { read: async () => credential, decrypt: () => { decrypted = true; throw new Error("OFFLINE_DECRYPT_FAILED"); } } };
  await assert.rejects(googleAbsent(context, fixture()), /CREDENTIAL_DECRYPT_FAILED/);
  assert.equal(decrypted, true); assert.equal(credential.ciphertext.every(byte => byte === 0), true);
});
test("fresh token verification performs only the exact primary event GET and rejects rotation or invalid_grant", async () => {
  const originalFetch = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options.method });
    return url === "https://oauth2.googleapis.com/token" ? new Response('{"error":"invalid_grant"}', { status: 400 }) : new Response(null, { status: 404 });
  };
  try {
    for (const outcome of ["success", "rotation", "invalid_grant"]) {
      const credential = { connectionId: connection, ciphertext: Buffer.from([1]), nonce: Buffer.alloc(12), authTag: Buffer.alloc(16), keyVersion: 1 };
      const context = { ownerId: owner, path: { read: async () => credential, decrypt: () => "offline-refresh-token",
        refresh: async (_token, fetcher) => {
          if (outcome === "invalid_grant") {
            await fetcher("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ grant_type: "refresh_token" }) });
            throw new Error("SECRET_PROVIDER_BODY");
          }
          return { accessToken: "offline-access-token", replacementRefreshToken: outcome === "rotation" ? "offline-replacement" : null };
        } } };
      if (outcome === "success") await googleAbsent(context, fixture());
      else await assert.rejects(googleAbsent(context, fixture()), outcome === "invalid_grant" ? /GOOGLE_REFRESH_FAILED classification=invalid_grant/ : /replacement_refresh_token_returned/);
      assert.equal(credential.ciphertext.every(byte => byte === 0), true);
    }
    assert.deepEqual(calls, [{ url: "https://www.googleapis.com/calendar/v3/calendars/primary/events/a2ab6758f9fedbb0344d416ac00f2ca7d", method: "GET" },
      { url: "https://oauth2.googleapis.com/token", method: "POST" }]);
  } finally { globalThis.fetch = originalFetch; }
});
test("sanitized observation never emits private row values", () => {
  const data = fixture(true); data.jobs[0].state = "SECRET_STATE"; data.connections[0].status = "SECRET_STATUS";
  const observation = sanitizedObservation(data);
  assert.equal(observation.job_state, "unknown"); assert.equal(observation.connection_status, "unknown");
  assert.doesNotMatch(JSON.stringify(observation), /SECRET|DO_NOT_PRINT|ciphertext|provider_subject/);
});
