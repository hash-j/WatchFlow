import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("Part 16F-B Batch 3 onboarding polish contracts", () => {
  it("removes visible progress fractions and time copy while preserving semantics", () => {
    const shell = source("components/onboarding/onboarding-shell.tsx");
    const progress = source("components/onboarding/progress.tsx");

    expect(shell).not.toContain("About 12 minutes");
    expect(progress).not.toContain("{number} of 3");
    expect(progress).toContain('aria-label="Onboarding progress"');
    expect(progress).toContain('aria-current={current ? "step"');
    expect(progress).toContain("Step {step} of 3");
  });

  it("removes helper and summary copy without removing the stored controls", () => {
    const page = source("app/onboarding/page.tsx");
    const personalize = source("components/onboarding/personalize-form.tsx");

    expect(page).not.toContain("Suggested: 3");
    expect(page).not.toContain("progressMessage");
    expect(personalize).not.toContain("canonical format");
    expect(personalize).toContain('name="preferredLanguage"');
    expect(page).toContain("OnboardingMovieSearchForm");
    expect(page).toContain("OnboardingMovieAddForm");
  });

  it("uses a stable, disabled, accessible spinner loading state", () => {
    const search = source("components/onboarding/movie-search-form.tsx");

    expect(search).toContain("LoaderCircle");
    expect(search).toContain('className="animate-spin"');
    expect(search).toContain('aria-busy={isPending}');
    expect(search).toContain('disabled={isPending}');
    expect(search).toContain('className="w-full sm:w-32"');
    expect(search).toContain('{isPending ? "Searching" : "Search"}');
    expect(search).not.toContain("Searching...");
  });
});

describe("Part 16F-B Batch 3 import and queue polish contracts", () => {
  it("keeps import result labels on one line inside a scrollable data region", () => {
    const wizard = source("components/import/import-wizard.tsx");

    expect(wizard).toContain('DataScrollRegion label="Import result rows"');
    expect(wizard).toContain("whitespace-nowrap text-xs");
    expect(wizard).toContain("min-w-24 whitespace-nowrap px-4 py-3 capitalize");
    expect(wizard).toContain("row.status.replaceAll");
  });

  it("uses a poster-left mobile queue while retaining ordering controls", () => {
    const page = source("app/(app)/watch-next/page.tsx");
    const controls = source("components/movies/queue-controls.tsx");

    expect(page).toContain("grid-cols-[5rem_minmax(0,1fr)]");
    expect(page).toContain("col-start-1 row-span-2 row-start-1");
    expect(page).toContain("getWatchNextPriorityLabel(priority)");
    expect(page).toContain("QueuePriorityControl");
    expect(controls).toContain('value="up"');
    expect(controls).toContain('value="down"');
    expect(controls).toContain("Move earlier");
    expect(controls).toContain("Move later");
  });
});

describe("Part 16F-B Batch 3 schedule, list, and picker polish contracts", () => {
  it("keeps Schedule on the shared Select and preserves scheduling fields", () => {
    const schedule = source("components/movies/schedule-movie-form.tsx");

    expect(schedule).toContain('from "@/components/ui/select"');
    expect(schedule).toContain("<Select");
    expect(schedule).toContain('name="libraryId"');
    expect(schedule).toContain('name="scheduledDate"');
    expect(schedule).toContain('name="scheduledTime"');
    expect(schedule).toContain('name="timezone"');
    expect(schedule).toContain("scheduleMovieAction");
  });

  it("balances list-dialog filters without changing filter inputs", () => {
    const dialog = source("components/lists/add-movies-dialog.tsx");

    expect(dialog).toContain("sm:grid-cols-2");
    expect(dialog).toContain("lg:grid-cols-[minmax(14rem,1.6fr)");
    expect(dialog).toContain('name="listQuery"');
    expect(dialog).toContain('name="listStatus"');
    expect(dialog).toContain('name="listFavourite"');
    expect(dialog).toContain("Add Selected Movies");
  });

  it("uses compact poster-left list rows and equivalent bordered actions", () => {
    const row = source("components/lists/list-movie-row.tsx");
    const order = source("components/lists/list-order-controls.tsx");
    const remove = source("components/lists/remove-list-movie-dialog.tsx");

    expect(row).toContain("grid-cols-[4.5rem_minmax(0,1fr)]");
    expect(row).toContain("col-start-1 row-start-1");
    expect(row).toContain("Position {displayPosition}");
    expect(order).toContain("grid grid-cols-2");
    expect(order).toContain("Move earlier");
    expect(order).toContain("Move later");
    expect(remove).toContain('variant="outline"');
    expect(remove).toContain("border-destructive/50");
    expect(remove).toContain("showModal()");
  });

  it("aligns picker fields and normalizes responsive result actions", () => {
    const picker = source("components/discovery/movie-picker.tsx");
    const result = source("components/discovery/picker-result.tsx");

    expect(picker).toContain("grid items-end gap-5");
    expect(picker).toContain('from "@/components/ui/select"');
    expect(result).toContain("items-stretch");
    expect(result).toContain("[&>form>button]:w-full");
    expect(result).toContain("Open Details");
    expect(result).toContain("WatchNextAction");
    expect(result).toContain("FavouriteToggleForm");
    expect(result).toContain("Add to Custom List");
  });
});
