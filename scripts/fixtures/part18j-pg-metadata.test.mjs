import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";

// Exercise the operator's actual metadata helpers without loading credentials,
// connecting to PostgreSQL, or invoking the operator's main function.
const root = resolve(import.meta.dirname, "../..");
const source = readFileSync(resolve(root, "scripts/part18j-apply-dev-reauth-migration.mjs"), "utf8");
const helpers = source.slice(source.indexOf("const FUNCTION_METADATA_SQL ="), source.indexOf("\nfunction one("));
const ref = "ckwadpmvxieekjlsfcks";
const host = "aws-1-ap-northeast-2.pooler.supabase.com";
const definition = `create function public.offline_fixture() returns uuid\n${"-- synthetic definition\n".repeat(10)}`;
const args = "p_user_id uuid, p_provider_subject text, p_display_email text, p_granted_scopes text[], p_refresh_token_ciphertext bytea, p_refresh_token_nonce bytea, p_refresh_token_auth_tag bytea, p_encryption_key_version smallint";
function fixture() {
  return { identity: { database_name: "postgres", qa_connection_count: 1, qa_job_count: 1, target_migration_count: 0 },
    functions: [{ args, result_type: "uuid", security_definer: true, settings: ["search_path="],
      service_execute: true, anon_execute: false, authenticated_execute: false, public_execute: false, definition }] };
}
function harness(options = {}) {
  const calls = [];
  let configuration;
  class SafeFailure extends Error {}
  class Client {
    constructor(config) { configuration = config; }
    on() {}
    async connect() { calls.push("connect"); if (options.connectError) throw options.connectError; }
    async query(sql) {
      calls.push(sql);
      if (sql === "BEGIN READ ONLY" || sql === "ROLLBACK") return {};
      if (options.queryError) throw options.queryError;
      return options.result || { rows: [{ metadata: options.payload || fixture() }], fields: [{ name: "metadata" }] };
    }
    async end() { calls.push("end"); }
  }
  const files = new Map([
    [resolve(root, "supabase/.temp/project-ref"), ref],
    [resolve(root, "supabase/.temp/linked-project.json"), JSON.stringify({ ref })],
    [resolve(root, "supabase/.temp/pooler-url"), `postgresql://postgres.${ref}@${options.host || host}:5432/postgres`],
    [resolve(root, "offline-ca.pem"), options.ca || "-----BEGIN CERTIFICATE-----\noffline-fixture\n-----END CERTIFICATE-----"],
  ]);
  const api = runInNewContext(`${helpers}\n({readFunction, classifyPgFailure, parseFunctionMetadataOutput})`, {
    ROOT: root, DEV_REF: ref, CONNECTION_ID: "e652e5c8-f08c-4736-88d8-073bce772ccc",
    JOB_ID: "b9eb8a77-0723-675b-3f2b-8503a0781ab8", VERSION: "202610160001",
    SafeFailure, requireSafe: (condition, code) => { if (!condition) throw new SafeFailure(code); },
    resolve, URL, pg: { Client },
    process: { env: { SUPABASE_DB_PASSWORD: options.password || "offline-password",
      ...(options.caPath ? { SUPABASE_DB_CA_CERT_PATH: "offline-ca.pem" } : {}) } },
    readFileSync: path => { assert.ok(files.has(path)); return files.get(path); },
  });
  return { ...api, calls, configuration: () => configuration };
}

