// Shared decoding of the observed events envelope. No network or writes.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export class SafeFailure extends Error {
  constructor(code, field) { super(code); this.code = code; if (field) this.field = field; }
}
const requireSafe = (condition, code, field) => { if (!condition) throw new SafeFailure(code, field); };
const ROOT = resolve(import.meta.dirname, "..");
export const EVIDENCE_PATH = resolve(ROOT, "supabase/.temp/part18-unit2d-log-canary-evidence.json");
export const REVIEW_SUPPLEMENT_PATH = resolve(ROOT, "scripts/fixtures/part18-ops-unit2d-canary-reviewed-status.json");
// One reviewed fact supplied by the human from retained live history. These
// pins are not CLI/env inputs, and never change the immutable original record.
const REVIEWED_STATUS = Object.freeze({ schema: 1, source: "HUMAN_REVIEWED_RETAINED_QSTASH_HISTORY",
  reviewed_on: "2026-10-30", original_evidence_sha256: "bd3040408957cfa1d603c740d2caf01cd2105336dbf26e4c8ed2578a205e6646",
  schedule_id: "watchflow-dev-part18-ops-unit2d-log-canary",
  correlation_sha256: "906656023558f972c593ddaa34b708f5217d4fb75a26fe48d016f038ff6f1606",
  state: "DELIVERED", response_status: 200 });
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
export const CANARY_CONTRACT = Object.freeze({ scheduleId: "watchflow-dev-part18-ops-unit2d-log-canary",
  destination: "https://watchflow-dev-ops.vercel.app/icons/watchflow-icon.svg", timeout: 10000,
  labels: ["watchflow-dev", "part18-ops-unit2d", "log-canary"] });
export const CALENDAR_CONTRACT = Object.freeze({ scheduleId: "watchflow-dev-part18-ops-unit2d-calendar",
  destination: "https://watchflow-dev-ops.vercel.app/api/internal/calendar/sync", timeout: 55000,
  labels: ["watchflow-dev", "part18-ops-unit2d", "calendar"] });
