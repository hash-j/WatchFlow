import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/202607290001_part_13_private_custom_lists.sql";
const migration = readFileSync(resolve(process.cwd(), migrationPath), "utf8");
const sql = migration.toLowerCase().replaceAll("\r\n", "\n");
const compactSql = sql.replace(/\s+/g, " ");

const rpcSignatures = [
  ["watchflow_normalize_list_positions", "uuid"],
  ["watchflow_move_list_item", "uuid, text"],
  ["watchflow_add_movies_to_list", "uuid, uuid[]"],
  ["watchflow_remove_movie_from_list", "uuid"],
  ["watchflow_set_movie_list_memberships", "uuid, uuid[]"],
  ["watchflow_list_summaries", ""],
] as const;

function functionSql(name: string) {
  const marker = `create or replace function public.${name}(`;
  const start = sql.indexOf(marker);

  if (start < 0) {
    return "";
  }

  const nextFunction = sql.indexOf(
    "create or replace function public.",
    start + marker.length,
  );

  return sql.slice(start, nextFunction < 0 ? sql.length : nextFunction);
}

function policySql(name: string) {
  const marker = `create policy ${name}`;
  const start = sql.indexOf(marker);

  if (start < 0) {
    return "";
  }

  const end = sql.indexOf(";", start);
  return sql.slice(start, end < 0 ? sql.length : end + 1);
}

function expectPrivateInvoker(section: string) {
  expect(section).toContain("security invoker");
  expect(section).toMatch(/set\s+search_path\s*=\s*(?:''|public,\s*pg_temp)/);
  expect(section).toContain("auth.uid()");
  expect(section).not.toContain("security definer");

  const declaration = section.slice(0, section.indexOf("returns"));
  expect(declaration).not.toContain("p_user_id");
}

