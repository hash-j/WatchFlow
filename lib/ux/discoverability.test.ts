import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Part 15.5C navigation and terminology", () => {
  it("uses one ordered, grouped navigation model on desktop and mobile", () => {
    const navigation = source("components/app-navigation.tsx");
    const mobile = source("components/mobile-app-navigation.tsx");
    const groups = ["Home", "Your movies", "Discover", "Insights", "Account"];

    let previous = -1;
    for (const group of groups) {
      const index = navigation.indexOf(`label: "${group}"`);
      expect(index, group).toBeGreaterThan(previous);
      previous = index;
    }

    expect(navigation).toContain('role="group"');
    expect(navigation).toContain("aria-labelledby={groupId}");
    expect(navigation).toContain('aria-current={current ? "page" : undefined}');
    expect(mobile).toContain("<AppNavigation");
    expect(mobile).toContain('aria-label="Open main navigation"');
    expect(mobile).toContain('aria-label="Main navigation"');
  });

  it("uses canonical labels once and avoids conflicting navigation terms", () => {
    const navigation = source("components/app-navigation.tsx");
    const canonical = [
      ["/dashboard", "Dashboard"],
      ["/library", "Library"],
      ["/watch-next", "Watch Next"],
      ["/schedule", "Schedule"],
      ["/lists", "Lists"],
      ["/search", "Search"],
      ["/picker", "Movie Picker"],
      ["/recommendations", "Recommendations"],
      ["/statistics", "Statistics"],
      ["/import", "Import Movies"],
      ["/settings", "Settings"],
    ] as const;

    for (const [href, label] of canonical) {
      expect(navigation).toContain(`href: "${href}", label: "${label}"`);
    }
    expect(navigation).not.toContain('label: "My Library"');
    expect(navigation).not.toContain('label: "My Lists"');
    expect(navigation).not.toContain('label: "Search Movies"');
  });
});

describe("Part 15.5C page purpose and first-use help", () => {
  const pageContracts = [
    ["app/(app)/dashboard/page.tsx", 'title="Dashboard"', "Next actions"],
    ["app/(app)/search/page.tsx", 'title="Search"', "private Library"],
    ["app/(app)/library/page.tsx", 'title="Library"', "Everything you have saved"],
    ["app/(app)/watch-next/page.tsx", 'title="Watch Next"', "ordered queue"],
    ["app/(app)/schedule/page.tsx", 'title="Schedule"', "local date and time"],
    ["app/(app)/lists/page.tsx", 'title="Lists"', "custom collections"],
    ["app/(app)/picker/page.tsx", 'title="Movie Picker"', "your own Library"],
    ["app/(app)/recommendations/page.tsx", 'title="Recommendations"', "personal ratings"],
    ["app/(app)/statistics/page.tsx", 'title="Statistics"', "See patterns"],
    ["app/(app)/import/page.tsx", 'title="Import Movies"', "CSV file"],
  ] as const;

  for (const [path, title, purpose] of pageContracts) {
    it(`${path} states its title and purpose`, () => {
      const page = source(path);
      expect(page).toContain(title);
      expect(page).toContain(purpose);
    });
  }

  it("explains overlapping movie concepts instead of making users infer them", () => {
    const library = source("components/library/library-controls.tsx");
    const watchNext = source("app/(app)/watch-next/page.tsx");
    const lists = source("app/(app)/lists/page.tsx");
    const picker = source("app/(app)/picker/page.tsx");

    for (const status of ["Want to Watch", "Watch Next", "Scheduled", "Watched"]) {
      expect(library).toContain(status);
    }
    expect(watchNext).toContain("separate from your broader Want to Watch");
    expect(lists).toContain("unlike the ordered Watch Next queue");
    expect(picker).toContain("pick from your own Library");
  });

  it("keeps advanced controls progressively disclosed while primary actions stay visible", () => {
    const library = source("components/library/library-controls.tsx");
    const picker = source("components/discovery/movie-picker.tsx");
    const importWizard = source("components/import/import-wizard.tsx");

    expect(library).toContain("<details");
    expect(library).toContain("Filters");
    expect(library).toContain("Active library filters");
    expect(picker).toContain("Refine the choice (optional)");
    expect(picker).toContain("Pick a Movie");
    expect(importWizard).toContain("What happens during import?");
    expect(importWizard).toContain("private Library");
  });
});

