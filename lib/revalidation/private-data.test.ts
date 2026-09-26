import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.hoisted(() => vi.fn());
const after = vi.hoisted(() =>
  vi.fn((callback: () => void) => callback()),
);

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/server", () => ({ after }));

import {
  revalidateApplicationPreferenceViews,
  revalidateLibraryDerivedViews,
  revalidateListOrderViews,
  revalidateListViews,
  revalidateNotificationViews,
  revalidateOnboardingPreferenceViews,
  revalidateQueueViews,
} from "./private-data";

beforeEach(() => {
  revalidatePath.mockReset();
  after.mockClear();
});

describe("private-data revalidation architecture", () => {
  it("invalidates each Library-derived route exactly once", () => {
    revalidateLibraryDerivedViews();

    expect(revalidatePath.mock.calls).toEqual([
      ["/dashboard"],
      ["/library"],
      ["/library/[movieId]", "page"],
      ["/statistics"],
      ["/watch-next"],
      ["/schedule"],
      ["/lists"],
      ["/lists/[listId]", "page"],
      ["/picker"],
      ["/recommendations"],
    ]);
  });

  it("can preserve the active movie-detail action state", () => {
    revalidateLibraryDerivedViews({ movieDetails: false });

    expect(revalidatePath.mock.calls).not.toContainEqual([
      "/library/[movieId]",
      "page",
    ]);
    expect(revalidatePath).toHaveBeenCalledTimes(9);
  });

  it("limits queue reorder invalidation to the two order-dependent views", () => {
    revalidateQueueViews();

    expect(revalidatePath.mock.calls).toEqual([
      ["/dashboard"],
      ["/watch-next"],
    ]);
  });

  it("uses one Lists layout invalidation plus only required library coverage", () => {
    revalidateListViews();
    expect(revalidatePath.mock.calls).toEqual([
      ["/lists"],
      ["/lists/[listId]", "page"],
    ]);

    revalidatePath.mockReset();
    revalidateListViews({ allMovieDetails: true });
    expect(revalidatePath.mock.calls).toEqual([
      ["/lists"],
      ["/lists/[listId]", "page"],
      ["/library/[movieId]", "page"],
    ]);
  });

  it("refreshes list-card order in the active list index response", () => {
    revalidateListOrderViews();

    expect(revalidatePath.mock.calls).toEqual([["/lists"]]);
  });

  it("refreshes the feed immediately and defers broad shell invalidation", () => {
    revalidateNotificationViews();

    expect(revalidatePath.mock.calls).toEqual([
      ["/notifications"],
      ["/", "layout"],
    ]);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("keeps profile/preference freshness scoped to their consumers", () => {
    revalidateOnboardingPreferenceViews();
    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/onboarding",
      "/dashboard",
      "/search",
      "/library",
      "/schedule",
      "/statistics",
    ]);

    revalidatePath.mockReset();
    revalidateApplicationPreferenceViews();
    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/dashboard",
      "/search",
      "/library",
      "/schedule",
      "/statistics",
      "/settings/preferences",
    ]);
  });

  it("does not introduce shared caching for authenticated private data", () => {
    const source = readFileSync(
      new URL("./private-data.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain('import "server-only"');
    expect(source).not.toMatch(/use cache|unstable_cache|cacheTag|revalidateTag/);
  });

  it("maps mutations to the narrow helper and removes redundant client refreshes", () => {
    const root = new URL("../../", import.meta.url);
    const management = readFileSync(
      new URL("app/(app)/actions/management.ts", root),
      "utf8",
    );
    expect(management).toContain("revalidateQueueViews()");
    expect(
      management.match(
        /revalidateLibraryDerivedViews\(\{ movieDetails: false \}\)/g,
      ),
    ).toHaveLength(2);

    for (const path of [
      "components/movies/remove-from-library-form.tsx",
      "components/lists/add-movies-dialog.tsx",
      "components/lists/edit-list-dialog.tsx",
      "components/lists/remove-list-movie-dialog.tsx",
      "components/lists/movie-list-memberships-form.tsx",
    ]) {
      expect(readFileSync(new URL(path, root), "utf8")).not.toContain(
        "router.refresh()",
      );
    }
  });

  it("uses a native Search GET after the live client transition stalled", () => {
    const source = readFileSync(
      new URL("../../components/movies/search-form.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('action="/search"');
    expect(source).toContain('method="get"');
    expect(source).not.toContain("router.push(");
    expect(source).toContain("Enter a movie title to search.");
  });
});