test("direct metadata query preserves the pinned target, verified TLS, and read-only transaction", async () => {
  const h = harness();
  assert.equal(await h.readFunction(null, false), definition);
  const c = h.configuration();
  assert.equal(c.host, host);
  assert.equal(c.port, 5432);
  assert.equal(c.database, "postgres");
  assert.equal(c.user, `postgres.${ref}`);
  assert.equal(c.password, "offline-password");
  assert.equal(c.connectionString, undefined);
  assert.equal(c.ssl.rejectUnauthorized, true);
  assert.equal(c.ssl.servername, host);
  assert.equal(c.sslnegotiation, "postgres");
  assert.equal(h.calls[1], "BEGIN READ ONLY");
  assert.match(h.calls[2], /select pg_catalog.row_to_json\(bundle\) as metadata/);
  assert.match(h.calls[2], /select coalesce\(/);
  assert.doesNotMatch(h.calls[2], /pg_catalog\.coalesce|base64|offline-password/);
  assert.equal(h.calls[3], "ROLLBACK");
  assert.equal(h.calls[4], "end");
});

for (const [code, expected] of [
  ["ENOTFOUND", "PG_DNS_FAILED"], ["EAI_AGAIN", "PG_DNS_FAILED"],
  ["ETIMEDOUT", "PG_CONNECT_TIMEOUT"], ["28P01", "PG_AUTH_FAILED pg_code=28P01"],
  ["3D000", "PG_DATABASE_NOT_FOUND pg_code=3D000"],
  ["SELF_SIGNED_CERT_IN_CHAIN", "PG_TLS_FAILED"],
  ["ERR_TLS_CERT_ALTNAME_INVALID", "PG_TLS_FAILED"],
]) {
  test(`sanitizes connection failure ${code}`, async () => {
    const h = harness({ connectError: Object.assign(new Error("DO_NOT_EXPOSE_FIXTURE"), { code }) });
    await assert.rejects(h.readFunction(null, false), error => error.message === expected);
    assert.equal(h.calls.at(-1), "end");
  });
}
test("known pg connection timeout without SQLSTATE is classified", async () => {
  const h = harness({ connectError: new Error("Connection terminated due to connection timeout") });
  await assert.rejects(h.readFunction(null, false), { message: "PG_CONNECT_TIMEOUT" });
});
test("function-query SQLSTATE is safe and connection cleanup still runs", async () => {
  const h = harness({ queryError: Object.assign(new Error("DO_NOT_EXPOSE_FIXTURE"), { code: "42883" }) });
  await assert.rejects(h.readFunction(null, false), { message: "PG_FUNCTION_QUERY_FAILED pg_code=42883" });
  assert.equal(h.calls.at(-1), "end");
});
test("unknown connection errors never expose the raw message or code", async () => {
  const h = harness({ connectError: Object.assign(new Error("DO_NOT_EXPOSE_FIXTURE"), { code: "DO_NOT_EXPOSE_CODE" }) });
  await assert.rejects(h.readFunction(null, false), { message: "PG_OTHER_SAFE_FAILURE" });
});
test("malformed result fails closed", async () => {
  const h = harness({ result: { rows: [], fields: [] } });
  await assert.rejects(h.readFunction(null, false), { message: "PG_RESULT_INVALID" });
});
test("incorrect live fixture identity fails closed", async () => {
  const payload = fixture();
  payload.identity.qa_job_count = 0;
  await assert.rejects(harness({ payload }).readFunction(null, false), { message: "DATABASE_IDENTITY_MISMATCH" });
});
test("ambiguous overloads fail closed", async () => {
  const payload = fixture();
  payload.functions.push({ ...payload.functions[0] });
  await assert.rejects(harness({ payload }).readFunction(null, false), { message: "FUNCTION_OVERLOAD_OR_MISSING" });
});
test("wrong execute grants fail closed", async () => {
  const payload = fixture();
  payload.functions[0].public_execute = true;
  await assert.rejects(harness({ payload }).readFunction(null, false), { message: "FUNCTION_GRANTS_MISMATCH" });
});
test("PostgreSQL's quoted empty search_path remains accepted", async () => {
  const payload = fixture();
  payload.functions[0].settings = ['search_path=""'];
  assert.equal(await harness({ payload }).readFunction(null, false), definition);
});
test("a nonempty search_path still fails closed", async () => {
  const payload = fixture();
  payload.functions[0].settings = ["search_path=public"];
  await assert.rejects(harness({ payload }).readFunction(null, false), { message: "FUNCTION_SEARCH_PATH_MISMATCH" });
});
test("password whitespace is preserved exactly in memory", async () => {
  const h = harness({ password: " offline-password " });
  await h.readFunction(null, false);
  assert.equal(h.configuration().password, " offline-password ");
});
test("wrong pooler host is rejected before connection", async () => {
  const h = harness({ host: "wrong.invalid" });
  await assert.rejects(h.readFunction(null, false), { message: "DEV_POOLER_INVALID" });
  assert.equal(h.calls.length, 0);
});
test("optional CA preserves certificate and hostname verification", async () => {
  const h = harness({ caPath: true });
  await h.readFunction(null, false);
  assert.match(h.configuration().ssl.ca, /BEGIN CERTIFICATE/);
  assert.equal(h.configuration().ssl.rejectUnauthorized, true);
  assert.equal(h.configuration().ssl.servername, host);
});
test("a private key cannot be supplied as a CA", async () => {
  const h = harness({ caPath: true, ca: "-----BEGIN CERTIFICATE-----\n-----BEGIN PRIVATE KEY-----" });
  await assert.rejects(h.readFunction(null, false), { message: "PG_TLS_CA_INVALID" });
  assert.equal(h.calls.length, 0);
});
test("failure observation can fingerprint an applied body that fails the new contract", async () => {
  const payload = fixture();
  payload.identity.target_migration_count = 1;
  await assert.rejects(harness({ payload }).readFunction(null, true), { message: "SUBJECT_REJECTION_MISSING" });
  assert.equal(await harness({ payload }).readFunction(null, true, true), definition);
});
test("ambiguous-ledger observation retains fixture and migration-count bounds", async () => {
  const payload = fixture();
  payload.identity.target_migration_count = 1;
  assert.equal(await harness({ payload }).readFunction(null, null, true), definition);
  payload.identity.target_migration_count = 2;
  await assert.rejects(harness({ payload }).readFunction(null, null, true), { message: "DATABASE_IDENTITY_MISMATCH" });
});
