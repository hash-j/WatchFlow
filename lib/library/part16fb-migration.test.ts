import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/202609100001_part_16fb_library_actor_status.sql";
const sql = readFileSync(resolve(process.cwd(), migrationPath), "utf8").toLowerCase();
const actorQuery = sql.slice(
  sql.indexOf("function public.watchflow_library_rows_v2"),
  sql.indexOf("function public.watchflow_update_library_movie_v2"),
);
const managementUpdate = sql.slice(
  sql.indexOf("function public.watchflow_update_library_movie_v2"),
  sql.indexOf("revoke all on function public.watchflow_library_rows_v2"),
);

describe("Part 16F-B Library actor query migration", () => {
  it("creates a versioned actor-aware relation without overloading Part 12", () => {
    expect(actorQuery).toContain("p_actor text default null");
    expect(actorQuery).toContain("security invoker");
    expect(actorQuery).toContain("stable");
    expect(actorQuery).not.toContain("p_user_id");
    expect(sql).not.toContain("create or replace function public.watchflow_library_rows(");
  });

  it("normalizes actor input and both supported main_cast shapes", () => {
    expect(actorQuery).toContain("regexp_replace(btrim(p_actor)");
    expect(actorQuery).toContain("jsonb_typeof(m.main_cast) = 'array'");
    expect(actorQuery).toContain("when 'string' then actor.value #>> '{}'");
    expect(actorQuery).toContain("when 'object' then actor.value ->> 'name'");
    expect(actorQuery).toContain("= filters.actor");
  });

  it("applies owner and actor predicates inside the relation used for count and pagination", () => {
    const ownerPredicate = actorQuery.indexOf(
      "um.user_id = (select auth.uid())",
    );
    const actorPredicate = actorQuery.indexOf("filters.actor is null");

    expect(ownerPredicate).toBeGreaterThan(-1);
    expect(actorPredicate).toBeGreaterThan(ownerPredicate);
    expect(actorQuery).toContain("filters.status is null");
    expect(actorQuery).toContain("filters.watched is null");
    expect(actorQuery).toContain("filters.genre is null");
    expect(actorQuery).toContain("filters.director is null");
    expect(actorQuery).toContain("filters.exact_year is null");
  });

  it("keeps the new relation authenticated-only with RLS still active", () => {
    expect(sql).toContain(
      "revoke all on function public.watchflow_library_rows_v2",
    );
    expect(sql).toContain("from public, anon");
    expect(sql).toContain("to authenticated");
    expect(actorQuery).not.toContain("security definer");
    expect(sql).not.toContain("disable row level security");
  });
});

describe("Part 16F-B watched-date preservation migration", () => {
  it("creates a versioned owner-scoped atomic update", () => {
    expect(managementUpdate).toContain("p_watched_at_provided boolean");
    expect(managementUpdate).toContain("security invoker");
    expect(managementUpdate).toContain("v_user_id uuid := (select auth.uid())");
    expect(managementUpdate).toContain("where id = p_library_id");
    expect(managementUpdate).toContain("and user_id = v_user_id");
    expect(managementUpdate).not.toContain("p_user_id");
  });

  it("changes watched_at only for an explicitly provided Watched date", () => {
    expect(managementUpdate).toContain("watched_at = case");
    expect(managementUpdate).toContain(
      "when p_status = 'watched' and p_watched_at_provided",
    );
    expect(managementUpdate).toContain("then p_watched_at");
    expect(managementUpdate).toContain("else watched_at");
  });

  it("preserves the full stored status domain and existing queue behavior", () => {
    for (const status of [
      "want_to_watch",
      "watch_next",
      "scheduled",
      "currently_watching",
      "watched",
      "on_hold",
      "dropped",
    ]) {
      expect(managementUpdate).toContain(`'${status}'`);
    }
    expect(managementUpdate).toContain("perform public.watchflow_normalize_queue()");
  });
});
