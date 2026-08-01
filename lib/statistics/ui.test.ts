import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import StatisticsError from "../../app/(app)/statistics/error";
import StatisticsLoading from "../../app/(app)/statistics/loading";
import { StatisticsDashboard } from "../../components/statistics/statistics-dashboard";
import { calculatePersonalStatistics } from "./calculations";
import type { StatisticsMovieRecord } from "./types";
import { isProtectedRoute } from "../supabase/proxy";

const repositoryRoot = process.cwd();
const NOW = new Date("2026-08-02T12:00:00.000Z");

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

function movie(
  index: number,
  overrides: Partial<StatisticsMovieRecord> = {},
): StatisticsMovieRecord {
  return {
    userMovieId: `${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`,
    movieId: String(100 + index),
    status: "want_to_watch",
    favourite: false,
    personalRating: null,
    watchedDate: null,
    scheduledFor: null,
    title: `Movie ${index}`,
    posterPath: null,
    releaseYear: 2020 + index,
    runtimeMinutes: 100 + index,
    genres: ["Drama"],
    ...overrides,
  };
}

function result(movies: readonly StatisticsMovieRecord[]) {
  return calculatePersonalStatistics(movies, {
    now: NOW,
    timezone: "UTC",
  });
}

describe("Statistics route, navigation, and protection contracts", () => {
  it("keeps the page, loading boundary, and safe route error boundary", () => {
    for (const relativePath of [
      "app/(app)/statistics/page.tsx",
      "app/(app)/statistics/loading.tsx",
      "app/(app)/statistics/error.tsx",
    ]) {
      expect(existsSync(resolve(repositoryRoot, relativePath)), relativePath).toBe(
        true,
      );
    }
  });

  it("adds exactly one Statistics item to authenticated navigation with the existing active-route convention", () => {
    const navigation = source("components/app-navigation.tsx");
    const entries = navigation.match(
      /\{ href: "\/statistics", label: "Statistics", icon: [A-Za-z]+ \}/g,
    );

    expect(entries).toHaveLength(1);
    expect(navigation).toContain("pathname === href");
    expect(navigation).toContain('pathname.startsWith(`${href}/`)');
    expect(navigation).toContain('aria-current={current ? "page" : undefined}');
    expect(navigation).toContain("overflow-x-auto");
    expect(navigation).toContain("focus-visible:ring-2");

    for (const existingLabel of [
      "Dashboard",
      "Search Movies",
      "My Library",
      "My Lists",
      "Movie Picker",
      "Recommendations",
      "Import Movies",
      "Watch Next",
      "Schedule",
      "Settings",
    ]) {
      expect(navigation).toContain(`label: "${existingLabel}"`);
    }
  });

  it("keeps Statistics protected while canonical sign-up remains available and public", () => {
    expect(isProtectedRoute("/statistics")).toBe(true);
    expect(isProtectedRoute("/statistics/private-child")).toBe(true);
    expect(isProtectedRoute("/auth/sign-up")).toBe(false);
    expect(
      existsSync(resolve(repositoryRoot, "app/auth/sign-up/page.tsx")),
    ).toBe(true);
    expect(source("lib/supabase/proxy.ts")).toContain('"/statistics"');
  });

  it("forces request-time rendering, delegates fresh authentication to the query, and redirects an invalid session", () => {
    const page = source("app/(app)/statistics/page.tsx");

    expect(page).toContain('import { connection } from "next/server"');
    expect(page).toContain("await connection()");
    expect(page).toContain("getPersonalStatistics()");
    expect(page).toContain("StatisticsAuthenticationError");
    expect(page).toContain('redirect("/auth/login")');
    expect(page.match(/<h1\b/g)).toHaveLength(1);
    expect(page).not.toContain("generateMetadata");
    expect(page).not.toContain("export const metadata");
  });

  it("keeps private Statistics code out of admin, TMDB, browser persistence, and global caches", () => {
    const files = [
      ...sourceFiles(resolve(repositoryRoot, "app/(app)/statistics")),
      ...sourceFiles(resolve(repositoryRoot, "components/statistics")),
      ...sourceFiles(resolve(repositoryRoot, "lib/statistics")),
    ];
    const combined = files.map((path) => readFileSync(path, "utf8")).join("\n");

    for (const forbidden of [
      "createAdminClient",
      "service_role",
      "localStorage",
      "sessionStorage",
      "unstable_cache",
      "revalidateTag",
      "tmdb-provider",
      'formData.get("user_id")',
      "p_user_id",
    ]) {
      expect(combined).not.toContain(forbidden);
    }

    for (const serverComponent of [
      "app/(app)/statistics/page.tsx",
      "components/statistics/statistics-dashboard.tsx",
      "components/statistics/statistics-summary.tsx",
      "components/statistics/statistics-visualizations.tsx",
      "components/statistics/statistics-movie-list.tsx",
    ]) {
      expect(source(serverComponent), serverComponent).not.toContain(
        '"use client"',
      );
    }
  });
});

