import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createCalendarDeleteVersion,
  createCalendarProviderEventId,
  createCalendarSourceKey,
  createCalendarUpsertVersion,
} from "@/lib/calendar/identifiers";

const connectionId = "018f521d-ff71-7b7c-b58a-0f4c46e16000";
const userMovieId = "018f521d-ff71-7b7c-b58a-0f4c46e16001";

describe("calendar synchronization identifiers", () => {
  it("creates stable opaque source keys for one connection and movie", () => {
    expect(createCalendarSourceKey(connectionId, userMovieId)).toBe(
      "af80244341b91d55ecf8c9a6bdead6d7",
    );
    expect(createCalendarSourceKey(connectionId, userMovieId)).toHaveLength(32);
  });

  it("versions the complete provider-visible upsert source", () => {
    const input = {
      sourceKey: createCalendarSourceKey(connectionId, userMovieId),
      scheduledFor: "2026-10-01T17:30:00.000Z",
      scheduleTimezone: "Asia/Karachi",
      movieTitle: "Arrival",
      runtimeMinutes: 116,
    };

    expect(createCalendarUpsertVersion(input)).toBe(
      "de84154c8880cfdc3605af8bcc2ca3e7",
    );
    expect(
      createCalendarUpsertVersion({
        ...input,
        scheduledFor: "2026-10-01T18:30:00.000Z",
      }),
    ).not.toBe(createCalendarUpsertVersion(input));
    expect(
      createCalendarUpsertVersion({ ...input, movieTitle: "Arrival, Again" }),
    ).not.toBe(createCalendarUpsertVersion(input));
  });

  it("creates a distinct stable tombstone version", () => {
    const sourceKey = createCalendarSourceKey(connectionId, userMovieId);
    expect(createCalendarDeleteVersion(sourceKey)).toBe(
      "92e7bb74b4235c7c7ee68643c593e0a7",
    );
    expect(createCalendarDeleteVersion(sourceKey)).not.toBe(
      createCalendarUpsertVersion({
        sourceKey,
        scheduledFor: "2026-10-01T17:30:00.000Z",
        scheduleTimezone: "Asia/Karachi",
        movieTitle: "Arrival",
        runtimeMinutes: 116,
      }),
    );
  });

  it("creates a stable Google-compatible provider event identifier", () => {
    const sourceKey = createCalendarSourceKey(connectionId, userMovieId);
    expect(createCalendarProviderEventId(connectionId, sourceKey)).toBe(
      "a354e02abcf0fdf6b18571932067dced4",
    );
    expect(createCalendarProviderEventId(connectionId, sourceKey)).toMatch(
      /^[0-9a-v]{5,1024}$/,
    );
  });

  it("rejects an invalid scheduled instant", () => {
    expect(() =>
      createCalendarUpsertVersion({
        sourceKey: createCalendarSourceKey(connectionId, userMovieId),
        scheduledFor: "not-an-instant",
        scheduleTimezone: "Asia/Karachi",
        movieTitle: "Arrival",
        runtimeMinutes: 116,
      }),
    ).toThrow("valid instant");
  });
});