describe("Part 15.5C empty states, hierarchy, and accessibility", () => {
  it("gives key empty states a relevant destination", () => {
    const library = source("app/(app)/library/page.tsx");
    const watchNext = source("app/(app)/watch-next/page.tsx");
    const lists = source("app/(app)/lists/page.tsx");
    const listDetail = source("app/(app)/lists/[listId]/page.tsx");
    const recommendations = source("app/(app)/recommendations/page.tsx");
    const statistics = source("components/statistics/statistics-dashboard.tsx");

    expect(library).toContain('href="/search"');
    expect(watchNext).toContain('href="/library"');
    expect(lists).toContain("Create your first list");
    expect(listDetail).toContain("<AddMoviesDialog");
    expect(recommendations).toContain('href="/library"');
    expect(statistics).toContain('href="/search"');
  });

  it("keeps destructive actions distinct from ordinary actions", () => {
    const movie = source("app/(app)/library/[movieId]/page.tsx");
    const listDelete = source("components/lists/delete-list-dialog.tsx");
    const account = source("components/settings/data-controls.tsx");
    const dataPage = source("app/(app)/settings/data/page.tsx");

    expect(movie).toContain('aria-labelledby="remove-from-library-heading"');
    expect(movie).toContain("border-destructive/40");
    expect(listDelete).toContain('variant="destructive"');
    expect(account.match(/variant="destructive"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(dataPage).toContain("Danger zone");
  });

  it("labels or explains non-obvious icon controls and contextual back links", () => {
    const queue = source("components/movies/queue-controls.tsx");
    const listOrder = source("components/lists/list-order-controls.tsx");
    const favourite = source("components/movies/favourite-toggle-form.tsx");
    const movie = source("app/(app)/library/[movieId]/page.tsx");
    const list = source("app/(app)/lists/[listId]/page.tsx");

    expect(queue).toContain("Move earlier");
    expect(queue).toContain("Move later");
    expect(queue).toContain("title=");
    expect(listOrder).toContain("Move earlier");
    expect(listOrder).toContain("Move later");
    expect(favourite).toContain("aria-label={label}");
    expect(movie).toContain("Back to Library");
    expect(list).toContain("Back to Lists");
  });

  it("does not expose known implementation terminology in product copy", () => {
    const userFacing = [
      "app/(app)/dashboard/page.tsx",
      "app/(app)/search/page.tsx",
      "app/(app)/schedule/page.tsx",
      "app/(app)/statistics/page.tsx",
      "app/(app)/settings/profile/page.tsx",
      "components/movies/schedule-movie-form.tsx",
    ].map(source).join("\n");

    for (const phrase of [
      "securely from the server",
      "server-calculated",
      "timezone-aware database timestamp",
      "this repository",
      "storage policies",
      "Server Action",
      "user_movies",
      "RLS",
    ]) {
      expect(userFacing).not.toContain(phrase);
    }
  });
});

describe("Part 15.5C Settings information architecture", () => {
  it("uses clear categories and separates exports from the Danger Zone", () => {
    const nav = source("components/settings/settings-nav.tsx");
    const overview = source("app/(app)/settings/page.tsx");
    const dataPage = source("app/(app)/settings/data/page.tsx");

    for (const label of ["Profile", "Preferences", "Notifications", "Data & Account"]) {
      expect(nav).toContain(`label: "${label}"`);
      expect(overview).toContain(`title: "${label}"`);
    }
    expect(dataPage.indexOf("<ExportControls />")).toBeLessThan(
      dataPage.indexOf("Danger zone"),
    );
  });
});