describe("Statistics rendered states", () => {
  it("renders the distinct empty-library message and both meaningful actions", () => {
    const html = renderToStaticMarkup(
      createElement(StatisticsDashboard, { result: result([]) }),
    );

    expect(html).toContain("No library statistics yet");
    expect(html).toContain(
      "Add movies to your library to begin building viewing statistics.",
    );
    expect(html).toContain('href="/search"');
    expect(html).toContain("Search Movies");
    expect(html).toContain('href="/import"');
    expect(html).toContain("Import Movies");
    expect(html).not.toContain('data-testid="stat-total-movies"');
  });

  it("renders summary/status/genre data plus no-watched and no-rating states for an unwatched library", () => {
    const html = renderToStaticMarkup(
      createElement(StatisticsDashboard, {
        result: result([
          movie(1, { status: "watch_next", favourite: true }),
          movie(2, { status: "want_to_watch", genres: ["Comedy"] }),
        ]),
      }),
    );

    expect(html).toContain("Library summary");
    expect(html).toContain('data-testid="stat-total-movies">2</dd>');
    expect(html).toContain('data-testid="stat-watched-movies">0</dd>');
    expect(html).toContain('data-testid="stat-unwatched-movies">2</dd>');
    expect(html).toContain('data-testid="stat-watch-next-movies">1</dd>');
    expect(html).toContain('data-testid="stat-favourite-movies">1</dd>');
    expect(html).toContain("Status distribution");
    expect(html).toContain("Most common genres in your library");
    expect(html).toContain("No watched movies yet");
    expect(html).toContain(
      "Mark movies as watched to unlock viewing activity statistics.",
    );
    expect(html).toContain('href="/library"');
    expect(html).toContain('href="/watch-next"');
    expect(html).toContain("No personal ratings yet");
    expect(html).toContain(
      "Rate watched movies to see your rating distribution.",
    );
  });

  it("renders every required metric, textual visualization, and watched movie list when data exists", () => {
    const html = renderToStaticMarkup(
      createElement(StatisticsDashboard, {
        result: result([
          movie(1, {
            title: "Inception",
            releaseYear: 2010,
            status: "watched",
            favourite: true,
            personalRating: 9,
            watchedDate: "2026-08-01",
            runtimeMinutes: 148,
            genres: ["Science Fiction", "Thriller"],
          }),
          movie(2, {
            status: "scheduled",
            scheduledFor: "2026-08-10T18:00:00.000Z",
            personalRating: 7,
          }),
          movie(3, { status: "watch_next" }),
        ]),
      }),
    );

    for (const testId of [
      "stat-total-movies",
      "stat-watched-movies",
      "stat-unwatched-movies",
      "stat-watch-next-movies",
      "stat-favourite-movies",
      "stat-scheduled-movies",
      "stat-average-rating",
      "stat-watched-runtime",
      "stat-watched-this-month",
      "stat-watched-this-year",
    ]) {
      expect(html).toContain(`data-testid="${testId}"`);
    }

    expect(html).toContain("Status distribution:");
    expect(html).toContain("Most common genres in your library:");
    expect(html).toContain("Watched over time");
    expect(html).toContain("Movies watched by month:");
    expect(html).toContain("Personal rating distribution:");
    expect(html).toContain("Top-rated watched movies");
    expect(html).toContain("Recently watched");
    expect(html).toContain("Inception (2010)");
    expect(html).toContain("Your rating: 9/10");
    expect(html).toContain("Watched Aug 1, 2026");
    expect(html).toContain('href="/library/101"');
  });

  it("provides visible values and screen-reader summaries instead of color-only charts", () => {
    const visuals = source("components/statistics/statistics-visualizations.tsx");

    expect(visuals).toContain('className="sr-only"');
    expect(visuals).toContain("entry.label");
    expect(visuals).toContain("entry.count");
    expect(visuals).toContain("formatStatisticsPercentage");
    expect(visuals).toContain('aria-hidden="true"');
    expect(visuals).toContain("Movies watched by month");
    expect(visuals).toContain("Personal rating distribution");
  });

  it("uses responsive, overflow-safe grids and keyboard-visible movie links", () => {
    const summary = source("components/statistics/statistics-summary.tsx");
    const visuals = source("components/statistics/statistics-visualizations.tsx");
    const dashboard = source("components/statistics/statistics-dashboard.tsx");
    const movies = source("components/statistics/statistics-movie-list.tsx");

    expect(summary).toContain("sm:grid-cols-2");
    expect(summary).toContain("xl:grid-cols-5");
    expect(summary).toContain("min-w-0");
    expect(summary).toContain("break-words");
    expect(visuals).toContain("grid-cols-2");
    expect(visuals).toContain("sm:grid-cols-3");
    expect(dashboard).toContain("lg:grid-cols-2");
    expect(movies).toContain("min-w-0");
    expect(movies).toContain("break-words");
    expect(movies).toContain("focus-visible:ring-2");
  });
});

describe("Statistics loading, error, and revalidation contracts", () => {
  it("renders a meaningful, number-free loading announcement and matching landmarks", () => {
    const html = renderToStaticMarkup(createElement(StatisticsLoading));

    expect(html).toContain("Statistics");
    expect(html).toContain("Library summary");
    expect(html).toContain("Loading your private viewing statistics.");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain('data-testid="stat-total-movies"');
  });

  it("renders a friendly safe error with retry and dashboard navigation", () => {
    const html = renderToStaticMarkup(
      createElement(StatisticsError, { reset: vi.fn() }),
    );
    const errorSource = source("app/(app)/statistics/error.tsx");

    expect(html).toContain('role="alert"');
    expect(html).toContain("Statistics are unavailable");
    expect(html).toContain("Try again");
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain("Return to Dashboard");
    expect(errorSource).not.toContain("error.message");
    expect(errorSource).not.toContain("stack");
    expect(errorSource).not.toContain("code=");
  });

  it("revalidates Statistics after every existing mutation that changes its source data", () => {
    for (const relativePath of [
      "app/(app)/actions/library.ts",
      "app/(app)/actions/management.ts",
      "app/(app)/actions/import.ts",
      "app/(app)/settings/actions.ts",
    ]) {
      expect(source(relativePath), relativePath).toContain('"/statistics"');
    }
  });
});