const REQUIRED = ["time", "messageId", "state", "url", "scheduleId", "method", "labels"];
const STATE_FIELDS = { CREATED: [], ACTIVE: [], DELIVERED: ["responseStatus"] };
const plain = value => value !== null && typeof value === "object" && !Array.isArray(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const text = value => typeof value === "string" && value.length <= 4096 && !/[\x00-\x1f\x7f]/.test(value);

export function decodeEventPage(page, contract, options = {}) {
  requireSafe(plain(page) && Object.keys(page).every(name => ["events", "cursor"].includes(name)) && Array.isArray(page.events), "QSTASH_EVENTS_ENVELOPE_INVALID");
  requireSafe(!options.paginationHeader, "QSTASH_PAGINATION_HEADER_UNVERIFIED");
  requireSafe(page.events.length <= 100, "QSTASH_LOG_PAGE_TOO_LARGE");
  const cursor = page.cursor;
  requireSafe(cursor === undefined || cursor === "" || (typeof cursor === "string" && /^[\x21-\x7e]{1,4096}$/.test(cursor)), "QSTASH_CURSOR_INVALID");
  // Existing empty-page cursor handling is retained; nonempty pagination was
  // not observed and must be reviewed before it can establish complete proof.
  requireSafe(!page.events.length || !cursor, "QSTASH_EVENT_PAGINATION_UNVERIFIED");
  requireSafe(page.events.length < 100 || !!cursor, "QSTASH_FULL_PAGE_PAGINATION_UNVERIFIED");
  const redactions = [];
  const rows = page.events.map((row, index) => {
    const field = name => `events[${index}].${name}`;
    requireSafe(plain(row) && typeof row.state === "string" && Object.hasOwn(STATE_FIELDS, row.state), "QSTASH_EVENT_STATE_UNKNOWN", field("state"));
    const fields = [...REQUIRED, ...STATE_FIELDS[row.state]];
    requireSafe(fields.every(name => Object.hasOwn(row, name)), "QSTASH_EVENT_SHAPE_MISMATCH");
    for (const name of ["messageId", "url", "scheduleId", "method"]) requireSafe(text(row[name]), "QSTASH_EVENT_FIELD_INVALID", field(name));
    requireSafe(row.messageId.length > 0 && /^[\x21-\x7e]{1,256}$/.test(row.messageId), "QSTASH_MESSAGE_ID_INVALID", field("messageId"));
    requireSafe(Number.isSafeInteger(row.time) && row.time >= 0 && (contract.fromDate === undefined || row.time >= contract.fromDate) &&
      (contract.toDate === undefined || row.time <= contract.toDate), "QSTASH_EVENT_TIME_INVALID", field("time"));
    requireSafe(row.scheduleId === contract.scheduleId, "QSTASH_SCHEDULE_PROVENANCE_MISMATCH", field("scheduleId"));
    requireSafe(row.url === contract.destination, "QSTASH_DESTINATION_MISMATCH", field("url"));
    const url = new URL(row.url);
    requireSafe(url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash, "QSTASH_DESTINATION_MISMATCH", field("url"));
    requireSafe(row.method === "GET" && (!Object.hasOwn(row, "timeout") || row.timeout === contract.timeout) &&
      (!Object.hasOwn(row, "header") || plain(row.header)), "QSTASH_METHOD_TIMEOUT_OR_HEADER_INVALID");
    requireSafe(Array.isArray(row.labels) && row.labels.every(text) && new Set(row.labels).size === row.labels.length &&
      same([...row.labels].sort(), [...contract.labels].sort()), "QSTASH_LABELS_MISMATCH", field("labels"));
    // Optional metadata does not establish provenance. Never return, display or
    // recursively inspect unknown metadata (which may contain sensitive bodies).
    for (const name of ["label", "callerIp", "host", "path"]) if (Object.hasOwn(row, name)) requireSafe(text(row[name]), "QSTASH_EVENT_FIELD_INVALID", field(name));
    for (const name of ["duration", "nextDeliveryTime"]) if (Object.hasOwn(row, name)) requireSafe(Number.isFinite(row[name]) && row[name] >= 0, "QSTASH_EVENT_FIELD_INVALID", field(name));
    if (row.state !== "DELIVERED" && Object.hasOwn(row, "responseStatus")) requireSafe(Number.isInteger(row.responseStatus) &&
      (row.responseStatus === 0 || (row.responseStatus >= 100 && row.responseStatus <= 599)), "QSTASH_DELIVERY_STATUS_INVALID", field("responseStatus"));
    let status = null;
    if (row.state === "DELIVERED") {
      if (options.legacyRedaction && row.responseStatus === 0) redactions.push(field("responseStatus"));
      else {
        requireSafe(Number.isInteger(row.responseStatus) && row.responseStatus >= 200 && row.responseStatus < 300,
          "QSTASH_DELIVERY_STATUS_INVALID", field("responseStatus"));
        status = row.responseStatus;
      }
    }
    // Sensitive headers, IPs, bodies and metadata never leave the decoder.
    return { time: row.time, messageId: row.messageId, state: row.state, scheduleId: row.scheduleId,
      destination: row.url, method: row.method, timeout: contract.timeout, responseStatus: status };
  });
  return { rows, cursor: cursor || null, redactions };
}
export function summarizeEvents(rows) {
  const unique = new Map(), groups = new Map();
  for (const row of rows) {
    requireSafe(plain(row) && typeof row.messageId === "string" && row.messageId.length > 0 && Object.hasOwn(STATE_FIELDS, row.state) &&
      Number.isSafeInteger(row.time), "QSTASH_NORMALIZED_ROW_INVALID");
    const key = JSON.stringify([row.messageId, row.state, row.time]);
    requireSafe(!unique.has(key) || same(unique.get(key), row), "QSTASH_EVENT_ROWS_AMBIGUOUS");
    unique.set(key, row);
  }
  for (const row of unique.values()) {
    if (!groups.has(row.messageId)) groups.set(row.messageId, []);
    groups.get(row.messageId).push(row);
  }
  const messages = [...groups.entries()].map(([messageId, events]) => {
    events.sort((a, b) => a.time - b.time);
    const state = name => events.filter(row => row.state === name);
    for (const name of Object.keys(STATE_FIELDS)) requireSafe(state(name).length <= 1, "QSTASH_MULTIPLE_MESSAGE_STATE_TRANSITIONS");
    const created = state("CREATED")[0], active = state("ACTIVE")[0], delivered = state("DELIVERED")[0];
    requireSafe((!created || !active || created.time <= active.time) && (!active || !delivered || active.time <= delivered.time) &&
      (!created || !delivered || created.time <= delivered.time), "QSTASH_MESSAGE_TIMELINE_INVALID");
    requireSafe(events.every(row => row.scheduleId === events[0].scheduleId && row.destination === events[0].destination && row.method === "GET" && row.timeout === events[0].timeout), "QSTASH_EVENT_ROWS_AMBIGUOUS");
    return { messageId, scheduleId: events[0].scheduleId, destination: events[0].destination, method: "GET", createdAt: created?.time,
      attemptAt: active?.time, deliveredAt: delivered?.time, deliveredStateObserved: !!delivered,
      delivered: !!(created && active && delivered && delivered.responseStatus >= 200 && delivered.responseStatus < 300),
      responseStatus: delivered?.responseStatus ?? null };
  });
  const values = [...unique.values()];
  return { uniqueMessageCount: messages.length, matchingRows: rows.length, deduplicatedRows: values.length,
    deliveryAttemptRows: values.filter(row => row.state === "ACTIVE").length,
    successfulDeliveryRows: values.filter(row => row.state === "DELIVERED" && row.responseStatus >= 200 && row.responseStatus < 300).length,
    deliveredStateRows: values.filter(row => row.state === "DELIVERED").length,
    states: ["CREATED", "ACTIVE", "DELIVERED"].filter(name => values.some(row => row.state === name)), messages, rows: values };
}
export function reviewCanaryEvidence(record, supplement, originalSha256) {
  requireSafe(record?.schema === 1 && record.source === "LIVE_CANARY_CAPTURE_AT_OPERATOR_EXECUTION" &&
    record.canary_schedule_id === CANARY_CONTRACT.scheduleId && record.destination === CANARY_CONTRACT.destination, "EVIDENCE_TARGET_OR_FORMAT_INVALID");
  requireSafe(record.canary_deleted_verified === true && record.application_data_isolation_verified === true, "EVIDENCE_CLEANUP_OR_ISOLATION_UNVERIFIED");
  requireSafe(Array.isArray(record.sanitized_pages) && record.sanitized_pages.length > 0 && record.sanitized_pages.length <= 100 &&
    record.structures?.length === record.sanitized_pages.length && Number.isSafeInteger(record.fixture_first_ms) && Number.isSafeInteger(record.fixture_cutoff_ms) &&
    record.fixture_cutoff_ms > record.fixture_first_ms, "EVIDENCE_CAPTURE_INCOMPLETE");
  const rows = [], missing = [];
  for (const [index, page] of record.sanitized_pages.entries()) {
    const structure = record.structures[index];
    requireSafe(structure?.top_level_type === "object" && structure.row_array_property === "events" && structure.body_cursor_present === false &&
      structure.pagination_header_present === false && structure.event_count === page.events?.length && !Object.hasOwn(page, "cursor"), "EVIDENCE_PAGINATION_OR_SHAPE_UNVERIFIED");
    const decoded = decodeEventPage(page, { ...CANARY_CONTRACT, fromDate: record.fixture_first_ms - 5000, toDate: record.fixture_cutoff_ms },
      { legacyRedaction: record.redaction_version === undefined });
    rows.push(...decoded.rows);
    missing.push(...decoded.redactions.map(field => `sanitized_pages[${index}].${field}`));
  }
  let summary = summarizeEvents(rows), message = summary.messages[0];
  requireSafe(summary.uniqueMessageCount === 1 && message?.createdAt !== undefined && message?.attemptAt !== undefined && message?.deliveredStateObserved,
    "EVIDENCE_SCHEDULE_ATTEMPT_OR_DELIVERED_STATE_MISSING");
  if (supplement !== undefined) {
    requireSafe(plain(supplement) && Object.keys(supplement).length === Object.keys(REVIEWED_STATUS).length &&
      Object.entries(REVIEWED_STATUS).every(([name, value]) => Object.hasOwn(supplement, name) && supplement[name] === value),
    "EVIDENCE_REVIEW_SUPPLEMENT_INVALID");
    requireSafe(originalSha256 === REVIEWED_STATUS.original_evidence_sha256, "EVIDENCE_ORIGINAL_HASH_MISMATCH");
    // The raw live message ID was anonymized during capture. Bind to the sole
    // captured alias + timeline, destination and original bytes, not a new ID.
    const correlation = { scheduleId: record.canary_schedule_id, destination: record.destination, messageId: message.messageId,
      lifecycle: summary.rows.map(row => ({ state: row.state, time: row.time })).sort((a, b) => a.time - b.time) };
    requireSafe(sha256(JSON.stringify(correlation)) === REVIEWED_STATUS.correlation_sha256, "EVIDENCE_REVIEW_CORRELATION_MISMATCH");
    requireSafe(rows.length === 3 && record.redaction_version === undefined && missing.length === 1 &&
      missing[0] === "sanitized_pages[1].events[0].responseStatus" &&
      summary.rows.filter(row => row.state === "DELIVERED" && row.responseStatus === null).length === 1,
    "EVIDENCE_REVIEW_TARGET_AMBIGUOUS");
    // Overlay only a normalized in-memory row. Do not modify even the parsed
    // original object, and never expose this legacy repair to live decoding.
    summary = summarizeEvents(summary.rows.map(row => row.state === "DELIVERED" ? { ...row, responseStatus: REVIEWED_STATUS.response_status } : row));
    message = summary.messages[0]; missing.length = 0;
  }
  const ready = missing.length === 0 && message.delivered;
  return { ready, code: ready ? "OK" : "EVIDENCE_RESPONSE_STATUS_REDACTED", missingFields: missing, capturedEventCount: rows.length,
    observedStates: summary.states, automaticScheduleProvenance: true, deliveryAttemptVerified: true,
    successfulDeliveryVerified: ready, deliveredStateObserved: true, uniqueMessageCount: summary.uniqueMessageCount };
}
export function readCanaryEvidence(path = EVIDENCE_PATH) {
  let bytes, record, supplement;
  try { bytes = readFileSync(path); } catch { throw new SafeFailure("EVIDENCE_FILE_READ_FAILED"); }
  requireSafe(bytes.length > 0 && bytes.length <= 1000000, "EVIDENCE_FILE_SIZE_INVALID");
  try { record = JSON.parse(bytes.toString("utf8")); } catch { throw new SafeFailure("EVIDENCE_JSON_INVALID"); }
  // No operator-supplied supplement path or success value. Fixture-only reads
  // remain independent; the production path uses this one explicit review.
  if (resolve(path instanceof URL ? fileURLToPath(path) : path) === EVIDENCE_PATH) {
    // Pin even when the supplement is missing, so editing the original status
    // and removing the supplement can never manufacture a passing review.
    requireSafe(sha256(bytes) === REVIEWED_STATUS.original_evidence_sha256, "EVIDENCE_ORIGINAL_HASH_MISMATCH");
    let supplementBytes;
    try { supplementBytes = readFileSync(REVIEW_SUPPLEMENT_PATH); }
    catch (error) { requireSafe(error.code === "ENOENT", "EVIDENCE_REVIEW_SUPPLEMENT_READ_FAILED"); }
    if (supplementBytes) {
      requireSafe(supplementBytes.length > 0 && supplementBytes.length <= 4096, "EVIDENCE_REVIEW_SUPPLEMENT_SIZE_INVALID");
      try { supplement = JSON.parse(supplementBytes.toString("utf8")); } catch { throw new SafeFailure("EVIDENCE_REVIEW_SUPPLEMENT_JSON_INVALID"); }
    }
  }
  return reviewCanaryEvidence(record, supplement, sha256(bytes));
}
export function requireCanaryEvidenceReady() {
  const report = readCanaryEvidence();
  requireSafe(report.ready, report.code, report.missingFields[0]);
  return report;
}
