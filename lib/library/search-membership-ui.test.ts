import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Search already-in-Library UI contracts", () => {
  it("derives visible ownership once from the Search result TMDB ID set", () => {
    const page = source("app/(app)/search/page.tsx");

    expect(page).toContain("getCurrentUserSearchOwnedTmdbIds");
    expect(page).toContain("movies.map((movie) => movie.tmdbId)");
    expect(page).toContain("alreadyInLibrary={searchResult.ownedTmdbIds.has(movie.tmdbId)}");
    expect(page).not.toContain("for (const movie of movies)");
  });

  it("renders a disabled, non-submitting owned state and preserves normal add behavior", () => {
    const form = source("components/movies/add-to-library-form.tsx");

    expect(form).toContain("if (alreadyInLibrary)");
    expect(form).toContain('type="button"');
    expect(form).toContain("disabled");
    expect(form).toContain("Already in your Library");
    expect(form).toContain("This movie is already in your private Library.");
    expect(form).toContain("<form action={action}");
    expect(form).toContain('name="tmdbId"');
  });
});
