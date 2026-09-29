import { createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

import { loadLocalTestEnvironment } from "../lib/testing/local-environment.mjs";

loadLocalTestEnvironment();

const PINNED_REF = "ckwadpmvxieekjlsfcks";
const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "CALENDAR_TOKEN_ENCRYPTION_KEY",
  "GOOGLE_CALENDAR_REDIRECT_URI",
];

function fail(reason) {
  throw new Error(`Part 18J-B live audit failed: ${reason}`);
}

function value(name) {
  const result = process.env[name]?.trim();
  if (!result) fail(`missing ${name}`);
  return result;
}

for (const name of required) value(name);

const target = new URL(value("NEXT_PUBLIC_SUPABASE_URL"));
const redirect = new URL(value("GOOGLE_CALENDAR_REDIRECT_URI"));
const linkedRef = readFileSync(resolve("supabase/.temp/project-ref"), "utf8").trim();
if (
  target.protocol !== "https:" ||
  target.hostname !== `${PINNED_REF}.supabase.co` ||
  linkedRef !== PINNED_REF ||
  redirect.pathname !== "/api/calendar/google/callback" ||
  /prod/i.test(`${target.hostname}${redirect.hostname}`)
) fail("target guard did not resolve exclusively to pinned watchflow-dev");

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(target.origin, value("SUPABASE_SECRET_KEY"), options);
const anon = createClient(
  target.origin,
  value("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  options,
);

function bytea(value) {
  return `\\x${value.toString("hex")}`;
}

async function authenticateQaUser(kind) {
  const qa = createClient(
    target.origin,
    value("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    options,
  );
  const result = await qa.auth.signInWithPassword({
    email: value(`E2E_USER_${kind}_EMAIL`),
    password: value(`E2E_USER_${kind}_PASSWORD`),
  });
  if (result.error || !result.data.user) fail(`QA User ${kind} authentication failed`);
  return { client: qa, userId: result.data.user.id };
}

const probes = [
  ["calendar_connections", "id,user_id,provider,provider_subject,display_email,provider_calendar_id,sync_enabled,status,granted_scopes"],
  ["calendar_credentials", "connection_id,refresh_token_ciphertext,refresh_token_nonce,refresh_token_auth_tag,encryption_key_version"],
  ["calendar_oauth_states", "id,user_id,state_hash,binding_hash,expires_at,consumed_at,created_at"],
  ["calendar_event_mappings", "id,user_id,connection_id,source_key"],
  ["calendar_sync_jobs", "id,user_id,connection_id,source_key,state"],
];

for (const [relation, columns] of probes) {
  const result = await admin.from(relation).select(columns).limit(0);
  if (result.error) fail(`required relation or columns unavailable: ${relation}`);
}

const openApiResponse = await fetch(new URL("/rest/v1/", target), {
  headers: {
    accept: "application/openapi+json",
    apikey: value("SUPABASE_SECRET_KEY"),
  },
});
if (!openApiResponse.ok) fail("REST schema contract unavailable");
const openApi = await openApiResponse.json();
const requiredRpcs = [
  "watchflow_create_calendar_oauth_state",
  "watchflow_consume_calendar_oauth_state",
  "watchflow_upsert_google_calendar_connection",
  "watchflow_read_google_calendar_credential",
  "watchflow_disconnect_google_calendar_connection",
  "watchflow_set_calendar_sync_enabled",
  "watchflow_claim_calendar_sync_jobs",
  "watchflow_finalize_calendar_sync_job",
];
for (const rpc of requiredRpcs) {
  if (!openApi?.paths?.[`/rpc/${rpc}`]) fail(`required RPC unavailable: ${rpc}`);
}

for (const relation of [
  "calendar_connections",
  "calendar_credentials",
  "calendar_oauth_states",
]) {
  const result = await anon.from(relation).select("*").limit(1);
  if (!result.error) fail(`anonymous role unexpectedly read ${relation}`);
}

const forbiddenHelper = await admin.rpc("watchflow_calendar_source_key", {
  p_connection_id: "00000000-0000-0000-0000-000000000001",
  p_user_movie_id: "00000000-0000-0000-0000-000000000002",
});
if (!forbiddenHelper.error) fail("service_role directly executed a Part 18J-A private helper");

const connectionsResult = await admin
  .from("calendar_connections")
  .select("id,user_id,provider,provider_subject,display_email,provider_calendar_id,sync_enabled,status,granted_scopes,connected_at,updated_at")
  .eq("provider", "google");
if (connectionsResult.error) fail("connection metadata could not be audited");
const connections = connectionsResult.data ?? [];
if (connections.length < 1) fail("no connected Google account exists after manual smoke acceptance");
if (new Set(connections.map((row) => row.user_id)).size !== connections.length) {
  fail("an owner has duplicate Google connections");
}
for (const row of connections) {
  if (
    row.provider_calendar_id !== "primary" ||
    row.status !== "connected" ||
    row.sync_enabled !== true ||
    typeof row.provider_subject !== "string" || !row.provider_subject ||
    typeof row.display_email !== "string" || !row.display_email ||
    !Array.isArray(row.granted_scopes) ||
    !row.granted_scopes.includes("https://www.googleapis.com/auth/calendar.events")
  ) fail("connected account metadata does not match the approved final state");
}

const credentialsResult = await admin
  .from("calendar_credentials")
  .select("connection_id,refresh_token_ciphertext,refresh_token_nonce,refresh_token_auth_tag,encryption_key_version");
if (credentialsResult.error) fail("encrypted credentials could not be audited");
const credentials = credentialsResult.data ?? [];
if (credentials.length !== connections.length) fail("connection/credential cardinality mismatch");

function bytes(value) {
  if (typeof value !== "string" || !/^\\x[0-9a-f]+$/i.test(value)) {
    fail("credential envelope is not encoded bytea");
  }
  return Buffer.from(value.slice(2), "hex");
}

const keyText = value("CALENDAR_TOKEN_ENCRYPTION_KEY");
const key = Buffer.from(keyText, "base64");
if (!/^[A-Za-z0-9+/]+={0,2}$/.test(keyText) || key.length !== 32) {
  fail("calendar encryption key is not 32-byte base64");
}
for (const credential of credentials) {
  const connection = connections.find((row) => row.id === credential.connection_id);
  if (!connection) fail("credential is not attached to its owner connection");
  const ciphertext = bytes(credential.refresh_token_ciphertext);
  const nonce = bytes(credential.refresh_token_nonce);
  const tag = bytes(credential.refresh_token_auth_tag);
  if (ciphertext.length < 1 || nonce.length !== 12 || tag.length !== 16) {
    fail("credential envelope lengths are invalid");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(Buffer.from(
    `watchflow:calendar-refresh-token:v${credential.encryption_key_version}:${connection.user_id}`,
    "utf8",
  ));
  decipher.setAuthTag(tag);
  let plaintext;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    fail("credential could not be authenticated/decrypted with the configured owner-bound key");
  }
  if (!plaintext?.length || plaintext.equals(ciphertext)) {
    fail("credential ciphertext did not prove an encrypted token envelope");
  }
  plaintext.fill(0);
}

const statesResult = await admin
  .from("calendar_oauth_states")
  .select("id,user_id,state_hash,binding_hash,expires_at,consumed_at,created_at");
if (statesResult.error) fail("OAuth state lifecycle could not be audited");
const states = statesResult.data ?? [];
for (const state of states) {
  if (
    bytes(state.state_hash).length !== 32 ||
    bytes(state.binding_hash).length !== 32 ||
    new Date(state.expires_at).getTime() - new Date(state.created_at).getTime() > 15 * 60_000 ||
    state.consumed_at === null
  ) fail("OAuth state is not hashed, bounded, and consumed");

  const replay = await admin.rpc("watchflow_consume_calendar_oauth_state", {
    p_user_id: state.user_id,
    p_state_hash: state.state_hash,
    p_binding_hash: state.binding_hash,
  });
  if (replay.error || replay.data !== false) fail("consumed OAuth state was replayable");
}

const ownerId = connections[0].user_id;
const forbiddenOauthCalls = [
  ["watchflow_consume_calendar_oauth_state", {
    p_user_id: ownerId,
    p_state_hash: "\\x" + "00".repeat(32),
    p_binding_hash: "\\x" + "00".repeat(32),
  }],
  ["watchflow_read_google_calendar_credential", { p_user_id: ownerId }],
  ["watchflow_disconnect_google_calendar_connection", { p_user_id: ownerId }],
  ["watchflow_set_calendar_sync_enabled", { p_enabled: false }],
];
for (const [rpc, args] of forbiddenOauthCalls) {
  const result = await anon.rpc(rpc, args);
  if (!result.error) fail(`anonymous role unexpectedly executed ${rpc}`);
}

let cleanedStates = 0;
if (process.argv.includes("--cleanup-consumed-states") && states.length > 0) {
  const ownerIds = new Set(connections.map((row) => row.user_id));
  if (states.some((state) => !ownerIds.has(state.user_id) || state.consumed_at === null)) {
    fail("cleanup refused because an OAuth state is not a consumed state for a connected owner");
  }
  const ids = states.map((state) => state.id);
  const cleanup = await admin
    .from("calendar_oauth_states")
    .delete()
    .in("id", ids)
    .select("id");
  if (cleanup.error || cleanup.data?.length !== ids.length) {
    fail("exact consumed-state cleanup did not complete");
  }
  cleanedStates = ids.length;
}

let isolationEvidence = false;
if (process.argv.includes("--two-user-isolation")) {
  if (
    process.env.E2E_TARGET_ENV !== "development" ||
    new URL(value("E2E_EXPECTED_SUPABASE_URL")).origin !== target.origin ||
    value("E2E_EXPECTED_SUPABASE_PROJECT_REF") !== PINNED_REF ||
    process.env.RUN_PART18J_INTEGRATION_TESTS !== "true"
  ) fail("two-user mutation guard is not enabled for pinned watchflow-dev");

  const userA = await authenticateQaUser("A");
  const userB = await authenticateQaUser("B");
  if (userA.userId === userB.userId) fail("QA users are not distinct");

  if (connections.some((row) => row.user_id === userA.userId || row.user_id === userB.userId)) {
    fail("isolation fixture guard requires QA A and QA B to have no pre-existing calendar connection");
  }
  const originalConnections = structuredClone(connections).sort((a, b) => a.id.localeCompare(b.id));
  let connectionBId = null;
  let connectionAId = null;
  let stateAId = null;
  try {
    async function createFixtureConnection(userId, label) {
      const fixtureConnection = await admin.rpc(
        "watchflow_upsert_google_calendar_connection",
        {
        p_user_id: userId,
        p_provider_subject: `part18j-b-${randomUUID()}`,
        p_display_email: `part18j-b-${label}-${randomUUID()}@example.invalid`,
        p_granted_scopes: ["https://www.googleapis.com/auth/calendar.events"],
        p_refresh_token_ciphertext: bytea(randomBytes(48)),
        p_refresh_token_nonce: bytea(randomBytes(12)),
        p_refresh_token_auth_tag: bytea(randomBytes(16)),
        p_encryption_key_version: 1,
      },
      );
      if (fixtureConnection.error || typeof fixtureConnection.data !== "string") {
        fail(`User ${label} disposable connection fixture could not be created`);
      }
      return fixtureConnection.data;
    }
    connectionAId = await createFixtureConnection(userA.userId, "A");
    connectionBId = await createFixtureConnection(userB.userId, "B");

    const stateHash = randomBytes(32);
    const bindingHash = randomBytes(32);
    const fixtureState = await admin.rpc("watchflow_create_calendar_oauth_state", {
      p_user_id: userA.userId,
      p_state_hash: bytea(stateHash),
      p_binding_hash: bytea(bindingHash),
      p_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
    if (fixtureState.error || typeof fixtureState.data !== "string") {
      fail("User A disposable OAuth-state fixture could not be created");
    }
    stateAId = fixtureState.data;

    const [visibleA, visibleB] = await Promise.all([
      userA.client.from("calendar_connections").select("id,user_id,sync_enabled").order("id"),
      userB.client.from("calendar_connections").select("id,user_id,sync_enabled").order("id"),
    ]);
    if (
      visibleA.error || visibleB.error ||
      visibleA.data?.length !== 1 || visibleA.data[0].id !== connectionAId ||
      visibleB.data?.length !== 1 || visibleB.data[0].id !== connectionBId
    ) fail("owner-scoped connection metadata isolation failed");

    const toggleB = await userB.client.rpc("watchflow_set_calendar_sync_enabled", {
      p_enabled: false,
    });
    if (toggleB.error || toggleB.data !== true) fail("User B owner-derived sync toggle failed");
    const afterToggle = await admin
      .from("calendar_connections")
      .select("id,user_id,sync_enabled")
      .in("id", [connectionAId, connectionBId]);
    const rowA = afterToggle.data?.find((row) => row.id === connectionAId);
    const rowB = afterToggle.data?.find((row) => row.id === connectionBId);
    if (afterToggle.error || rowA?.sync_enabled !== true || rowB?.sync_enabled !== false) {
      fail("User B sync toggle affected User A or failed owner scoping");
    }

    for (const attempt of [
      userB.client.from("calendar_connections").update({ sync_enabled: false }).eq("id", connectionAId),
      userA.client.from("calendar_connections").update({ sync_enabled: false }).eq("id", connectionBId),
      userB.client.from("calendar_connections").delete().eq("id", connectionAId),
    ]) {
      const result = await attempt;
      if (!result.error) fail("authenticated direct provider-state mutation was unexpectedly allowed");
    }

    for (const result of await Promise.all([
      userA.client.from("calendar_credentials").select("connection_id"),
      userB.client.from("calendar_credentials").select("connection_id"),
      userB.client.rpc("watchflow_read_google_calendar_credential", {
        p_user_id: userA.userId,
      }),
      userB.client.rpc("watchflow_disconnect_google_calendar_connection", {
        p_user_id: userA.userId,
      }),
      userB.client.rpc("watchflow_consume_calendar_oauth_state", {
        p_user_id: userA.userId,
        p_state_hash: bytea(stateHash),
        p_binding_hash: bytea(bindingHash),
      }),
    ])) {
      if (!result.error) fail("authenticated privileged credential/state operation was unexpectedly allowed");
    }

    for (const client of [userA.client, userB.client]) {
      const helper = await client.rpc("watchflow_calendar_source_key", {
        p_connection_id: connectionAId,
        p_user_movie_id: randomUUID(),
      });
      if (!helper.error) fail("authenticated role executed a Part 18J-A private helper");
    }

    const invalidClaim = await admin.rpc("watchflow_claim_calendar_sync_jobs", {
      p_batch_size: 0,
      p_lease_seconds: 30,
    });
    if (!invalidClaim.error || invalidClaim.error.code === "42501") {
      fail("Part 18J-A service-role claim entrypoint is unavailable");
    }
    const finalizeProbe = await admin.rpc("watchflow_finalize_calendar_sync_job", {
      p_job_id: randomUUID(),
      p_lease_token: randomUUID(),
      p_source_version: "0".repeat(32),
      p_outcome: "failed",
      p_provider_event_id: null,
      p_provider_etag: null,
      p_provider_status_code: null,
      p_error_code: "acceptance_probe",
    });
    if (finalizeProbe.error || finalizeProbe.data !== false) {
      fail("Part 18J-A service-role finalize entrypoint is unavailable");
    }
    isolationEvidence = true;
  } finally {
    if (stateAId) {
      await admin.from("calendar_oauth_states").delete().eq("id", stateAId);
    }
    if (connectionBId) {
      await admin.from("calendar_connections").delete().eq("id", connectionBId);
    }
    if (connectionAId) {
      await admin.from("calendar_connections").delete().eq("id", connectionAId);
    }
    await Promise.allSettled([
      userA.client.auth.signOut(),
      userB.client.auth.signOut(),
    ]);
  }

  const [finalConnections, finalCredentials, finalStates] = await Promise.all([
    admin.from("calendar_connections").select("id,user_id,provider,provider_subject,display_email,provider_calendar_id,sync_enabled,status,granted_scopes,connected_at,updated_at"),
    admin.from("calendar_credentials").select("connection_id", { count: "exact" }),
    admin.from("calendar_oauth_states").select("id", { count: "exact", head: true }),
  ]);
  const restoredConnections = (finalConnections.data ?? []).sort((a, b) => a.id.localeCompare(b.id));
  if (
    finalConnections.error || finalCredentials.error || finalStates.error ||
    JSON.stringify(restoredConnections) !== JSON.stringify(originalConnections) ||
    finalCredentials.count !== credentials.length || finalStates.count !== states.length ||
    finalConnections.data?.some((row) => row.user_id === userA.userId || row.user_id === userB.userId)
  ) fail("isolation cleanup did not exactly restore the original calendar state");
}

const digest = createHash("sha256")
  .update(JSON.stringify({ connections: connections.length, credentials: credentials.length, states: states.length }))
  .digest("hex")
  .slice(0, 12);
console.log("Part 18J-B guarded live audit passed against pinned watchflow-dev.");
console.log(`Safe counts: connections=${connections.length}, credentials=${credentials.length}, consumedStates=${states.length}.`);
console.log(`Audit evidence digest=${digest}.`);
if (cleanedStates > 0) console.log(`Cleanup: removed exactly ${cleanedStates} consumed OAuth state row(s).`);
if (isolationEvidence) console.log("Two-user isolation: owner reads/mutations, credential/state denial, and exact cleanup passed.");
