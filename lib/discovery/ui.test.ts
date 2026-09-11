import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

function source(relativePath: string) {
  return readFileSync(resolve(repositoryRoot, relativePath), "utf8");
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }

    return /\.(?:ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts")
      ? [path]
      : [];
  });
}

describe("Part 14 protected route and navigation contracts", () => {
  it("keeps both discovery routes, loading boundaries, navigation, and proxy protection", () => {
    for (const relativePath of [
      "app/(app)/picker/page.tsx",
      "app/(app)/picker/loading.tsx",
      "app/(app)/recommendations/page.tsx",
      "app/(app)/recommendations/loading.tsx",
    ]) {
      expect(
        existsSync(resolve(repositoryRoot, relativePath)),
        relativePath,
      ).toBe(true);
    }

    const navigation = source("components/app-navigation.tsx");
    const proxy = source("lib/supabase/proxy.ts");
    for (const [href, label] of [
      ["/picker", "Movie Picker"],
      ["/recommendations", "Recommendations"],
    ]) {
      expect(navigation).toContain(`href: "${href}"`);
      expect(navigation).toContain(`label: "${label}"`);
      expect(proxy).toContain(`"${href}"`);
    }
  });

  it("authenticates private reads with getUser and keeps discovery out of public caches", () => {
    const adapter = source("lib/discovery/supabase-discovery.ts");
    expect(adapter).toContain("client.auth.getUser()");
    expect(adapter).toContain('.from("user_movies")');
    expect(adapter).toContain('.eq("user_id", authenticatedUserId)');
    expect(adapter).toContain("movies!inner(");
    expect(adapter).toContain("MAX_DISCOVERY_LIBRARY_ROWS = 1000");

    const files = [
      ...sourceFiles(resolve(repositoryRoot, "app/(app)/picker")),
      ...sourceFiles(resolve(repositoryRoot, "app/(app)/recommendations")),
      ...sourceFiles(resolve(repositoryRoot, "components/discovery")),
      ...sourceFiles(resolve(repositoryRoot, "lib/discovery")),
    ];
    const combined = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    for (const forbidden of [
      "createAdminClient",
      "service_role",
      "localStorage",
      "sessionStorage",
      "unstable_cache",
      "generateMetadata",
      "export const metadata",
      "tmdb-provider",
      'formData.get("user_id")',
    ]) {
      expect(combined).not.toContain(forbidden);
    }
  });
});

describe("Part 14 picker UX contracts", () => {
  it("provides every labelled filter and communicates exact semantics", () => {
    const picker = source("components/discovery/movie-picker.tsx");
    for (const label of [
      "Genre",
      "Maximum runtime",
      "Minimum public rating",
      "Mood",
      "Release period",
      "Watched state",
      "Pick only from Watch Next",
      "Favourite only",
    ]) {
      expect(picker).toContain(label);
    }

    expect(picker).toContain("public rating");
    expect(picker).toContain("watchNextOnly");
    expect(picker).toContain("overrides the");
    expect(picker).toContain("queue order");
    expect(picker).toContain("window.history.replaceState");
    expect(picker).toContain("replacePickerUrl(updated)");
    expect(picker).toContain('name="excludedUserMovieIds"');
    expect(picker).toContain(".slice(-50)");
    expect(picker).toContain("showActionOutput");
    expect(picker).toContain("isPending ? 1 : 0");
    expect(picker).toContain("Pick Another");
    expect(picker).toContain("No movies in your library match these filters.");
  });

  it("shows explicit moods, explanations, and the Family-oriented caution", () => {
    const moods = source("lib/discovery/moods.ts");
    const picker = source("components/discovery/movie-picker.tsx");
    for (const label of [
      "Exciting",
      "Relaxing",
      "Funny",
      "Emotional",
      "Dark",
      "Intense",
      "Mind-Bending",
      "Family-oriented",
    ]) {
      expect(moods).toContain(`label: "${label}"`);
    }
    expect(moods).toContain("certification data");
    expect(picker).toContain("not psychological");
    expect(picker).toContain("not");
    expect(picker).toContain("AI");
  });

  it("renders only a selected result with textual state and existing mutation shortcuts", () => {
    const result = source("components/discovery/picker-result.tsx");
    const watchNext = source(
      "components/discovery/watch-next-action.tsx",
    );
    expect(result).toContain("Why it matched");
    expect(result).toContain("MovieStatusBadge");
    expect(result).toContain("Public rating:");
    expect(result).toContain("Not a favourite");
    expect(result).toContain("Open Details");
    expect(result).toContain("#custom-lists-heading");
    expect(result).toContain("FavouriteToggleForm");
    expect(watchNext).toContain("bulkUpdateStatusAction");
    expect(watchNext).toContain('name="libraryIds"');
    expect(watchNext).toContain('value="watch_next"');
    expect(watchNext).not.toContain('name="movieId"');
    expect(watchNext).not.toContain('name="user_id"');
  });
});

describe("Part 14 recommendation UX contracts", () => {
  it("labels recommendations as rule-based and exposes the scoring rules", () => {
    const page = source("app/(app)/recommendations/page.tsx");
    expect(page).toContain("Rule-based recommendations");
    expect(page).toContain("How recommendations work");
    expect(page).toContain("not AI");
    expect(page).toContain(
      "Watched, legacy Dropped, and Currently Watching",
    );
    expect(page).toContain("Refresh suggestions");
    expect(page).toContain("similar-score window");
  });

  it("shows concrete reasons, textual status/favourite state, and safe actions", () => {
    const card = source(
      "components/discovery/recommendation-card.tsx",
    );
    expect(card).toContain("You may like this because");
    expect(card).toContain("reason.text");
    expect(card).toContain("MovieStatusBadge");
    expect(card).toContain("Public rating:");
    expect(card).toContain("Not a favourite");
    expect(card).toContain("Open Details");
    expect(card).toContain("#custom-lists-heading");
    expect(card).toContain("FavouriteToggleForm");
  });

  it("uses responsive grids and accessible live/focus behavior", () => {
    const picker = source("components/discovery/movie-picker.tsx");
    const result = source("components/discovery/picker-result.tsx");
    const section = source(
      "components/discovery/recommendation-section.tsx",
    );
    expect(picker).toContain('aria-live="polite"');
    expect(picker).toContain("resultHeadingRef.current?.focus()");
    expect(picker).toContain("min-h-11");
    expect(result).toContain("min-w-0");
    expect(result).toContain("break-words");
    expect(section).toContain("md:grid-cols-2");
    expect(section).toContain("xl:grid-cols-3");
  });
});
