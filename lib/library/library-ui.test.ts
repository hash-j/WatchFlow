import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MovieStatusBadge } from "../../components/movies/movie-status-badge";
import type { LibraryMovie, LibraryMovieStatus } from "../movies/types";
import {
  filterLibraryMovies,
  getLibraryFilterCounts,
  getLibraryFilterEmptyMessage,
  normalizeLibraryFilter,
} from "./filters";
import { MOVIE_STATUS_VISUALS } from "./status-visuals";

function createMovie(
  libraryId: string,
  status: LibraryMovieStatus,
): LibraryMovie {
  return {
    libraryId,
    status,
    favourite: false,
    addedAt: null,
    updatedAt: null,
    personalRating: null,
    review: null,
    priority: 0,
    queuePosition: null,
    scheduledFor: null,
    scheduleTimezone: null,
    scheduleNote: null,
    watchedAt: null,
    wouldWatchAgain: false,
    movie: {
      id: libraryId,
      tmdbId: 1,
      title: libraryId,
      originalTitle: null,
      overview: null,
      posterPath: null,
      backdropPath: null,
      releaseDate: null,
      voteAverage: null,
      runtimeMinutes: null,
      genres: [],
      director: null,
      cast: [],
      originalLanguage: null,
      productionCountries: [],
      trailer: null,
    },
  };
}

const movies = [
  createMovie("watched", "watched"),
  createMovie("queued", "watch_next"),
  createMovie("scheduled", "scheduled"),
];

describe("library watched and unwatched UI", () => {
  it("renders watched and exact unwatched badges with text, icons, and labels", () => {
    const watched = renderToStaticMarkup(
      createElement(MovieStatusBadge, { status: "watched" }),
    );
    const queued = renderToStaticMarkup(
      createElement(MovieStatusBadge, { status: "watch_next" }),
    );

    expect(watched).toContain("Watched");
    expect(watched).toContain("aria-label=");
    expect(watched).toContain("<svg");
    expect(queued).toContain("Watch Next");
    expect(queued).not.toContain(">Unwatched<");
  });

  it("filters All, Watched, and Unwatched and reports counts", () => {
    expect(filterLibraryMovies(movies, "all")).toHaveLength(3);
    expect(filterLibraryMovies(movies, "watched").map((item) => item.libraryId)).toEqual([
      "watched",
    ]);
    expect(
      filterLibraryMovies(movies, "unwatched").map((item) => item.libraryId),
    ).toEqual(["queued", "scheduled"]);
    expect(getLibraryFilterCounts(movies)).toEqual({
      all: 3,
      watched: 1,
      unwatched: 2,
    });
    expect(normalizeLibraryFilter("watched")).toBe("watched");
    expect(normalizeLibraryFilter("invalid")).toBe("all");
  });

  it("provides filter-specific empty messages", () => {
    expect(getLibraryFilterEmptyMessage("watched")).toBe(
      "No watched movies yet.",
    );
    expect(getLibraryFilterEmptyMessage("unwatched")).toBe(
      "You have no unwatched movies.",
    );
  });

  it("does not represent status through color alone", () => {
    for (const visual of Object.values(MOVIE_STATUS_VISUALS)) {
      expect(visual.label.length).toBeGreaterThan(0);
      expect(visual.description.length).toBeGreaterThan(0);
      expect(visual.icon).toBeTypeOf("object");
      expect(visual.badgeClasses.length).toBeGreaterThan(0);
    }

    expect(MOVIE_STATUS_VISUALS.watched.cardAccentClasses).toContain("emerald");
    expect(MOVIE_STATUS_VISUALS.want_to_watch.label).toBe("Saved");
    for (const legacy of ["on_hold", "dropped"] as const) {
      expect(MOVIE_STATUS_VISUALS[legacy].label).toContain("legacy");
      expect(MOVIE_STATUS_VISUALS[legacy].badgeClasses).toContain("bg-muted");
      expect(MOVIE_STATUS_VISUALS[legacy].cardAccentClasses).toBe(
        "border-border",
      );
    }
  });
});

