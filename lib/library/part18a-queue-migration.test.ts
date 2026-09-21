import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202609210001_part_18a_queue_normalization.sql",
  ),
  "utf8",
).toLowerCase();

function functionSql(name: string) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf("\n$$;", start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end + 4);
}

describe("Part 18A set-based queue migration", () => {
  it("normalizes only auth.uid ownership with stable contiguous ordering", () => {
    const normalize = functionSql("watchflow_normalize_queue");

    expect(normalize).toContain("security invoker");
    expect(normalize).toContain("set search_path = ''");
    expect(normalize).toContain("v_user_id uuid := (select auth.uid())");
    expect(normalize).toMatch(
      /order by queue_position asc nulls last, created_at asc, id asc/,
    );
    expect(normalize).toContain("pg_catalog.unnest(v_queue_ids) with ordinality");
    expect(normalize).toContain("user_movie.user_id = v_user_id");
    expect(normalize).toContain("user_movie.status = 'watch_next'");
    expect(normalize.match(/update public\.user_movies/g)).toHaveLength(2);
    expect(normalize).not.toContain("foreach");
    expect(normalize).not.toMatch(/\bloop\b/);
  });

  it("reorders with set-based updates and no nested normalization call", () => {
    const move = functionSql("move_watch_queue_item");

    expect(move).toContain("pg_catalog.array_position");
    expect(move).toContain("pg_catalog.unnest(v_queue_ids) with ordinality");
    expect(move.match(/update public\.user_movies/g)).toHaveLength(2);
    expect(move).not.toContain("foreach");
    expect(move).not.toContain("perform public.watchflow_normalize_queue");
    expect(move).toContain("user_movie.user_id = v_user_id");
  });

  it("removes the bulk Watch Next double normalization", () => {
    const bulk = functionSql("watchflow_bulk_update_library_status");

    expect(bulk).toContain("v_queue_ids := v_queue_ids || v_new_queue_ids");
    expect(bulk).toContain("requested.display_order");
    expect(bulk).toContain("pg_catalog.unnest(v_queue_ids) with ordinality");
    expect(
      bulk.match(/perform public\.watchflow_normalize_queue\(\)/g),
    ).toHaveLength(1);
    expect(bulk).not.toContain("for v_selected");
    expect(bulk).not.toContain("foreach");
  });

  it("keeps queue RPC execution authenticated-only", () => {
    for (const signature of [
      "public.watchflow_normalize_queue()",
      "public.move_watch_queue_item(uuid, text)",
      "public.watchflow_bulk_update_library_status(uuid[], text)",
    ]) {
      expect(migration).toContain(`revoke all on function ${signature}`);
      expect(migration).toContain(`grant execute on function ${signature}`);
    }
    expect(migration.match(/to authenticated;/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).not.toContain("security definer");
  });
});
