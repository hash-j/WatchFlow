import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { canonical, compareCheckpoint, fixtureEvidence, verifyLiveContract, verifyGoogle, verifyPreGoogle, runCheckpoint,
  signedRecord, verifyRecord, assertFresh, assertConfirmation, validateSchedule, CONFIRMATION, SafeFailure, EVENT_URL, MANUAL_URL } from "../part18j-google-reauth-checkpoint.mjs";

const root = resolve(import.meta.dirname, "../..");
const hash = value => createHash("sha256").update(canonical(value)).digest("hex");
const connection = "e652e5c8-f08c-4736-88d8-073bce772ccc";
const job = "b9eb8a77-0723-675b-3f2b-8503a0781ab8";
function fixture() {
  return { qa_owner_count: 1, owner_connection_count: 1,
    connections: [{ id: connection, user_id: "offline-owner", provider: "google", provider_subject: "offline-subject",
      provider_calendar_id: "primary", status: "connected", sync_enabled: false, display_email: "offline@example.invalid", updated_at: "before" }],
    credentials: [{ connection_id: connection, refresh_token_ciphertext: "\\x0102", refresh_token_nonce: `\\x${"01".repeat(12)}`,
      refresh_token_auth_tag: `\\x${"02".repeat(16)}`, encryption_key_version: 1, created_at: "before", updated_at: "before" }],
    jobs: [{ id: job, connection_id: connection, user_id: "offline-owner", user_movie_id: "9152882e-291a-47a2-b964-c1a4a6dd9630",
      state: "pending", attempt_count: 0, lease_token: null, lease_expires_at: null, desired_operation: "upsert",
      source_key: "589038a338f409210b819e6a7e0e871c", source_version: "8ca7b4e9cabaac13bdda45d0089f3169" }],
    connection_jobs: [job], job_inventory: [job], mapping_count: 0, unrelated_actionable: 0, actionable_cleanup: 0 };
}
function evidence(data = fixture()) { return { ...fixtureEvidence(data, "offline-function-hash", hash), holdsHash: "offline-holds", configHash: "offline-config" }; }
function changedEvidence() {
  const data = fixture();
  data.connections[0].updated_at = "after";
  data.credentials[0].updated_at = "after";
  data.credentials[0].refresh_token_ciphertext = "\\x0304";
  return evidence(data);
}
test("baseline contains fingerprints without raw subject or encrypted credential material", () => {
  const value = evidence();
  assert.doesNotMatch(JSON.stringify(value), /offline-subject|offline@example|\\x0102|refresh_token/);
  assert.equal(value.jobHash.length, 64);
  compareCheckpoint(value, structuredClone(value), false);
});
test("successful postcheck permits only reconnection metadata and fresh credential", () => {
  compareCheckpoint(evidence(), changedEvidence(), true);
  assert.throws(() => compareCheckpoint(evidence(), evidence(), true), { message: "CREDENTIAL_NOT_REPLACED" });
});
for (const [field, value] of [["status", "reconnect_required"], ["sync_enabled", true], ["provider", "other"]]) {
  test(`invalid connection ${field} fails closed`, () => {
    const data = fixture(); data.connections[0][field] = value;
    assert.throws(() => evidence(data), { message: "CONNECTION_STATE_MISMATCH" });
  });
}
for (const [field, value] of [["attempt_count", 1], ["lease_token", "lease"], ["desired_operation", "delete"], ["source_version", "changed"]]) {
  test(`controlled job ${field} cannot change`, () => {
    const data = fixture(); data.jobs[0][field] = value;
    assert.throws(() => evidence(data), { message: "CONTROLLED_JOB_STATE_MISMATCH" });
  });
}
for (const field of ["mapping_count", "unrelated_actionable", "actionable_cleanup"]) {
  test(`${field} cannot appear`, () => {
    const data = fixture(); data[field] = 1;
    assert.throws(() => evidence(data), { message: "MAPPING_OR_UNRELATED_WORK_PRESENT" });
  });
}
test("same-account and global job inventory are preserved across reauthorization", () => {
  const subject = changedEvidence(); subject.subjectMac = "changed";
  assert.throws(() => compareCheckpoint(evidence(), subject, true), { message: "CHECKPOINT_SUBJECTMAC_MISMATCH" });
  const inventory = changedEvidence(); inventory.jobInventoryHash = "changed";
  assert.throws(() => compareCheckpoint(evidence(), inventory, true), { message: "CHECKPOINT_JOBINVENTORYHASH_MISMATCH" });
});
test("the exact approved SQL body and only timestamp triggers establish the live contract", () => {
  const migration = readFileSync(resolve(root, "supabase/migrations/202610160001_part_18j_same_subject_reauth.sql"), "utf8").replace(/\r\n/g, "\n");
  const body = migration.split("as $$\n")[1].split("$$;")[0];
  const data = { database_name: "postgres", migration_count: 1,
    functions: [{ args: "uuid, text, text, text[], bytea, bytea, bytea, smallint", result_type: "uuid", returns_set: false,
      language: "plpgsql", security_definer: true, settings: ['search_path=""'], service_execute: true, public_execute: false,
      anon_execute: false, authenticated_execute: false, body, definition: migration }],
    triggers: ["calendar_connections", "calendar_credentials"].map(table => ({ table_name: table,
      name: `watchflow_${table}_updated_at`, type: 19, enabled: "O", function_schema: "public", function_name: "watchflow_set_updated_at",
      body: "begin\n new.updated_at := now();\n return new;\nend;" })) };
  assert.equal(verifyLiveContract(data).length, 64);
  const changed = structuredClone(data); changed.functions[0].body = body.replace("is distinct from", "=");
  assert.throws(() => verifyLiveContract(changed), { message: "DEPLOYED_REAUTH_CONTRACT_MISMATCH" });
  const trigger = structuredClone(data); trigger.triggers.push({});
  assert.throws(() => verifyLiveContract(trigger), { message: "UNEXPECTED_OAUTH_TABLE_TRIGGER" });
  const overload = structuredClone(data); overload.functions.push({});
  assert.throws(() => verifyLiveContract(overload), { message: "FUNCTION_OVERLOAD_OR_MISSING" });
});
function googleState() {
  return { ownerId: "offline-owner", credential: { ciphertext: Buffer.alloc(2, 1), nonce: Buffer.alloc(12, 2), authTag: Buffer.alloc(16, 3) },
    path: { decrypt: () => "offline-refresh", refresh: async (_token, fetcher) => {
      const response = await fetcher("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ grant_type: "refresh_token" }) });
      const body = await response.json();
      if (!response.ok) throw new Error("DO_NOT_EXPOSE_PROVIDER_BODY");
      return { accessToken: body.access_token, replacementRefreshToken: body.refresh_token || null };
    } } };
}
test("Google verification permits only the refresh grant and the exact primary-calendar GET", async () => {
  const calls = [];
  const state = googleState();
  await verifyGoogle(state, async (url, init) => {
    calls.push([url, init.method, init.redirect]);
    return url === EVENT_URL ? new Response(null, { status: 404 }) : Response.json({ access_token: "offline-access" });
  });
  assert.deepEqual(calls, [["https://oauth2.googleapis.com/token", "POST", "error"], [EVENT_URL, "GET", "error"]]);
  assert.ok(state.credential.ciphertext.every(byte => byte === 0));
});
for (const error of ["invalid_grant", "invalid_client", "unauthorized_client"]) {
  test(`refresh failure ${error} is sanitized and never reaches Calendar`, async () => {
    let calls = 0;
    await assert.rejects(verifyGoogle(googleState(), async () => { calls++; return Response.json({ error, private: "DO_NOT_EXPOSE" }, { status: 400 }); }),
      { message: `GOOGLE_REFRESH_FAILED classification=${error}` });
    assert.equal(calls, 1);
  });
}
test("replacement refresh token is never persisted or used", async () => {
  let calls = 0;
  await assert.rejects(verifyGoogle(googleState(), async () => { calls++; return Response.json({ access_token: "offline", refresh_token: "replacement" }); }),
    { message: "GOOGLE_REFRESH_FAILED classification=replacement_refresh_token_returned" });
  assert.equal(calls, 1);
});
test("a present event fails closed", async () => {
  await assert.rejects(verifyGoogle(googleState(), async url => url === EVENT_URL ? Response.json({ id: "offline" }) : Response.json({ access_token: "offline" })),
    { message: "GOOGLE_EVENT_NOT_PROVEN_ABSENT" });
});
test("network failure is sanitized", async () => {
  await assert.rejects(verifyGoogle(googleState(), async () => { throw new Error("DO_NOT_EXPOSE"); }), { message: "GOOGLE_REFRESH_FAILED classification=network_error" });
});
test("event network failure is sanitized", async () => {
  await assert.rejects(verifyGoogle(googleState(), async url => {
    if (url === EVENT_URL) throw new Error("DO_NOT_EXPOSE");
    return Response.json({ access_token: "offline" });
  }), { message: "GOOGLE_EVENT_GET_FAILED classification=network_error" });
});
test("typed approval is exact and rejects whitespace, casing, or partial phrases", () => {
  assertConfirmation(CONFIRMATION);
  for (const value of ["", "yes", CONFIRMATION.toLowerCase(), `${CONFIRMATION} `, ` ${CONFIRMATION}`]) {
    assert.throws(() => assertConfirmation(value), /TYPED_CONFIRMATION_MISMATCH/);
  }
});
function schedules() {
  const secret = "offline-scheduler-secret";
  return { secret, calendar: { scheduleId: "watchflow-dev-part18-ops-unit2d-calendar",
    destination: "https://watchflow-dev-ops.vercel.app/api/internal/calendar/sync", method: "GET", cron: "0 0 1 1 *",
    retries: 0, timeout: 55000, isPaused: true, labels: ["watchflow-dev", "part18-ops-unit2d", "calendar"],
    header: { Authorization: [`REDACTED:${createHash("sha256").update(`Bearer ${secret}`).digest("hex")}`], "Content-Type": ["application/json"] } },
  reminder: { scheduleId: "watchflow-dev-part18-ops-unit2d-reminders", isPaused: true,
    destination: "https://watchflow-dev-ops.vercel.app/api/internal/notifications/scheduled-reminders" } };
}
test("paused holding schedules retain redacted authorization and optional Content-Type", () => {
  const s = schedules();
  assert.equal(validateSchedule(s.calendar, s.reminder, s.secret).length, 64);
  delete s.calendar.header["Content-Type"];
  assert.equal(validateSchedule(s.calendar, s.reminder, s.secret).length, 64);
});
test("resumed schedules, unexpected destinations, and duplicate authorization fail closed", () => {
  let s = schedules(); s.calendar.isPaused = false;
  assert.throws(() => validateSchedule(s.calendar, s.reminder, s.secret), /CALENDAR_QSTASH_MISMATCH/);
  s = schedules(); s.reminder.isPaused = false;
  assert.throws(() => validateSchedule(s.calendar, s.reminder, s.secret), /REMINDER_QSTASH_MISMATCH/);
  s = schedules(); s.calendar.destination = "https://production.invalid/api/internal/calendar/sync";
  assert.throws(() => validateSchedule(s.calendar, s.reminder, s.secret), /CALENDAR_QSTASH_MISMATCH/);
  s = schedules(); s.calendar.header["Upstash-Forward-Authorization"] = s.calendar.header.Authorization;
  assert.throws(() => validateSchedule(s.calendar, s.reminder, s.secret), /QSTASH_AUTHORIZATION_EVIDENCE_INVALID/);
});
test("hold verification uses only GET and rejects an enabled GitHub gate", async () => {
  const source = readFileSync(resolve(root, "scripts/part18j-google-reauth-checkpoint.mjs"), "utf8");
  const reader = source.slice(source.indexOf("async function readJson("), source.indexOf("export function validateSchedule("));
  const holds = source.slice(source.indexOf("async function readHolds("), source.indexOf("async function approvedPath("));
  const s = schedules(); const calls = []; let enabled = false;
  const read = runInNewContext(`${reader}\n${holds}\nreadHolds`, {
    QSTASH: "https://qstash-eu-central-1.upstash.io/v2", CALENDAR_SCHEDULE: s.calendar.scheduleId, REMINDER_SCHEDULE: s.reminder.scheduleId,
    validateSchedule, SafeFailure, AbortSignal, env: name => name === "WATCHFLOW_SCHEDULER_SECRET" ? s.secret : "offline-token",
    requireSafe: (ok, reason) => { if (!ok) throw new SafeFailure(reason); },
    fetch: async (url, init) => {
      calls.push([url, init.method]);
      const name = url.split("/").at(-1);
      return Response.json(name === s.calendar.scheduleId ? s.calendar : name === s.reminder.scheduleId ? s.reminder : { name, value: enabled ? "true" : "false" });
    },
  });
  await read();
  assert.equal(calls.length, 4);
  assert.ok(calls.every(([, method]) => method === "GET"));
  enabled = true;
  await assert.rejects(read(), /GITHUB_GATE_NOT_FALSE/);
});
test("reviewed OAuth route and provider sources match the prepared code pin", () => {
  const source = readFileSync(resolve(root, "scripts/part18j-google-reauth-checkpoint.mjs"), "utf8");
  const expected = /const CODE_HASH = "([a-f0-9]{64})"/.exec(source)[1];
  const paths = ["app/api/calendar/google/start/route.ts", "app/api/calendar/google/callback/route.ts", "lib/calendar/oauth-store.ts",
    "lib/calendar/google-provider.ts", "lib/calendar/token-encryption.ts", "lib/calendar/google-config.ts"];
  const rawHash = value => createHash("sha256").update(value).digest("hex");
  assert.equal(rawHash(JSON.stringify(paths.map(path => [path, rawHash(readFileSync(resolve(root, path)))]))), expected);
});
function operator(post = false) {
  const now = Date.parse("2026-10-29T12:00:00Z");
  const baseline = { schema: 1, project: "ckwadpmvxieekjlsfcks", createdAt: new Date(now).toISOString(),
    googleCredentialCheck: "REFRESH_SUCCEEDED_EVENT_ABSENT", evidence: evidence() };
  const approval = { schema: 1, project: baseline.project, baselineHash: hash(baseline), approvedAt: new Date(now).toISOString() };
  const calls = [];
  return { calls, baseline, approval, io: { checkLocalTarget: () => calls.push("local"), now: () => now,
    capture: async () => { calls.push("capture"); return { evidence: post ? changedEvidence() : evidence() }; },
    verifyGoogle: async () => { calls.push("google"); }, typedConfirmation: async () => { calls.push("confirm"); },
    readRecord: (_path, kind) => kind === "baseline" ? baseline : approval,
    writeRecord: (_path, kind) => calls.push(`write:${kind}`), log: text => calls.push(text) } };
}
test("precheck writes a baseline only after all checks and exact-event absence", async () => {
  const h = operator(); await runCheckpoint("--pre", h.io);
  assert.deepEqual(h.calls, ["local", "capture", "google", "capture", "write:baseline", "PRE_REAUTH_PASS"]);
});
test("precheck accepts only known invalid_grant, records it, and skips the event GET", async () => {
  const h = operator(); const requests = []; let saved;
  h.io.capture = async () => { h.calls.push("capture"); return { ...googleState(), evidence: evidence() }; };
  h.io.verifyGoogle = state => verifyGoogle(state, async (url, init) => {
    requests.push([url, init.method]);
    return Response.json({ error: "invalid_grant", private: "DO_NOT_EXPOSE" }, { status: 400 });
  });
  h.io.writeRecord = (_path, kind, payload) => { h.calls.push(`write:${kind}`); saved = payload; };
  await runCheckpoint("--pre", h.io);
  assert.deepEqual(requests, [["https://oauth2.googleapis.com/token", "POST"]]);
  assert.equal(saved.googleCredentialCheck, "EXPECTED_STALE_GOOGLE_GRANT");
  assert.equal(h.calls.at(-1), "PRE_REAUTH_PASS google_credential=EXPECTED_STALE_GOOGLE_GRANT");
  assert.equal(h.calls.filter(call => call === "capture").length, 2);
});
for (const error of ["invalid_client", "unauthorized_client", "network_error", "malformed_response", "replacement_refresh_token_returned", "other_safe_classification"]) {
  test(`precheck rejects ${error} without writing a baseline or pass`, async () => {
    const h = operator(); h.io.verifyGoogle = async () => { throw new SafeFailure(`GOOGLE_REFRESH_FAILED classification=${error}`); };
    await assert.rejects(runCheckpoint("--pre", h.io), { message: `GOOGLE_REFRESH_FAILED classification=${error}` });
    assert.equal(h.calls.some(call => call.startsWith("write:") || call.startsWith("PRE_REAUTH_PASS")), false);
  });
}
test("precheck cannot accept a raw or differently formatted invalid_grant error", async () => {
  await assert.rejects(verifyPreGoogle({}, async () => { throw new Error("GOOGLE_REFRESH_FAILED classification=invalid_grant"); }));
  await assert.rejects(verifyPreGoogle({}, async () => { throw new SafeFailure("GOOGLE_REFRESH_FAILED classification=invalid_grant extra"); }));
});
test("a valid precheck token still requires exact event absence", async () => {
  const h = operator();
  h.io.capture = async () => ({ ...googleState(), evidence: evidence() });
  h.io.verifyGoogle = state => verifyGoogle(state, async url => url === EVENT_URL
    ? Response.json({ id: "present" }) : Response.json({ access_token: "offline" }));
  await assert.rejects(runCheckpoint("--pre", h.io), /GOOGLE_EVENT_NOT_PROVEN_ABSENT/);
  assert.equal(h.calls.some(call => call.startsWith("write:") || call.startsWith("PRE_REAUTH_PASS")), false);
});
test("expected stale grant cannot bypass final database or scheduler state preservation", async () => {
  const h = operator(); let reads = 0;
  h.io.verifyGoogle = async () => { throw new SafeFailure("GOOGLE_REFRESH_FAILED classification=invalid_grant"); };
  h.io.capture = async () => {
    const value = evidence();
    if (++reads === 2) value.holdsHash = "changed";
    return { evidence: value };
  };
  await assert.rejects(runCheckpoint("--pre", h.io), /CHECKPOINT_HOLDSHASH_MISMATCH/);
  assert.equal(h.calls.some(call => call.startsWith("write:") || call.startsWith("PRE_REAUTH_PASS")), false);
});
test("manual approval requires confirmation before exposing the reauthorization URL", async () => {
  const h = operator(); await runCheckpoint("--approve-manual-reauth", h.io);
  assert.ok(h.calls.indexOf("confirm") < h.calls.indexOf("write:approval"));
  assert.equal(h.calls.at(-1), `MANUAL_REAUTH_APPROVED ${MANUAL_URL}`);
  assert.equal(h.calls.includes("google"), false);
});
test("approval of a signed stale-grant baseline does not retry Google or automate OAuth", async () => {
  const h = operator(); h.baseline.googleCredentialCheck = "EXPECTED_STALE_GOOGLE_GRANT";
  h.io.verifyGoogle = async () => { throw new Error("GOOGLE_MUST_NOT_BE_CALLED"); };
  await runCheckpoint("--approve-manual-reauth", h.io);
  assert.ok(h.calls.includes("confirm"));
  assert.equal(h.calls.at(-1), `MANUAL_REAUTH_APPROVED ${MANUAL_URL}`);
});
test("anything other than typed approval aborts before Google or approval writes", async () => {
  const h = operator(); h.io.typedConfirmation = async () => { throw new SafeFailure("TYPED_CONFIRMATION_MISMATCH"); };
  await assert.rejects(runCheckpoint("--approve-manual-reauth", h.io), /TYPED_CONFIRMATION_MISMATCH/);
  assert.equal(h.calls.includes("google") || h.calls.includes("write:approval"), false);
});
test("postcheck is read only, verifies fresh token, then rechecks all state", async () => {
  const h = operator(true); await runCheckpoint("--post", h.io);
  assert.deepEqual(h.calls, ["local", "capture", "google", "capture", "POST_REAUTH_PASS"]);
});
test("postcheck rejects invalid_grant even when the signed baseline recorded an expected stale grant", async () => {
  const h = operator(true); h.baseline.googleCredentialCheck = "EXPECTED_STALE_GOOGLE_GRANT";
  h.approval.baselineHash = hash(h.baseline);
  h.io.capture = async () => ({ ...googleState(), evidence: changedEvidence() });
  h.io.verifyGoogle = state => verifyGoogle(state, async () => Response.json({ error: "invalid_grant" }, { status: 400 }));
  await assert.rejects(runCheckpoint("--post", h.io), { message: "GOOGLE_REFRESH_FAILED classification=invalid_grant" });
  assert.equal(h.calls.includes("POST_REAUTH_PASS") || h.calls.some(call => call.startsWith("write:")), false);
});
test("postcheck requires successful fresh refresh and the exact primary event 404", async () => {
  const h = operator(true); const requests = [];
  h.io.capture = async () => ({ ...googleState(), evidence: changedEvidence() });
  h.io.verifyGoogle = state => verifyGoogle(state, async (url, init) => {
    requests.push([url, init.method]);
    return url === EVENT_URL ? new Response(null, { status: 404 }) : Response.json({ access_token: "offline-access" });
  });
  await runCheckpoint("--post", h.io);
  assert.deepEqual(requests, [["https://oauth2.googleapis.com/token", "POST"], [EVENT_URL, "GET"]]);
  assert.equal(h.calls.at(-1), "POST_REAUTH_PASS");
  assert.equal(h.calls.some(call => call.startsWith("write:")), false);
});
test("unchanged credential blocks postcheck before token verification", async () => {
  const h = operator(); await assert.rejects(runCheckpoint("--post", h.io), /CREDENTIAL_NOT_REPLACED/);
  assert.equal(h.calls.includes("google"), false);
});
test("wrong-baseline approval cannot authorize postcheck", async () => {
  const h = operator(true); h.approval.baselineHash = "wrong";
  await assert.rejects(runCheckpoint("--post", h.io), /APPROVAL_BASELINE_MISMATCH/);
  assert.equal(h.calls.includes("capture"), false);
});
test("signed local records reject tampering and contain no raw credential", () => {
  const previous = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  try {
    const h = operator(); const record = signedRecord("baseline", h.baseline);
    assert.equal(verifyRecord(record, "baseline"), h.baseline);
    record.payload.evidence.jobHash = "tampered";
    assert.throws(() => verifyRecord(record, "baseline"), /CHECKPOINT_SIGNATURE_INVALID/);
    assert.throws(() => verifyRecord(record, "approval"), /CHECKPOINT_INVALID/);
  } finally {
    if (previous === undefined) delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
    else process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = previous;
  }
});
test("expired or future-dated checkpoints fail closed", () => {
  const now = Date.parse("2026-10-29T12:00:00Z");
  assert.throws(() => assertFresh("2026-10-29T11:00:00Z", now, 30), /CHECKPOINT_EXPIRED/);
  assert.throws(() => assertFresh("2026-10-29T13:00:00Z", now, 30), /CHECKPOINT_EXPIRED/);
});
test("actual operator DB helper uses explicit TLS and a read-only transaction", async () => {
  const source = readFileSync(resolve(root, "scripts/part18j-google-reauth-checkpoint.mjs"), "utf8");
  const code = source.slice(source.indexOf("async function readDatabase("), source.indexOf("\nconst envelope"));
  const calls = []; let configuration;
  class Client {
    constructor(config) { configuration = config; }
    on() {} async connect() { calls.push("connect"); }
    async query(sql, params) { calls.push([sql, params]); return { rows: [{ snapshot: { offline: true } }] }; }
    async end() { calls.push("end"); }
  }
  const read = runInNewContext(`${code}\nreadDatabase`, { ROOT: root, REF: "ckwadpmvxieekjlsfcks", VERSION: "202610160001", CONNECTION: connection,
    JOB: job, URL, resolve, pg: { Client }, SafeFailure, requireSafe: (ok, reason) => { if (!ok) throw new SafeFailure(reason); },
    readFileSync: () => "postgresql://postgres.ckwadpmvxieekjlsfcks@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres",
    env: name => name === "SUPABASE_DB_PASSWORD" ? "offline-password" : "offline@example.invalid", process: { env: {} } });
  await read();
  assert.equal(configuration.ssl.rejectUnauthorized, true);
  assert.equal(configuration.connectionString, undefined);
  assert.equal(calls[1][0], "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  assert.match(calls[2][0], /^select /);
  assert.equal(calls[3][0], "ROLLBACK");
  assert.equal(calls.at(-1), "end");
});
