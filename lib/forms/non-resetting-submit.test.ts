import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { getMovieManagementFieldVisibility } from "../library/management-fields";
import { validateMovieManagementInput } from "../library/management";
import type { LibraryMovieStatus } from "../movies/types";
import { normalizeSourceNewlines } from "../testing/source-text";
import { createNonResettingSubmitHandler } from "./non-resetting-submit";

const root = resolve(__dirname, "../..");
const source = (path: string) =>
  normalizeSourceNewlines(readFileSync(resolve(root, path), "utf8"));

function fakeSubmitEvent(submitter: HTMLElement | null = null) {
  const reset = vi.fn();
  const form = { reset } as unknown as HTMLFormElement;
  return {
    reset,
    event: {
      preventDefault: vi.fn(),
      currentTarget: form,
      nativeEvent: { submitter },
    },
  };
}

describe("non-resetting form submission", () => {
  it("prevents the native submit, never resets the form, and dispatches in a transition", () => {
    const payload = new FormData();
    payload.set("status", "watch_next");
    const reader = vi.fn(() => payload);
    const dispatch = vi.fn();
    const scheduled: Array<() => void> = [];
    const handler = createNonResettingSubmitHandler(dispatch, reader, (callback) =>
      scheduled.push(callback),
    );
    const { event, reset } = fakeSubmitEvent();

    handler(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(dispatch).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    scheduled[0]();
    expect(dispatch).toHaveBeenCalledWith(payload);
    expect(reset).not.toHaveBeenCalled();
  });

  it("reads the form with its submitter so named submit buttons keep their value", () => {
    const submitter = { name: "intent" } as unknown as HTMLElement;
    const reader = vi.fn(() => new FormData());
    const handler = createNonResettingSubmitHandler(vi.fn(), reader, (cb) => cb());
    const { event } = fakeSubmitEvent(submitter);

    handler(event);

    expect(reader).toHaveBeenCalledWith(event.currentTarget, submitter);
  });

  it("dispatches identical data for repeated saves of an unchanged form", () => {
    const snapshot = new FormData();
    snapshot.set("status", "watched");
    snapshot.set("personalRating", "8.5");
    const dispatch = vi.fn();
    const handler = createNonResettingSubmitHandler(dispatch, () => snapshot, (cb) => cb());

    handler(fakeSubmitEvent().event);
    handler(fakeSubmitEvent().event);

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect([...dispatch.mock.calls[0][0].entries()]).toEqual([
      ...dispatch.mock.calls[1][0].entries(),
    ]);
  });
});

type MovieFormState = {
  status: LibraryMovieStatus;
  priority: string;
  personalRating: string;
  review: string;
  watchedDate: string;
  wouldWatchAgain: boolean;
  scheduledDate: string;
  scheduledTime: string;
  timezone: string;
  scheduleNote: string;
};

/** Mirrors the fields MovieManagementForm renders (and therefore submits) for a status. */
function submittedMovieForm(state: MovieFormState) {
  const fields = getMovieManagementFieldVisibility(state.status);
  const data = new FormData();
  data.set("status", state.status);
  data.set("review", state.review);
  if (fields.priority) data.set("priority", state.priority);
  if (fields.personalRating) data.set("personalRating", state.personalRating);
  if (fields.watchedDate) data.set("watchedDate", state.watchedDate);
  if (fields.wouldWatchAgain && state.wouldWatchAgain) data.set("wouldWatchAgain", "true");
  if (fields.schedule) {
    data.set("scheduledDate", state.scheduledDate);
    data.set("scheduledTime", state.scheduledTime);
    data.set("timezone", state.timezone);
    data.set("scheduleNote", state.scheduleNote);
  }
  return {
    status: data.get("status"),
    personalRating: data.get("personalRating"),
    review: data.get("review"),
    priority: data.get("priority"),
    wouldWatchAgain: data.get("wouldWatchAgain"),
    watchedDate: data.get("watchedDate"),
    watchedDateProvided: data.has("watchedDate"),
    scheduledDate: data.get("scheduledDate"),
    scheduledTime: data.get("scheduledTime"),
    timezone: data.get("timezone"),
    scheduleNote: data.get("scheduleNote"),
  };
}

const watched: MovieFormState = {
  status: "watched",
  priority: "0",
  personalRating: "8.5",
  review: "Great",
  watchedDate: "2026-11-09",
  wouldWatchAgain: true,
  scheduledDate: "",
  scheduledTime: "",
  timezone: "Asia/Karachi",
  scheduleNote: "",
};

describe("movie management save idempotency", () => {
  it("Saved -> Watched: a second unchanged save keeps status, rating, date, review and rewatch", () => {
    const first = validateMovieManagementInput(submittedMovieForm(watched));
    const second = validateMovieManagementInput(submittedMovieForm(watched));

    expect(second).toEqual(first);
    expect(second).toMatchObject({
      status: "watched",
      personalRating: 8.5,
      review: "Great",
      watchedAt: "2026-11-09T00:00:00.000Z",
      wouldWatchAgain: true,
      preservePersonalRating: false,
    });
  });

  it("Watched -> Watch Next keeps priority and preserves the hidden rating and rewatch", () => {
    const state = { ...watched, status: "watch_next" as const, priority: "3" };
    const first = validateMovieManagementInput(submittedMovieForm(state));
    const second = validateMovieManagementInput(submittedMovieForm(state));

    expect(second).toEqual(first);
    expect(second).toMatchObject({
      status: "watch_next",
      priority: 3,
      review: "Great",
      preservePersonalRating: true,
      preserveWouldWatchAgain: true,
      watchedAtProvided: false,
    });
  });

  it("Scheduled keeps the chosen timezone and instant across repeated saves", () => {
    const now = new Date("2026-11-11T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const state = {
        ...watched,
        status: "scheduled" as const,
        scheduledDate: "2026-11-12",
        scheduledTime: "20:30",
        scheduleNote: "QA",
      };
      const first = validateMovieManagementInput(submittedMovieForm(state));
      const second = validateMovieManagementInput(submittedMovieForm(state));

      expect(second).toEqual(first);
      expect(second).toMatchObject({
        status: "scheduled",
        timezone: "Asia/Karachi",
        scheduledFor: "2026-11-12T15:30:00.000Z",
        scheduleNote: "QA",
        preservePersonalRating: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("documents the regression: a reset status paired with hidden fields would wipe saved data", () => {
    // The pre-fix failure: the DOM status reverted to "watched" while the
    // Watch Next layout (no rating/rewatch inputs) stayed rendered.
    const staleMismatch = submittedMovieForm({ ...watched, status: "watch_next" });
    const corrupted = validateMovieManagementInput({ ...staleMismatch, status: "watched" });

    expect(corrupted).toMatchObject({
      status: "watched",
      personalRating: null,
      wouldWatchAgain: false,
    });
  });
});

describe("form reset regression contracts", () => {
  const affected = [
    "components/movies/movie-management-form.tsx",
    "components/settings/preferences-form.tsx",
    "components/settings/notification-settings-form.tsx",
    "components/settings/profile-settings-form.tsx",
    "components/lists/movie-list-memberships-form.tsx",
  ];

  it.each(affected)("%s submits without React's automatic form reset", (path) => {
    const form = source(path);

    expect(form).toContain("createNonResettingSubmitHandler(action)");
    expect(form).toMatch(/<form\s+onSubmit=\{createNonResettingSubmitHandler\(action\)\}/);
    expect(form).not.toMatch(/<form\s+action=\{action\}/);
    expect(form).toContain("useActionState");
  });

  it("keeps pending-state feedback on the movie form submit button", () => {
    const form = source("components/movies/movie-management-form.tsx");

    expect(form).toContain("disabled={isPending}");
    expect(form).toContain('{isPending ? "Saving..." : "Save changes"}');
    expect(form).toContain("key={formVersion}");
  });
});
