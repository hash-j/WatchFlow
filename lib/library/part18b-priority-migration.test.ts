import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202609240001_part_18b_priority_and_list_ordering.sql",
  ),
  "utf8",
).toLowerCase();

function functionSql(name: string) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf("\n$$;", start);
  expect(end, name).toBeGreaterThan(start);
  return migration.slice(start, end + 4);
}

function expectAuthenticatedInvoker(section: string) {
  expect(section).toContain("security invoker");
  expect(section).toContain("auth.uid()");
  expect(section).not.toContain("security definer");
  expect(section).not.toContain("p_user_id");
}

describe("Part 18B Watch Next priority migration", () => {
  it("reuses the bounded existing priority field without adding another column", () => {
    expect(migration).not.toMatch(
      /alter table public\.user_movies\s+add column[^;]*(?:priority|rank)/,
    );
    expect(migration).not.toContain("create table public.watch_next");
  });

  it("normalizes and moves queues by priority before stable manual ordering", () => {
    for (const name of [
      "watchflow_normalize_queue",
      "move_watch_queue_item",
    ]) {
      const section = functionSql(name);
      expectAuthenticatedInvoker(section);
      expect(section).toContain(
        "order by priority desc, queue_position asc nulls last, created_at asc, id asc",
      );
      expect(section).toContain("pg_catalog.pg_advisory_xact_lock");
      expect(section).toContain("user_id = v_user_id");
      expect(section).toContain("status = 'watch_next'");
    }
  });

  it("sets a priority only for an owned Watch Next relationship and compacts atomically", () => {
    const setPriority = functionSql("watchflow_set_watch_next_priority");

    expectAuthenticatedInvoker(setPriority);
    expect(setPriority).toContain("p_user_movie_id uuid");
    expect(setPriority).toContain("p_priority smallint");
    expect(setPriority).toContain("p_priority < 0 or p_priority > 5");
    expect(setPriority).toContain("id = p_user_movie_id");
    expect(setPriority).toContain("user_id = v_user_id");
    expect(setPriority).toContain("status = 'watch_next'");
    expect(setPriority).toContain("set priority = p_priority");
    expect(setPriority).toContain("perform public.watchflow_normalize_queue()");
  });

  it("keeps status transitions inside the authenticated priority-aware queue transaction", () => {
    const bulk = functionSql("watchflow_bulk_update_library_status");

    expectAuthenticatedInvoker(bulk);
    expect(bulk).toContain(
      "order by priority desc, queue_position asc nulls last, created_at asc, id asc",
    );
    expect(bulk).toContain("set status = p_status");
    expect(bulk).toContain("perform public.watchflow_normalize_queue()");
    expect(bulk).not.toContain("security definer");
  });

  it("exposes every queue mutation only to authenticated callers", () => {
    for (const signature of [
      "public.watchflow_normalize_queue()",
      "public.move_watch_queue_item(uuid, text)",
      "public.watchflow_bulk_update_library_status(uuid[], text)",
      "public.watchflow_set_watch_next_priority(uuid, smallint)",
    ]) {
      expect(migration).toContain(`revoke all on function ${signature}`);
      expect(migration).toContain(`grant execute on function ${signature}`);
    }

    expect(migration).not.toContain("service_role");
  });
});
