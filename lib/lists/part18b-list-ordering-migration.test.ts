import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202609240001_part_18b_priority_and_list_ordering.sql",
  ),
  "utf8",
)
  .replaceAll("\r\n", "\n")
  .toLowerCase();

function functionSql(name: string) {
  const start = Math.max(
    migration.indexOf(`create or replace function public.${name}`),
    migration.indexOf(`create function public.${name}`),
  );
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

describe("Part 18B custom-list card ordering migration", () => {
  it("adds a distinct owner-scoped list-card position and preserves existing recency order during backfill", () => {
    expect(migration).toContain(
      "alter table public.lists\n  add column sort_position integer",
    );
    expect(migration).toContain("partition by user_id");
    expect(migration).toContain("order by updated_at desc, id asc");
    expect(migration).toContain("alter column sort_position set not null");
    expect(migration).toContain("lists_sort_position_positive check (sort_position >= 1)");
    expect(migration).toContain("lists_user_sort_position_key");
    expect(migration).toContain("unique (user_id, sort_position) deferrable initially immediate");
    expect(migration).not.toContain("alter table public.list_movies\n  add column sort_position");
  });

  it("automatically appends new cards and compacts after a user-owned deletion", () => {
    const assign = functionSql("watchflow_assign_list_sort_position");
    const compact = functionSql("watchflow_compact_lists_after_delete");

    expectAuthenticatedInvoker(assign);
    expect(assign).toContain("new.user_id <> auth.uid()");
    expect(assign).toContain("coalesce(max(sort_position), 0) + 1");
    expect(assign).toContain("watchflow:list-order:");
    expect(migration).toContain("create trigger watchflow_lists_assign_sort_position");

    expectAuthenticatedInvoker(compact);
    expect(compact).toContain("from deleted_lists");
    expect(compact).toContain("perform public.watchflow_normalize_list_order()");
    expect(migration).toContain("create trigger watchflow_lists_compact_after_delete");
  });

  it("normalizes and moves only the authenticated user list-card order", () => {
    const normalize = functionSql("watchflow_normalize_list_order");
    const move = functionSql("watchflow_move_custom_list");

    for (const section of [normalize, move]) {
      expectAuthenticatedInvoker(section);
      expect(section).toContain("watchflow:list-order:");
      expect(section).toContain("user_id = v_user_id");
    }

    expect(normalize).toContain("set constraints lists_user_sort_position_key deferred");
    expect(normalize).toContain("unnest(v_list_ids) with ordinality");
    expect(move).toContain("p_list_id uuid");
    expect(move).toContain("p_direction text");
    expect(move).toContain("'up'");
    expect(move).toContain("'down'");
    expect(move).toContain("perform public.watchflow_normalize_list_order()");
    expect(move).toContain("'moved', false");
  });

  it("returns summaries in saved card order without changing list-movie ordering", () => {
    const summaries = functionSql("watchflow_list_summaries");

    expect(migration).toContain(
      "drop function if exists public.watchflow_list_summaries()",
    );
    expectAuthenticatedInvoker(summaries);
    expect(summaries).toContain("lists.sort_position");
    expect(summaries).toContain("order by lists.sort_position asc, lists.id");
    expect(summaries).toContain("list_movies.position");
    expect(summaries).not.toContain("update public.list_movies");
  });

  it("keeps ordering helpers private and movement authenticated-only", () => {
    for (const signature of [
      "public.watchflow_assign_list_sort_position()",
      "public.watchflow_compact_lists_after_delete()",
    ]) {
      expect(migration).toContain(`revoke all on function ${signature}`);
      expect(migration).not.toContain(`grant execute on function ${signature}`);
    }

    for (const signature of [
      "public.watchflow_normalize_list_order()",
      "public.watchflow_move_custom_list(uuid, text)",
      "public.watchflow_list_summaries()",
    ]) {
      expect(migration).toContain(`revoke all on function ${signature}`);
      expect(migration).toContain(`grant execute on function ${signature}`);
    }

    expect(migration).toContain("grant update (sort_position) on table public.lists to authenticated");
    expect(migration).not.toContain("disable row level security");
    expect(migration).not.toContain("using (true)");
  });
});
