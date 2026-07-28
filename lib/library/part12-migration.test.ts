import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/202607280001_part_12_library_improvements.sql";
const migration = readFileSync(resolve(process.cwd(), migrationPath), "utf8");
const sql = migration.toLowerCase();
const bulkStatusSql = sql.slice(
  sql.indexOf("function public.watchflow_bulk_update_library_status"),
  sql.indexOf("function public.watchflow_bulk_remove_library_movies"),
);
const bulkDeleteSql = sql.slice(
  sql.indexOf("function public.watchflow_bulk_remove_library_movies"),
  sql.indexOf("revoke all on function public.watchflow_library_rows"),
);

describe("Part 12 favourite and query migration contract", () => {
  it("adds favourite only to private user_movies with false, not-null semantics", () => {
    expect(sql).toContain("alter table public.user_movies");
    expect(sql).toContain(
      "add column if not exists favourite boolean not null default false",
    );
    expect(sql).toContain("alter column favourite set not null");
    expect(sql).not.toMatch(
      /alter\s+table\s+public\.movies[\s\S]{0,120}favourite/,
    );
  });

  it("adds only the five justified owner/filter/sort indexes", () => {
    for (const index of [
      "user_movies_library_created_at_idx",
      "user_movies_library_status_created_at_idx",
      "user_movies_library_favourite_created_at_idx",
      "user_movies_library_personal_rating_idx",
      "user_movies_library_watched_at_idx",
    ]) {
      expect(sql).toContain(`create index if not exists ${index}`);
    }
    expect(sql).not.toContain("create extension");
    expect(sql).not.toContain("movies_title_idx");
  });

  it("defines a security-invoker private query with no user ID parameter", () => {
    expect(sql).toContain("function public.watchflow_library_rows(");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("um.user_id = (select auth.uid())");
    expect(sql).not.toContain("p_user_id");
    expect(sql).not.toContain("execute format");
  });

  it("searches title, original title, director, genre, and cast literally", () => {
    expect(sql).toContain("strpos(lower(coalesce(m.title, '')), filters.query)");
    expect(sql).toContain(
      "strpos(lower(coalesce(m.original_title, '')), filters.query)",
    );
    expect(sql).toContain(
      "strpos(lower(coalesce(m.director, '')), filters.query)",
    );
    expect(sql).toContain("jsonb_typeof(m.genres) = 'array'");
    expect(sql).toContain("jsonb_typeof(m.main_cast) = 'array'");
    expect(sql).toContain("cast_member.value ->> 'name'");
  });

  it("applies every filter before PostgREST count/order/range", () => {
    for (const fragment of [
      "um.status = filters.status",
      "um.status is distinct from 'watched'",
      "um.favourite = filters.favourite",
      "= filters.director",
      "= filters.genre",
      "m.release_year = filters.exact_year",
      "um.personal_rating >= filters.rating_min",
      "um.personal_rating <= filters.rating_max",
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  it("returns owner-only normalized filter options and summary counts", () => {
    expect(sql).toContain("function public.watchflow_library_filter_options()");
    expect(sql).toContain("'genres'");
    expect(sql).toContain("'directors'");
    expect(sql).toContain("'years'");
    expect(sql).toContain("'favourites'");
    expect(sql).toContain("group by lower(label)");
  });

  it("keeps new functions authenticated-only under normal RLS privileges", () => {
    expect(sql.match(/security invoker/g)?.length).toBeGreaterThanOrEqual(4);
    expect(sql).toContain("from public, anon");
    expect(sql).toContain("to authenticated");
    expect(sql).not.toContain("security definer");
    expect(sql).not.toContain("disable row level security");
  });
});

describe("Part 12 bulk mutation migration contract", () => {
  it("validates authentication, UUID arrays, duplicate IDs, and the 100-row limit", () => {
    expect(bulkStatusSql).toContain("v_user_id uuid := auth.uid()");
    expect(bulkStatusSql).toContain("v_requested > 100");
    expect(bulkStatusSql).toContain("array_position(p_user_movie_ids, null)");
    expect(bulkStatusSql).toContain("count(distinct selected_id)");
    expect(bulkStatusSql).toContain("id = any (p_user_movie_ids)");
  });

  it("excludes scheduled from the allowed bulk target statuses", () => {
    const validationBlock = bulkStatusSql.slice(
      bulkStatusSql.indexOf("if p_status is null"),
      bulkStatusSql.indexOf("perform pg_advisory_xact_lock"),
    );
    expect(validationBlock).not.toContain("'scheduled'");
  });

  it("does not invent watched dates or erase latent schedule data", () => {
    expect(bulkStatusSql).not.toContain("set watched_at");
    expect(bulkStatusSql).not.toContain("scheduled_for =");
    expect(bulkStatusSql).not.toContain("schedule_timezone =");
    expect(bulkStatusSql).not.toContain("schedule_note =");
  });

  it("serializes queue changes and appends new Watch Next rows in submitted order", () => {
    expect(bulkStatusSql).toContain("pg_advisory_xact_lock");
    expect(bulkStatusSql).toContain("with ordinality");
    expect(bulkStatusSql).toContain("order by requested.display_order");
    expect(bulkStatusSql).toContain("v_queue_position := v_queue_position + 1");
    expect(bulkStatusSql.match(/watchflow_normalize_queue/g)?.length).toBe(2);
  });

  it("rejects stale or foreign selections without mutating owned rows", () => {
    const mismatchIndex = bulkStatusSql.indexOf(
      "if v_matched <> v_requested then",
    );
    const firstMutationIndex = bulkStatusSql.indexOf(
      "update public.user_movies",
      mismatchIndex,
    );
    expect(mismatchIndex).toBeGreaterThan(-1);
    expect(firstMutationIndex).toBeGreaterThan(mismatchIndex);
    expect(bulkStatusSql).toContain("'reason', 'selection_changed'");
    expect(bulkStatusSql).toContain("'updated', 0");
  });

  it("bulk deletion removes only owned user_movies and compacts the queue", () => {
    expect(bulkDeleteSql).toContain("delete from public.user_movies");
    expect(bulkDeleteSql).toContain("where user_id = v_user_id");
    expect(bulkDeleteSql).toContain("id = any (p_user_movie_ids)");
    expect(bulkDeleteSql).toContain("watchflow_normalize_queue");
    expect(bulkDeleteSql).not.toContain("delete from public.movies");
  });
});