describe("Part 12 library UI contracts", () => {
  const source = (path: string) =>
    readFileSync(resolve(process.cwd(), path), "utf8");

  it("uses server URL search, filters, sorting, page size, and view controls", () => {
    const controls = source("components/library/library-controls.tsx");
    const page = source("app/(app)/library/page.tsx");

    expect(controls).toContain('role="search"');
    for (const name of [
      "q",
      "status",
      "watched",
      "genre",
      "director",
      "actor",
      "year",
      "sort",
      "perPage",
    ]) {
      expect(controls).toContain(`name="${name}"`);
    }
    for (const removed of [
      "favourite",
      "yearFrom",
      "yearTo",
      "ratingMin",
      "ratingMax",
    ]) {
      expect(controls).not.toContain(`name="${removed}"`);
    }
    expect(page).toContain("getLibraryPageData");
    expect(page).not.toContain("listLibraryMovies");
    expect(page).not.toContain("filterLibraryMovies");
  });

  it("limits new status choices and conditionally preserves the watched date", () => {
    const management = source("components/movies/movie-management-form.tsx");
    const bulk = source(
      "components/library/library-selection-workspace.tsx",
    );
    const settings = source("components/settings/preferences-form.tsx");
    const lists = source("components/lists/add-movies-dialog.tsx");

    expect(management).toContain("MOVIE_MANAGEMENT_SELECTABLE_STATUSES");
    expect(management).toContain("isMovieManagementSelectableStatus(item.status)");
    expect(management).toContain('<option value={item.status} hidden>');
    expect(management).toContain("getMovieManagementFieldVisibility(status)");
    expect(management).toContain('name="watchedDate"');
    expect(management).toContain("getWatchedDateInput(item.watchedAt)");
    expect(management).toContain("key={formVersion}");
    expect(management).toContain("props.item.updatedAt");
    expect(management).toContain("props.item.watchedAt");
    expect(management).toContain("setWatchedDate(event.target.value)");
    expect(bulk).toContain("BULK_LIBRARY_STATUSES");
    expect(settings).toContain("SELECTABLE_DEFAULT_MOVIE_STATUSES");
    expect(settings).toContain(
      '<option value={preferences.defaultMovieStatus} hidden>',
    );
    expect(lists).toContain("SELECTABLE_LIBRARY_MOVIE_STATUSES");
  });

  it("renders accessible favourite state and labels outside the movie detail link", () => {
    const favourite = source(
      "components/movies/favourite-toggle-form.tsx",
    );
    const card = source("components/movies/library-movie-card.tsx");
    const linkEnd = card.indexOf("</Link>");
    const actions = card.indexOf("<LibraryItemActions");

    expect(favourite).toContain("aria-pressed={confirmedFavourite}");
    expect(favourite).toContain("state.favourite ?? favourite");
    expect(favourite).toContain("Add ${title} to favourites");
    expect(favourite).toContain("Remove ${title} from favourites");
    expect(favourite).toContain("fill-current");
    expect(actions).toBeGreaterThan(linkEnd);
  });

  it("submits the personal relationship UUID separately from the shared movie ID", () => {
    const card = source("components/movies/library-movie-card.tsx");
    const listItem = source("components/movies/library-movie-list-item.tsx");
    const actions = source("components/library/library-item-actions.tsx");
    const removeForm = source(
      "components/movies/remove-from-library-form.tsx",
    );

    expect(card).toContain("userMovieId={item.libraryId}");
    expect(listItem).toContain("userMovieId={item.libraryId}");
    expect(actions).toContain("userMovieId={userMovieId}");
    expect(removeForm).toContain(
      'name="userMovieId" value={userMovieId}',
    );
    expect(removeForm).toContain('name="movieId" value={movieId}');
    expect(removeForm).not.toContain('name="libraryId"');
  });

  it("uses the Part 12 user_movies deletion architecture for single removal", () => {
    const legacyAdapter = source("lib/library/supabase-library.ts");
    const mutationAdapter = source("lib/library/supabase-mutations.ts");
    const action = source("app/(app)/actions/library.ts");

    expect(legacyAdapter).not.toContain("watchflow_remove_library_movie");
    expect(action).toContain("removeLibraryMovie");
    expect(mutationAdapter).toContain(
      '"watchflow_bulk_remove_library_movies"',
    );
    expect(mutationAdapter).not.toContain('.from("movies").delete');
  });

  it("queries only the ordered Watch Next subset with a documented cap", () => {
    const adapter = source("lib/library/supabase-library.ts");
    const page = source("app/(app)/watch-next/page.tsx");

    expect(adapter).toContain("MAX_WATCH_NEXT_ROWS = 500");
    expect(adapter).toContain('.eq("status", "watch_next")');
    expect(adapter).toContain('.order("priority", { ascending: false })');
    expect(adapter).toContain(
      '.order("queue_position", { ascending: true, nullsFirst: false })',
    );
    expect(adapter).toContain('.order("created_at", { ascending: true })');
    expect(adapter).toContain('.order("id", { ascending: true })');
    expect(adapter).toContain(".range(0, MAX_WATCH_NEXT_ROWS)");
    expect(page).toContain("getCurrentUserWatchNextMovies");
    expect(page).not.toContain("listLibraryMovies");
    expect(page).toContain("Showing the first 500 queued movies");
  });

  it("provides keyboard-operable current-page selection and confirmations", () => {
    const selection = source(
      "components/library/library-selection-workspace.tsx",
    );

    expect(selection).toContain('type="checkbox"');
    expect(selection).toContain("Select all movies on this page");
    expect(selection).toContain("Select movies");
    expect(selection).toContain("Clear selection");
    expect(selection).toContain("Exit selection");
    expect(selection).toContain("<ResponsiveDialog");
    expect(source("components/ui/responsive-dialog.tsx")).toContain("<dialog");
    expect(selection).toContain("showModal()");
    expect(selection).toContain("aria-labelledby");
    expect(selection).toContain("aria-describedby");
    expect(selection).toContain("triggerRef.current?.focus()");
    expect(selection).toContain(
      "The movie can still appear in Search for other WatchFlow members.",
    );
  });

  it("uses actual disabled pagination buttons at page boundaries", () => {
    const pagination = source(
      "components/library/library-pagination.tsx",
    );
    expect(pagination).toContain("<button");
    expect(pagination).toContain("disabled");
    expect(pagination).toContain(
      'aria-current={page === pagination.page ? "page" : undefined}',
    );
    expect(pagination).toContain('aria-label="Library pagination"');
  });
});

