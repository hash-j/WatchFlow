import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Part 18A Batch 3A request-scoped authentication", () => {
  it("uses React request memoization without a process-wide client or identity cache", () => {
    const request = source("lib/supabase/request.ts");
    const auth = source("lib/supabase/auth.ts");

    expect(request).toContain('import { cache } from "react"');
    expect(request).toContain("cache(createClient)");
    expect(request).not.toMatch(/new Map|unstable_cache|revalidateTag|let\s+client/);
    expect(auth).toContain("cache(async () =>");
    expect(auth).toContain("await getRequestSupabaseClient()");
    expect(auth).toContain("supabase.auth.getClaims()");
    expect(auth).toContain('.eq("id", claims.sub)');
    expect(auth).not.toContain("auth.getUser()");
  });

  it("reuses the verified request owner and client across representative reads", () => {
    const library = source("lib/library/supabase-query.ts");
    const overview = source("lib/library/supabase-overview.ts");
    const queue = source("lib/library/supabase-library.ts");
    const settings = source("lib/settings/supabase-settings.ts");
    const lists = source("lib/lists/supabase-lists.ts");
    const discovery = source("lib/discovery/supabase-discovery.ts");
    const statistics = source("lib/statistics/supabase-statistics.ts");
    const search = source("lib/movies/server-search.ts");

    expect(library).toContain("await getAuthContext()");
    expect(library).not.toContain("auth.getUser()");
    expect(overview.match(/getRequestSupabaseClient\(\)/g)).toHaveLength(2);
    expect(queue).toContain("authenticateRequest");
    expect(queue).toContain("createSupabaseLibraryRequestDependencies");
    expect(settings).toContain(
      "const { client, profile: profileRow, user } = await getAuthContext()",
    );
    expect(settings).toContain("profile: mapProfileSettings(profileRow)");
    expect(lists).toContain("authenticateListsRequest");
    expect(discovery).toContain("await getAuthContext()");
    expect(statistics).toContain("await getAuthContext()");
    expect(statistics).toContain("normalizeTimeZone(profile?.timezone)");
    expect(search).toContain("await getAuthContext()");
  });

  it("keeps owner filters on profile, preferences, and private route data", () => {
    const auth = source("lib/supabase/auth.ts");
    const settings = source("lib/settings/supabase-settings.ts");
    const library = source("lib/library/supabase-query.ts");
    const overview = source("lib/library/supabase-overview.ts");

    expect(auth).toContain('.eq("id", claims.sub)');
    expect(settings).toContain('.eq("user_id", userId)');
    expect(library).toContain("readUserPreferences(client, user.id)");
    expect(overview).toContain('.eq("user_id", userId)');
  });

  it("keeps mutations and sensitive actions on fresh getUser authorization", () => {
    for (const path of [
      "lib/library/supabase-mutations.ts",
      "lib/library/supabase-management.ts",
      "lib/settings/supabase-settings.ts",
      "lib/lists/supabase-lists.ts",
      "app/(app)/actions/import.ts",
      "app/auth/actions.ts",
    ]) {
      const contents = source(path);
      expect(contents, path).toContain("auth.getUser()");
      expect(contents, path).not.toContain("getRequestSupabaseClient");
    }

    expect(source("lib/settings/supabase-settings.ts")).toContain(
      "export async function authenticateSettings",
    );
    expect(source("lib/lists/supabase-lists.ts")).toContain(
      "export async function authenticateLists",
    );
  });

  it("leaves onboarding's fresh identity and owner-scoped profile behavior intact", () => {
    const onboarding = source("lib/onboarding/supabase-onboarding.ts");

    expect(onboarding).toContain("client.auth.getUser()");
    expect(onboarding).toContain('.from("profiles")');
    expect(onboarding).toContain('.eq("id", userId)');
    expect(onboarding).not.toContain("getRequestSupabaseClient");
  });
});
