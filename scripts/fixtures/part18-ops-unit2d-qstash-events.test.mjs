import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CANARY_CONTRACT, CALENDAR_CONTRACT, SafeFailure, decodeEventPage, summarizeEvents, reviewCanaryEvidence,
  readCanaryEvidence } from "../part18-ops-unit2d-qstash-events.mjs";
import { runCanary } from "../part18-ops-unit2d-log-canary.mjs";
import { parseFirstLogPage, acceptEventObservation, runFirst } from "../part18-ops-unit2d-first-automatic.mjs";
import { parseQstashLogPage } from "../part18-ops-unit2d-script-a2.mjs";

const path = new URL("./part18-ops-unit2d-observed-qstash-events.json", import.meta.url);
const evidence = () => JSON.parse(readFileSync(path, "utf8"));
const supplement = () => JSON.parse(readFileSync(new URL("./part18-ops-unit2d-canary-reviewed-status.json", import.meta.url), "utf8"));
const captureHash = "bd3040408957cfa1d603c740d2caf01cd2105336dbf26e4c8ed2578a205e6646";
function retainedHttpStatus() {
  // Synthetic positive test only. The real saved evidence has no HTTP status.
  const record = evidence(); record.redaction_version = 2;
  record.sanitized_pages[1].events[0].responseStatus = 200;
  return record;
}
const liveRows = () => retainedHttpStatus().sanitized_pages[1].events;
function calendarRows() {
  return liveRows().map(row => ({ ...row, scheduleId: CALENDAR_CONTRACT.scheduleId, url: CALENDAR_CONTRACT.destination,
    timeout: CALENDAR_CONTRACT.timeout, labels: [...CALENDAR_CONTRACT.labels] }));
}
test("the observed three-row fixture preserves actual states, anonymous IDs and the lost status", () => {
  const record = evidence(), page = record.sanitized_pages[1];
  assert.deepEqual(page.events.map(row => row.state), ["DELIVERED", "ACTIVE", "CREATED"]);
  assert.equal(page.events[0].responseStatus, 0);
  assert.throws(() => decodeEventPage(page, CANARY_CONTRACT), /QSTASH_DELIVERY_STATUS_INVALID/);
  const parsed = decodeEventPage(page, CANARY_CONTRACT, { legacyRedaction: true });
  const summary = summarizeEvents(parsed.rows);
  assert.equal(summary.uniqueMessageCount, 1); assert.equal(summary.deliveryAttemptRows, 1);
  assert.equal(summary.deliveredStateRows, 1); assert.equal(summary.successfulDeliveryRows, 0);
  assert.deepEqual(summary.states, ["CREATED", "ACTIVE", "DELIVERED"]);
  assert.deepEqual(parsed.redactions, ["events[0].responseStatus"]);
});
test("empty events remain valid and malformed envelopes/pagination fail closed", () => {
  assert.deepEqual(decodeEventPage({ events: [] }, CANARY_CONTRACT), { rows: [], cursor: null, redactions: [] });
  assert.equal(decodeEventPage({ events: [], cursor: "next" }, CANARY_CONTRACT).cursor, "next");
  for (const page of [{}, { logs: [] }, { events: null }, { events: [], logs: [] }, { events: [], cursor: null }, { events: [], nextCursor: "next" },
    { events: liveRows(), cursor: "next" }]) assert.throws(() => decodeEventPage(page, CANARY_CONTRACT));
  assert.throws(() => decodeEventPage({ events: [] }, CANARY_CONTRACT, { paginationHeader: true }), /PAGINATION_HEADER/);
});
test("synthetic retained 2xx status demonstrates strict full lifecycle success without claiming live proof", () => {
  const decoded = decodeEventPage({ events: liveRows() }, CANARY_CONTRACT), summary = summarizeEvents(decoded.rows);
  assert.equal(summary.uniqueMessageCount, 1); assert.equal(summary.deliveryAttemptRows, 1); assert.equal(summary.successfulDeliveryRows, 1);
  assert.equal(summary.messages[0].delivered, true);
  assert.ok(summary.messages[0].createdAt < summary.messages[0].attemptAt);
  assert.ok(summary.messages[0].attemptAt < summary.messages[0].deliveredAt);
  assert.equal(reviewCanaryEvidence(retainedHttpStatus()).ready, true);
});
test("historical redaction never becomes successful delivery or decoder readiness", () => {
  const report = readCanaryEvidence(path);
  assert.equal(report.ready, false); assert.equal(report.uniqueMessageCount, 1);
  assert.equal(report.automaticScheduleProvenance, true); assert.equal(report.deliveryAttemptVerified, true);
  assert.equal(report.successfulDeliveryVerified, false);
  assert.equal(report.code, "EVIDENCE_RESPONSE_STATUS_REDACTED");
  assert.deepEqual(report.missingFields, ["sanitized_pages[1].events[0].responseStatus"]);
});
test("only the exact reviewed retained-history supplement completes the original lifecycle", () => {
  const record = evidence(), before = JSON.stringify(record), reviewed = supplement();
  const report = reviewCanaryEvidence(record, reviewed, captureHash);
  assert.equal(report.ready, true); assert.equal(report.code, "OK"); assert.deepEqual(report.missingFields, []);
  assert.equal(report.uniqueMessageCount, 1); assert.equal(report.capturedEventCount, 3);
  assert.equal(report.automaticScheduleProvenance, true); assert.equal(report.deliveryAttemptVerified, true);
  assert.equal(report.successfulDeliveryVerified, true);
  assert.equal(JSON.stringify(record), before); assert.equal(record.sanitized_pages[1].events[0].responseStatus, 0);
});
test("supplement rejects arbitrary statuses, wrong provenance, unknown fields and absent byte binding", () => {
  for (const change of [s => s.response_status = 201, s => s.response_status = 500, s => s.response_status = "200",
    s => s.schedule_id = "wrong", s => s.state = "ACTIVE", s => s.source = "OPERATOR_INPUT", s => s.reviewed_on = "other",
    s => s.original_evidence_sha256 = "0".repeat(64), s => s.correlation_sha256 = "0".repeat(64),
    s => s.extra = true, s => delete s.schema]) {
    const reviewed = supplement(); change(reviewed);
    assert.throws(() => reviewCanaryEvidence(evidence(), reviewed, captureHash), /SUPPLEMENT_INVALID/);
  }
  for (const hash of [undefined, "", "0".repeat(64)]) {
    assert.throws(() => reviewCanaryEvidence(evidence(), supplement(), hash), /ORIGINAL_HASH_MISMATCH/);
  }
});
test("reviewed status cannot apply to another message, timeline, state, destination or labels", () => {
  for (const change of [r => r.sanitized_pages[1].events.forEach(row => row.messageId = "another-message"),
    r => r.sanitized_pages[1].events[0].time += 1,
    r => r.sanitized_pages[1].events[0].state = "UNKNOWN",
    r => r.sanitized_pages[1].events[0].url = "https://wrong.invalid/",
    r => r.sanitized_pages[1].events[0].labels = ["wrong"]]) {
    const record = evidence(); change(record);
    assert.throws(() => reviewCanaryEvidence(record, supplement(), captureHash));
  }
});
test("supplement cannot override an actual HTTP failure or repair other evidence", () => {
  const failed = evidence(); failed.sanitized_pages[1].events[0].responseStatus = 503;
  assert.throws(() => reviewCanaryEvidence(failed, supplement(), captureHash), /DELIVERY_STATUS_INVALID/);
  const retained = retainedHttpStatus();
  assert.throws(() => reviewCanaryEvidence(retained, supplement(), captureHash), /REVIEW_TARGET_AMBIGUOUS/);
  const duplicate = evidence(); duplicate.sanitized_pages[1].events.push(duplicate.sanitized_pages[1].events[0]);
  duplicate.structures[1].event_count += 1;
  assert.throws(() => reviewCanaryEvidence(duplicate, supplement(), captureHash), /REVIEW_TARGET_AMBIGUOUS/);
});
test("supplemented review PASS remains strictly local with no environment/network/mutation hooks", async () => {
  const output = [], forbidden = () => { throw new Error("NETWORK_OR_WRITE_FORBIDDEN"); };
  const report = await runCanary("--review-evidence", {
    review: () => reviewCanaryEvidence(evidence(), supplement(), captureHash), log: line => output.push(line),
    context: forbidden, capture: forbidden, isolation: forbidden, asset: forbidden, read: forbidden,
    mutate: forbidden, logs: forbidden, confirm: forbidden, write: forbidden, deadline: forbidden, signals: forbidden,
  });
  assert.equal(report.ready, true);
  assert.match(output.join("\n"), /CANARY_EVIDENCE_REVIEW_PASS/);
  assert.match(output.join("\n"), /successful_delivery_verified=true unique_message_count=1 real_first_run_decoder_ready=true/);
  assert.doesNotMatch(output.join("\n"), /canary-message-1|header|callerIp|SECRET/);
});
test("local evidence review bypasses all environment, network, write and mutation paths", async () => {
  const output = [];
  const forbidden = () => { throw new Error("NETWORK_OR_WRITE_FORBIDDEN"); };
  const report = await runCanary("--review-evidence", { review: () => reviewCanaryEvidence(evidence()), log: line => output.push(line),
    context: forbidden, capture: forbidden, isolation: forbidden, asset: forbidden, read: forbidden,
    mutate: forbidden, logs: forbidden, confirm: forbidden, write: forbidden, deadline: forbidden, signals: forbidden });
  assert.equal(report.uniqueMessageCount, 1); assert.equal(report.ready, false);
  assert.match(output.join("\n"), /CANARY_EVIDENCE_REVIEW_FAIL/);
  assert.match(output.join("\n"), /unique_message_count=1/);
  assert.doesNotMatch(output.join("\n"), /canary-message-1|header|callerIp|SECRET|PROVENANCE_SCHEMA/);
});
test("required provenance and present known metadata retain strict types", () => {
  for (const change of [r => r.scheduleId = "wrong", r => r.messageId = "", r => r.url = "https://production.invalid/asset.svg",
    r => r.method = "POST", r => r.time = "timestamp", r => r.header = [], r => r.timeout = "10000", r => r.state = "FAILED",
    r => r.labels = ["wrong"], r => r.callerIp = {}, r => r.host = 1, r => r.path = null, r => r.label = [],
    r => r.duration = -1, r => delete r.scheduleId]) {
    const rows = liveRows(); change(rows[0]); assert.throws(() => decodeEventPage({ events: rows }, CANARY_CONTRACT));
  }
  const rows = liveRows(); rows[0].header = { Authorization: ["SECRET_HEADER_VALUE"] };
  const normalized = decodeEventPage({ events: rows }, CANARY_CONTRACT);
  assert.doesNotMatch(JSON.stringify(normalized), /SECRET|Authorization|callerIp|host|path|label/);
});
test("optional extra metadata and its absence do not replace required provenance or leave the decoder", () => {
  const rows = liveRows();
  rows[0].extra = { raw: "SECRET_EXTRA_VALUE" }; rows[0].responseBody = "SECRET_RESPONSE";
  delete rows[0].host; delete rows[0].header; delete rows[0].duration; delete rows[0].timeout;
  const parsed = decodeEventPage({ events: rows }, CANARY_CONTRACT);
  assert.equal(summarizeEvents(parsed.rows).messages[0].delivered, true);
  assert.doesNotMatch(JSON.stringify(parsed), /SECRET|responseBody|extra/);
  rows[1].responseStatus = 0; // Pre-delivery metadata never establishes success.
  assert.equal(decodeEventPage({ events: rows }, CANARY_CONTRACT).rows[1].responseStatus, null);
  for (const name of ["time", "messageId", "state", "url", "scheduleId", "method", "labels", "responseStatus"]) {
    const invalid = liveRows(); delete invalid[0][name];
    assert.throws(() => decodeEventPage({ events: invalid }, CANARY_CONTRACT));
  }
});
test("response status is required, type-checked and 2xx only; live zero is never a success", () => {
  for (const status of [0, 100, 300, 401, 500, "200", null]) {
    const rows = liveRows(); rows[0].responseStatus = status;
    assert.throws(() => decodeEventPage({ events: rows }, CANARY_CONTRACT), /DELIVERY_STATUS_INVALID/);
  }
  const rows = liveRows(); delete rows[0].responseStatus;
  assert.throws(() => decodeEventPage({ events: rows }, CANARY_CONTRACT), /SHAPE_MISMATCH/);
});
test("duplicate retained rows deduplicate; contradictory rows and transitions are rejected", () => {
  const rows = liveRows();
  const summary = summarizeEvents(decodeEventPage({ events: [...rows, ...rows] }, CANARY_CONTRACT).rows);
  assert.equal(summary.uniqueMessageCount, 1); assert.equal(summary.deduplicatedRows, 3); assert.equal(summary.deliveryAttemptRows, 1);
  const conflict = [...rows, { ...rows[0], responseStatus: 201 }];
  assert.throws(() => summarizeEvents(decodeEventPage({ events: conflict }, CANARY_CONTRACT).rows), /ROWS_AMBIGUOUS/);
  assert.throws(() => summarizeEvents(decodeEventPage({ events: [...rows, { ...rows[1], time: rows[1].time + 1 }] }, CANARY_CONTRACT).rows), /MULTIPLE_MESSAGE_STATE_TRANSITIONS/);
  const second = [...rows, ...rows.map(row => ({ ...row, messageId: "another-message" }))];
  assert.equal(summarizeEvents(decodeEventPage({ events: second }, CANARY_CONTRACT).rows).uniqueMessageCount, 2);
});
test("wrong metadata/provenance and ambiguous chronology fail evidence review", () => {
  for (const change of [r => r.canary_schedule_id = "wrong", r => r.canary_deleted_verified = false,
    r => r.structures[1].pagination_header_present = true, r => r.structures[1].event_count = 2,
    r => r.sanitized_pages[1].events[2].time = r.sanitized_pages[1].events[0].time + 1]) {
    const record = retainedHttpStatus(); change(record); assert.throws(() => reviewCanaryEvidence(record));
  }
});
test("first-run and A2 event handling share the observed schema and correct ACTIVE/DELIVERED counters", () => {
  const page = { events: calendarRows() };
  const parsed = parseFirstLogPage(page);
  assert.equal(parsed.detected, true); assert.equal(parsed.verified, true);
  const state = {}, first = evidence().fixture_first_ms;
  acceptEventObservation(parsed, { first, pauseCutoff: first + 75000, completionCutoff: first + 150000 }, state);
  assert.equal(state.proof.delivered, true);
  assert.deepEqual(parseQstashLogPage(page), { matchingRows: 3, deliveryAttemptRows: 1, successfulDeliveryRows: 1, cursor: null });
});
test("partial observations pause first and accumulate the full correlated lifecycle safely", () => {
  const rows = calendarRows(), first = evidence().fixture_first_ms, state = {}, plan = { first, pauseCutoff: first + 75000, completionCutoff: first + 150000 };
  acceptEventObservation(parseFirstLogPage({ events: [rows[1]] }), plan, state);
  assert.equal(state.proof, undefined);
  acceptEventObservation(parseFirstLogPage({ events: [rows[2]] }), plan, state);
  assert.equal(state.proof.delivered, false);
  acceptEventObservation(parseFirstLogPage({ events: [rows[0], rows[1], rows[2]] }), plan, state);
  assert.equal(state.proof.delivered, true);
});
test("strict real first-run readiness fails before context, approval or network when status was erased", async () => {
  let contextCalled = false;
  await assert.rejects(runFirst("--first-run", {
    decoderReady: () => { const report = reviewCanaryEvidence(evidence()); if (!report.ready) throw new SafeFailure(report.code); },
    context: () => { contextCalled = true; throw new Error("MUST_NOT_RUN"); },
  }), /EVIDENCE_RESPONSE_STATUS_REDACTED/);
  assert.equal(contextCalled, false);
});
