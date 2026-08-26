import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

describe("onboarding route and UI contracts", () => {
  it("creates the route with loading and safe error boundaries", () => {
    for (const path of [
      "app/onboarding/page.tsx",
      "app/onboarding/loading.tsx",
      "app/onboarding/error.tsx",
    ]) {
      expect(existsSync(join(root, path)), path).toBe(true);
    }
  });

  it("centralizes authentication/completion gating and protects the route", () => {
    const page = source("app/onboarding/page.tsx");
    const proxy = source("lib/supabase/proxy.ts");
    expect(page).toContain("authenticateOnboarding()");
    expect(page).toContain("hasVerifiedEmail(session.user)");
    expect(page).toContain('redirect("/auth/login")');
    expect(page).toContain('redirect("/dashboard")');
    expect(proxy).toContain('"/onboarding"');
    expect(page).not.toMatch(/searchParams[^\n]*user_?id/i);
  });

  it("renders all three steps, accessible progress, back controls, finish, and skip", () => {
    const page = source("app/onboarding/page.tsx");
    const progress = source("components/onboarding/progress.tsx");
    expect(page).toContain("Welcome to WatchFlow");
    expect(page).toContain("Make WatchFlow feel like yours");
    expect(page).toContain("Build your first library");
    expect(page).toContain("FinishSetupForm");
    expect(page).toContain("SkipSetupForm");
    expect(progress).toContain('aria-label="Onboarding progress"');
    expect(progress).toContain('aria-current={current ? "step"');
    expect(progress).toContain("Step {step} of 3");
  });

  it("reuses server search, its durable limiter, metadata ingestion, and status RPC", () => {
    const page = source("app/onboarding/page.tsx");
    const actions = source("app/onboarding/actions.ts");
    const search = source("lib/movies/server-search.ts");
    expect(page).toContain("searchTmdbMoviesForCurrentUser(query)");
    expect(search).toContain('enforceTmdbRateLimit(client, "search")');
    expect(actions).toContain("addMovieToLibrary(");
    expect(actions).toContain("bulkUpdateLibraryStatus(");
    expect(actions).not.toContain("TMDB_READ_ACCESS_TOKEN");
    expect(actions).not.toContain("createAdminClient");
  });

  it("uses labelled search, status-specific accessible names, announcements, and touch targets", () => {
    const search = source("components/onboarding/movie-search-form.tsx");
    const add = source("components/onboarding/movie-add-form.tsx");
    const button = source("components/ui/button.tsx");
    expect(search).toContain('role="search"');
    expect(search).toContain('htmlFor="onboarding-movie-query"');
    expect(search).toContain('aria-live="polite"');
    expect(add).toContain("Add ${title} as Want to Watch");
    expect(add).toContain("Add ${title} as Watched");
    expect(add).toContain('role={state.status === "error" ? "alert" : "status"}');
    expect(button).toContain('min-h-11');
  });

  it("does not add unused genre preferences or browser-only persistent state", () => {
    const combined = [
      source("app/onboarding/page.tsx"),
      source("app/onboarding/actions.ts"),
      source("lib/onboarding/types.ts"),
    ].join("\n");
    expect(combined).not.toMatch(/favouriteGenres|preferred_genres|localStorage|sessionStorage/);
  });
});
