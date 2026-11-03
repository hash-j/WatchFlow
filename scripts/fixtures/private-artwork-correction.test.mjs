import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import pg from "pg";
import { correctiveMigrationBody, inspectArtwork, validateArtwork } from "../apply-dev-private-artwork-migration.mjs";

const filename = "202611020002_fix_private_list_artwork_policies.sql";
const bytes = readFileSync(new URL(`../../supabase/migrations/${filename}`, import.meta.url));
const sql = bytes.toString("utf8");
test("one pinned forward correction changes only two INSERT checks and an invoker ownership helper", () => {
  assert.equal(readdirSync(new URL("../../supabase/migrations/", import.meta.url)).filter(f => f.startsWith("202611020002_")).length, 1);
  assert.match(correctiveMigrationBody(bytes), /watchflow_user_owns_list_artwork_path/);
  assert.deepEqual([...sql.matchAll(/alter policy (\w+) on storage\.objects/g)].map(m => m[1]).sort(),
    ["watchflow_artwork_insert_own", "watchflow_artwork_list_insert_guard"]);
  assert.equal([...sql.matchAll(/create function /g)].length, 1);
  assert.doesNotMatch(sql, /\b(?:insert into|update|delete from|drop policy|alter table|security definer)\b/i);
  assert.match(sql, /security invoker set search_path = ''/);
  assert.match(sql, /l\.id::text = pg_catalog\.split_part\(\$1, '\/', 3\)/);
  assert.match(sql, /l\.user_id = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(sql, /l\.name|split_part\(name, '\/', 3\)/);
  assert.match(sql, /public\.watchflow_owns_artwork_path\(\$1\)/);
  assert.match(sql, /split_part\(\$1, '\/', 1\) = 'list-thumbnails'/);
  assert.match(sql, /from public, anon, authenticated/);
  assert.match(sql, /grant execute .* to authenticated/);
});

// Runtime authorization tests require a separately prepared LOCAL Supabase DB
// with both artwork migrations already installed. Never install migrations here.
// Default is SKIP; Codex runs this file only with this flag forced to "0".
describe("corrected PostgreSQL authorization (local database only)", {
  skip: process.env.WATCHFLOW_ARTWORK_LOCAL_TESTS !== "1",
}, () => {
  let client;
  const a = randomUUID(), b = randomUUID(), listA = randomUUID(), listB = randomUUID(), missing = randomUUID();
  const version = () => `${randomUUID()}.webp`;
  const path = (owner, list) => `list-thumbnails/${owner}/${list}/${version()}`;
  async function query(text, values) {
    try { return await client.query(text, values); }
    catch (error) { const safe = new Error("LOCAL_ARTWORK_QUERY_FAILED"); safe.code = error.code; throw safe; }
  }
  async function asOwner(owner) {
    await query("set local role authenticated");
    await query("select set_config('request.jwt.claim.sub',$1,true)", [owner]);
  }
  async function allowed(value) {
    return (await query("select public.watchflow_user_owns_list_artwork_path($1) as allowed", [value])).rows[0].allowed;
  }
  before(async () => {
    // Host, port and DB are fixed loopback values; no development/Production
    // connection URL, Supabase password or remote target is accepted.
    assert.ok(process.env.PGPASSWORD, "LOCAL_PGPASSWORD_REQUIRED");
    client = new pg.Client({ host: "127.0.0.1", port: 54322, database: "postgres", user: "postgres",
      password: process.env.PGPASSWORD, connectionTimeoutMillis: 5000, query_timeout: 10000 });
    client.on("error", () => {});
    try { await client.connect(); } catch { throw new Error("LOCAL_ARTWORK_DATABASE_UNAVAILABLE"); }
    const installed = await query("select version from supabase_migrations.schema_migrations where version='202611020002'");
    assert.equal(installed.rows.length, 1, "LOCAL_CORRECTION_MUST_ALREADY_BE_INSTALLED");
    await query("begin");
    for (const [id, label] of [[a, "a"], [b, "b"]]) {
      await query("insert into auth.users(id,email,raw_user_meta_data,created_at,updated_at) values($1,$2,'{}',now(),now())",
        [id, `artwork-${label}-${id}@example.invalid`]);
      await query("insert into public.profiles(id) values($1) on conflict(id) do nothing", [id]);
    }
    await query("insert into public.lists(id,user_id,name) values($1,$2,'Owned list'),($3,$4,'Other list')", [listA, a, listB, b]);
    await asOwner(a);
  });
  after(async () => { if (client) { await client.query("rollback").catch(() => {}); await client.end().catch(() => {}); } });
  test("valid owner/list object path is accepted", async () => { assert.equal(await allowed(path(a, listA)), true); });
  test("another user's list is rejected", async () => { assert.equal(await allowed(path(a, listB)), false); });
  test("mismatching owner namespace is rejected", async () => { assert.equal(await allowed(path(b, listA)), false); });
  test("nonexistent list is rejected", async () => { assert.equal(await allowed(path(a, missing)), false); });
  test("list title matching an ID cannot grant access to a different or missing path ID", async () => {
    await query("reset role");
    await query("update public.lists set name=$1 where id=$2", [`titles/ignored/${listA}`, listA]);
    await asOwner(a);
    assert.equal(await allowed(path(a, listA)), true);
    assert.equal(await allowed(path(a, missing)), false);
    assert.equal(await allowed(path(a, listB)), false);
  });
  test("malformed, null, extra-segment and traversal paths are rejected", async () => {
    for (const value of [null, "", "../x", `list-thumbnails/${a}/../${version()}`, `${path(a, listA)}/extra`, path(a, listA).replace(".webp", ".svg")]) {
      assert.equal(await allowed(value), false);
    }
  });
  test("avatar owner upload policy remains valid without invoking list ownership", async () => {
    const avatar = `avatars/${a}/${version()}`;
    assert.equal(await allowed(avatar), false);
    assert.equal((await query("select public.watchflow_owns_artwork_path($1) as own", [avatar])).rows[0].own, true);
    // Metadata fixture only, no physical upload. The enclosing LOCAL transaction
    // is rolled back; no Storage API or calendar/executor is called.
    assert.equal((await query("insert into storage.objects(bucket_id,name) values('watchflow-artwork',$1) returning name", [avatar])).rows.length, 1);
  });
  test("actual PostgreSQL-deparsed policy definitions pass the production validator", async () => {
    await query("reset role");
    await query("set local search_path=''");
    const state = await inspectArtwork(client);
    validateArtwork(state, true);
    await asOwner(a);
  });
  test("cross-user INSERT and all overwrites are denied by the actual RLS policies", async () => {
    await query("savepoint denied_insert");
    await assert.rejects(query("insert into storage.objects(bucket_id,name) values('watchflow-artwork',$1)", [path(a, listB)]),
      error => error.code === "42501");
    await query("rollback to savepoint denied_insert");
    const owned = path(a, listA);
    await query("insert into storage.objects(bucket_id,name) values('watchflow-artwork',$1)", [owned]);
    assert.equal((await query("update storage.objects set metadata='{}' where bucket_id='watchflow-artwork' and name=$1 returning id", [owned])).rows.length, 0);
    await asOwner(b);
    assert.equal((await query("select id from storage.objects where bucket_id='watchflow-artwork' and name=$1", [owned])).rows.length, 0);
    assert.equal((await query("delete from storage.objects where bucket_id='watchflow-artwork' and name=$1 returning id", [owned])).rows.length, 0);
    await asOwner(a);
  });
});