describe("Part 16F-B Batch 2B library polish contracts", () => {
  const source = (path: string) =>
    readFileSync(resolve(process.cwd(), path), "utf8");

  it("removes the duplicated Watched poster overlay and keeps the status badge", () => {
    const card = source("components/movies/library-movie-card.tsx");

    expect(card).not.toContain('aria-label="Watched movie"');
    expect(card).not.toContain("absolute right-2 top-2");
    expect(card).toContain("<MovieStatusBadge status={item.status}");
  });

  it("applies status accents to both grid cards and list rows", () => {
    const card = source("components/movies/library-movie-card.tsx");
    const listItem = source("components/movies/library-movie-list-item.tsx");

    expect(card).toContain("statusVisual.cardAccentClasses");
    expect(listItem).toContain(
      "MOVIE_STATUS_VISUALS[item.status].cardAccentClasses",
    );
    expect(MOVIE_STATUS_VISUALS.watched.cardAccentClasses).toContain(
      "emerald",
    );
    for (const [status, visual] of Object.entries(MOVIE_STATUS_VISUALS)) {
      if (status !== "watched") {
        expect(visual.cardAccentClasses).not.toContain("emerald");
      }
    }
  });

  it("uses a compact two-column mobile grid and a poster-left mobile list row", () => {
    const page = source("app/(app)/library/page.tsx");
    const card = source("components/movies/library-movie-card.tsx");
    const listItem = source("components/movies/library-movie-list-item.tsx");

    expect(page).toContain("min-[360px]:grid-cols-2");
    expect(card).toContain("line-clamp-2");
    expect(card).not.toContain("Priority");
    expect(listItem).toContain(
      "grid-cols-[4.25rem_minmax(0,1fr)]",
    );
    expect(listItem).toContain("col-start-2");
    expect(listItem).toContain('className="hidden sm:inline"');
  });

  it("keeps item actions full-width, aligned, accessible, and visibly bordered", () => {
    const actions = source("components/library/library-item-actions.tsx");
    const remove = source("components/movies/remove-from-library-form.tsx");
    const favourite = source("components/movies/favourite-toggle-form.tsx");

    expect(actions).toContain("[&_button]:min-h-11");
    expect(actions).toContain("[&_button]:w-full");
    expect(remove).toContain('variant="outline"');
    expect(remove).toContain("border-destructive/50");
    expect(remove).toContain("aria-label={`Remove ${movieTitle}");
    expect(favourite).toContain("aria-pressed={confirmedFavourite}");
  });

  it("aligns the responsive selection toolbar and gives clear and exit visible borders", () => {
    const selection = source(
      "components/library/library-selection-workspace.tsx",
    );

    expect(selection).toContain("grid items-end gap-3");
    expect(selection).toContain("sm:grid-cols-2");
    expect(selection).toContain("xl:grid-cols-[minmax(15rem,1fr)_auto_auto]");
    expect(selection).not.toContain('variant="ghost"');
    expect(selection.match(/variant="outline"/g)?.length).toBeGreaterThanOrEqual(
      3,
    );
    expect(selection).toContain("Select all movies on this page");
  });

  it("keeps the detail custom-list action within narrow viewports", () => {
    const memberships = source(
      "components/lists/movie-list-memberships-form.tsx",
    );

    expect(memberships).toContain("flex min-w-0 flex-col");
    expect(memberships).toContain('className: "w-full shrink-0 sm:w-auto"');
    expect(memberships).toContain("Create New List");
  });

  it("shows named removal feedback after the detail redirect", () => {
    const form = source("components/movies/remove-from-library-form.tsx");
    const page = source("app/(app)/library/page.tsx");
    const action = source("app/(app)/actions/library.ts");

    expect(form).toContain('name="movieTitle" value={movieTitle}');
    expect(form).toContain('name="redirectAfterRemoval"');
    expect(action).toContain("/library?removed=");
    expect(page).toContain("getMovieRemovalMessage(removedTitle)");
    expect(page).toContain('role="status"');
    expect(action).toContain('formData.get("movieTitle")');
  });

  it("preserves Batch 2A actor, selectable-status, and watched-date contracts", () => {
    const controls = source("components/library/library-controls.tsx");
    const management = source("components/movies/movie-management-form.tsx");

    expect(controls).toContain('name="actor"');
    expect(management).toContain("MOVIE_MANAGEMENT_SELECTABLE_STATUSES");
    expect(management).toContain("getMovieManagementFieldVisibility(status)");
    expect(management).toContain("getWatchedDateInput(item.watchedAt)");
    expect(management).toContain("setWatchedDate(event.target.value)");
  });
});