describe("Part 13 private custom-list schema contract", () => {
  it("creates private lists owned by Auth users with bounded normalized names", () => {
    expect(compactSql).toMatch(
      /create table(?: if not exists)? public\.lists\s*\(/,
    );
    expect(compactSql).toContain(
      "id uuid primary key default gen_random_uuid()",
    );
    expect(compactSql).toContain(
      "user_id uuid not null references auth.users(id) on delete cascade",
    );
    expect(compactSql).toContain("name text not null");
    expect(compactSql).toContain("description text");
    expect(compactSql).toContain(
      "visibility text not null default 'private'",
    );
    expect(compactSql).toContain(
      "created_at timestamptz not null default now()",
    );
    expect(compactSql).toContain(
      "updated_at timestamptz not null default now()",
    );

    expect(compactSql).toMatch(
      /check\s*\(\s*(?:char_length|length)\s*\(\s*(?:btrim|trim)\s*\(\s*name\s*\)\s*\)\s*(?:between\s+1\s+and\s+80|>\s*0)/,
    );
    expect(compactSql).toMatch(
      /check\s*\(\s*(?:char_length|length)\s*\(\s*(?:btrim|trim)\s*\(\s*name\s*\)\s*\)\s*(?:<=\s*80|between\s+1\s+and\s+80)\s*\)/,
    );
    expect(compactSql).toMatch(
      /check\s*\(\s*description\s+is\s+null\s+or\s+(?:char_length|length)\s*\(\s*description\s*\)\s*<=\s*500\s*\)/,
    );
    expect(compactSql).toMatch(
      /check\s*\(\s*visibility\s*=\s*'private'\s*\)/,
    );
  });

  it("creates ordered memberships through user_movies, never movies", () => {
    expect(compactSql).toMatch(
      /create table(?: if not exists)? public\.list_movies\s*\(/,
    );
    expect(compactSql).toContain(
      "list_id uuid not null references public.lists(id) on delete cascade",
    );
    expect(compactSql).toContain(
      "user_movie_id uuid not null references public.user_movies(id) on delete cascade",
    );
    expect(compactSql).toContain("position integer not null");
    expect(compactSql).toMatch(/check\s*\(\s*position\s*>=\s*1\s*\)/);
    expect(compactSql).toMatch(
      /(?:constraint\s+list_movies_list_user_movie_key\s+)?unique\s*\(\s*list_id\s*,\s*user_movie_id\s*\)/,
    );
    expect(compactSql).toMatch(
      /(?:constraint\s+list_movies_list_position_key\s+)?unique\s*\(\s*list_id\s*,\s*position\s*\)/,
    );
    expect(compactSql).not.toContain("references public.movies");
  });

  it("adds only justified ownership, recency, membership, and ordering indexes", () => {
    expect(compactSql).toMatch(
      /create unique index(?: if not exists)? lists_user_normalized_name_key on public\.lists\s*\(\s*user_id\s*,\s*lower\s*\(\s*regexp_replace\s*\(\s*btrim\s*\(\s*name\s*\)/,
    );
    expect(compactSql).toMatch(
      /create index(?: if not exists)? lists_user_updated_at_idx on public\.lists\s*\(\s*user_id\s*,\s*updated_at desc\s*\)/,
    );
    expect(compactSql).toMatch(
      /create index(?: if not exists)? list_movies_user_movie_id_idx on public\.list_movies\s*\(\s*user_movie_id\s*\)/,
    );
    expect(compactSql).not.toContain(
      "create index list_movies_list_user_movie_idx",
    );
    expect(compactSql).not.toContain("create index list_movies_list_position_idx");
  });

  it("reuses the established updated_at function for both tables", () => {
    expect(sql).not.toContain(
      "create or replace function public.watchflow_set_updated_at",
    );
    expect(compactSql).toMatch(
      /create trigger watchflow_lists_updated_at before update on public\.lists for each row execute function public\.watchflow_set_updated_at\(\)/,
    );
    expect(compactSql).toMatch(
      /create trigger watchflow_list_movies_updated_at before update on public\.list_movies for each row execute function public\.watchflow_set_updated_at\(\)/,
    );
  });
});

describe("Part 13 private custom-list RLS and privilege contract", () => {
  it("enables RLS and never creates broad or anonymous access", () => {
    expect(compactSql).toContain(
      "alter table public.lists enable row level security",
    );
    expect(compactSql).toContain(
      "alter table public.list_movies enable row level security",
    );
    expect(compactSql).not.toContain("disable row level security");
    expect(compactSql).not.toContain("using (true)");
    expect(compactSql).not.toMatch(/\bgrant\b[^;]+\bto anon\b/);
  });

  it("owner-scopes every lists operation with USING and WITH CHECK", () => {
    const select = policySql("watchflow_lists_select_own");
    const insert = policySql("watchflow_lists_insert_own");
    const update = policySql("watchflow_lists_update_own");
    const remove = policySql("watchflow_lists_delete_own");

    expect(select).toContain("for select");
    expect(select).toContain("using ((select auth.uid()) = user_id)");
    expect(insert).toContain("for insert");
    expect(insert).toContain("with check ((select auth.uid()) = user_id)");
    expect(update).toContain("for update");
    expect(update).toContain("using ((select auth.uid()) = user_id)");
    expect(update).toContain("with check ((select auth.uid()) = user_id)");
    expect(remove).toContain("for delete");
    expect(remove).toContain("using ((select auth.uid()) = user_id)");
  });

  it("requires ownership of both the parent list and user_movie", () => {
    for (const [name, command] of [
      ["watchflow_list_movies_select_own", "select"],
      ["watchflow_list_movies_insert_own", "insert"],
      ["watchflow_list_movies_update_own", "update"],
      ["watchflow_list_movies_delete_own", "delete"],
    ] as const) {
      const policy = policySql(name);

      expect(policy, name).toContain(`for ${command}`);
      expect(policy, name).toContain("exists");
      expect(policy, name).toContain("from public.lists");
      expect(policy, name).toContain("from public.user_movies");
      expect(policy, name).toContain("auth.uid()");

      if (command === "insert") {
        expect(policy, name).toContain("with check");
      } else {
        expect(policy, name).toContain("using");
      }

      if (command === "update") {
        expect(policy, name).toContain("with check");
      }
    }
  });

  it("grants only the required RLS-protected table and column privileges", () => {
    expect(compactSql).toMatch(
      /grant select,\s*delete on table public\.lists to authenticated/,
    );
    expect(compactSql).toMatch(
      /grant insert\s*\(\s*user_id,\s*name,\s*description\s*\) on table public\.lists to authenticated/,
    );
    expect(compactSql).toMatch(
      /grant update\s*\(\s*name,\s*description,\s*updated_at\s*\) on table public\.lists to authenticated/,
    );
    expect(compactSql).toMatch(
      /grant select,\s*delete on table public\.list_movies to authenticated/,
    );
    expect(compactSql).toMatch(
      /grant insert\s*\(\s*list_id,\s*user_movie_id,\s*position\s*\) on table public\.list_movies to authenticated/,
    );
    expect(compactSql).toMatch(
      /grant update\s*\(\s*position\s*\) on table public\.list_movies to authenticated/,
    );
    expect(compactSql).not.toMatch(
      /grant[^;]+on table public\.(?:lists|list_movies)[^;]+to (?:public|anon)/,
    );
  });
});

describe("Part 13 RPC security contract", () => {
  it("defines all six functions as authenticated security invokers", () => {
    for (const [name, signature] of rpcSignatures) {
      const section = functionSql(name);
      expect(section, name).not.toBe("");
      expectPrivateInvoker(section);

      const qualifiedSignature = `public.${name}(${signature})`;
      expect(compactSql).toContain(
        `revoke all on function ${qualifiedSignature} from public, anon`,
      );
      expect(compactSql).toContain(
        `grant execute on function ${qualifiedSignature} to authenticated`,
      );
    }
  });

  it("never uses elevated execution or deletes library/shared movie records", () => {
    expect(compactSql).not.toContain("security definer");
    expect(compactSql).not.toContain("service_role");
    expect(compactSql).not.toContain("delete from public.user_movies");
    expect(compactSql).not.toContain("delete from public.movies");
  });
});

describe("Part 13 atomic ordering and membership RPC contract", () => {
  it("normalizes owned lists under a per-list lock with conflict-safe sequential writes", () => {
    const normalize = functionSql("watchflow_normalize_list_positions");

    expect(normalize).toContain("p_list_id uuid");
    expect(normalize).toContain("pg_advisory_xact_lock");
    expect(normalize).toContain("for update");
    expect(normalize).toMatch(/row_number\(\)\s+over/);
    expect(normalize).toMatch(/position(?:\s+asc)?\s+nulls last/);
    expect(
      normalize.match(/update public\.list_movies/g)?.length,
    ).toBeGreaterThanOrEqual(2);
    expect(normalize).toContain(
      "set constraints list_movies_list_position_key deferred",
    );
    expect(normalize).toMatch(
      /position\s*=\s*(?:[a-z_]+\.)?normalized_position\s*\+\s*v_item_count/,
    );
    expect(normalize).toContain("public.lists");
    expect(normalize).toContain("user_id = v_user_id");
  });

  it("moves only an owned item and makes boundary moves successful no-ops", () => {
    const move = functionSql("watchflow_move_list_item");

    expect(move).toContain("p_list_movie_id uuid");
    expect(move).toContain("p_direction text");
    expect(move).toContain("'up'");
    expect(move).toContain("'down'");
    expect(move).toContain("pg_advisory_xact_lock");
    expect(move).toContain("for update");
    expect(move).toContain("watchflow_normalize_list_positions");
    expect(move).toContain("'moved', false");
    expect(move).toContain("'final_position'");
    expect(move).toContain("public.lists");
    expect(move).toContain("user_id = v_user_id");
  });

  it("batch-appends owned user_movies in supplied order and skips duplicates honestly", () => {
    const add = functionSql("watchflow_add_movies_to_list");

    expect(add).toContain("p_list_id uuid");
    expect(add).toContain("p_user_movie_ids uuid[]");
    expect(add).toContain(
      "pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0))",
    );
    expect(add).toMatch(
      /order by\s+user_movies\.queue_position asc nulls last,\s*user_movies\.created_at asc,\s*user_movies\.id asc/,
    );
    expect(add).toContain("with ordinality");
    expect(add).toContain("order by");
    expect(add).toContain("ordinality");
    expect(add).toMatch(/(?:cardinality|array_length)\s*\(\s*p_user_movie_ids/);
    expect(add).toContain("> 100");
    expect(add).toContain("array_position(p_user_movie_ids, null)");
    expect(add).toContain("count(distinct");
    expect(add).toContain("public.user_movies");
    expect(add).toContain("um.user_id = v_user_id");
    expect(add).toContain("on conflict");
    expect(add).toContain("do nothing");
    expect(add).toContain("'added_count'");
    expect(add).toContain("'skipped_count'");
    expect(add).toContain("watchflow_normalize_list_positions");
  });

  it("removes only the membership and compacts the owned list", () => {
    const remove = functionSql("watchflow_remove_movie_from_list");

    expect(remove).toContain("p_list_movie_id uuid");
    expect(remove).toContain("pg_advisory_xact_lock");
    expect(remove).toContain("delete from public.list_movies");
    expect(compactSql).toContain(
      "create trigger watchflow_list_movies_compact_after_delete",
    );
    expect(compactSql).toContain(
      "watchflow_compact_lists_after_membership_delete",
    );
    expect(remove).toContain("'removed'");
    expect(remove).toContain("public.lists");
    expect(remove).toContain("user_id = v_user_id");
    expect(remove).not.toContain("delete from public.user_movies");
    expect(remove).not.toContain("delete from public.movies");
  });

  it("atomically reconciles one owned user_movie across multiple owned lists", () => {
    const memberships = functionSql(
      "watchflow_set_movie_list_memberships",
    );

    expect(memberships).toContain("p_user_movie_id uuid");
    expect(memberships).toContain("p_list_ids uuid[]");
    expect(memberships).toMatch(
      /(?:cardinality|array_length)\s*\(\s*p_list_ids/,
    );
    expect(memberships).toContain("> 500");
    expect(memberships).toContain("array_position(p_list_ids, null)");
    expect(memberships).toContain("count(distinct");
    expect(memberships).toContain("public.user_movies");
    expect(memberships).toContain("public.lists");
    expect(memberships).toContain(
      "pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0))",
    );
    expect(memberships).toContain("order by");
    expect(memberships).toContain("delete from public.list_movies");
    expect(memberships).toContain("on conflict");
    expect(memberships).toContain("do nothing");
    expect(memberships).toContain("watchflow_normalize_list_positions");
    expect(memberships).toContain("'added_count'");
    expect(memberships).toContain("'removed_count'");
  });

  it("returns all private list summaries in one owner-scoped aggregate", () => {
    const summaries = functionSql("watchflow_list_summaries");

    expect(summaries).toContain("public.lists");
    expect(summaries).toContain("public.list_movies");
    expect(summaries).toContain("public.user_movies");
    expect(summaries).toContain("public.movies");
    expect(summaries).toContain("lists.user_id = (select auth.uid())");
    expect(summaries).toMatch(/count\s*\(/);
    expect(summaries).toMatch(/jsonb?_agg\s*\(/);
    expect(summaries).toContain("poster_path");
    expect(summaries).toContain("position");
  });
});
