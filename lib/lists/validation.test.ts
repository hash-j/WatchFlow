import { describe, expect, it } from "vitest";

import {
  addMoviesToListSchema,
  createListSchema,
  listIdsSchema,
  listMovieUuidSchema,
  listUuidSchema,
  parseListPickerState,
  setMovieListMembershipsSchema,
  updateListSchema,
  userMovieIdsSchema,
  userMovieUuidSchema,
} from "./validation";

const listId = "11111111-1111-4111-8111-111111111111";
const secondListId = "22222222-2222-4222-8222-222222222222";
const userMovieId = "33333333-3333-4333-8333-333333333333";
const secondUserMovieId = "44444444-4444-4444-8444-444444444444";
const listMovieId = "55555555-5555-4555-8555-555555555555";

describe("custom-list field validation", () => {
  it("trims list fields, collapses name whitespace, and maps a blank description to null", () => {
    expect(
      createListSchema.parse({
        name: "  Weekend   Movies  ",
        description: "   ",
      }),
    ).toEqual({
      name: "Weekend Movies",
      description: null,
    });

    expect(
      createListSchema.parse({
        name: "Best Thrillers",
        description: "  Tense favourites for late nights.  ",
      }),
    ).toEqual({
      name: "Best Thrillers",
      description: "Tense favourites for late nights.",
    });
  });

  it("rejects blank and over-80-character names while accepting the boundary", () => {
    const blank = createListSchema.safeParse({ name: " \t ", description: "" });
    const tooLong = createListSchema.safeParse({
      name: "a".repeat(81),
      description: "",
    });

    expect(blank.success).toBe(false);
    expect(
      blank.success ? "" : blank.error.flatten().fieldErrors.name?.[0],
    ).toBe("Enter a list name.");
    expect(tooLong.success).toBe(false);
    expect(
      tooLong.success
        ? ""
        : tooLong.error.flatten().fieldErrors.name?.[0],
    ).toContain("80");
    expect(
      createListSchema.parse({ name: "a".repeat(80), description: "" }).name,
    ).toHaveLength(80);
  });

  it("rejects descriptions over 500 characters while accepting the boundary", () => {
    expect(
      createListSchema.parse({
        name: "Comfort Movies",
        description: "a".repeat(500),
      }).description,
    ).toHaveLength(500);

    const result = createListSchema.safeParse({
      name: "Comfort Movies",
      description: "a".repeat(501),
    });
    expect(result.success).toBe(false);
    expect(
      result.success
        ? ""
        : result.error.flatten().fieldErrors.description?.[0],
    ).toContain("500");
  });

  it("requires a valid list UUID when updating", () => {
    expect(
      updateListSchema.parse({
        listId: ` ${listId} `,
        name: "Weekend Movies",
        description: "",
      }).listId,
    ).toBe(listId);

    expect(
      updateListSchema.safeParse({
        listId: "42",
        name: "Weekend Movies",
        description: "",
      }).success,
    ).toBe(false);
  });
});

describe("custom-list identifier and batch validation", () => {
  it("validates and trims list, membership, and personal-library UUIDs", () => {
    expect(listUuidSchema.parse(` ${listId} `)).toBe(listId);
    expect(userMovieUuidSchema.parse(` ${userMovieId} `)).toBe(userMovieId);
    expect(listMovieUuidSchema.parse(` ${listMovieId} `)).toBe(listMovieId);

    for (const schema of [
      listUuidSchema,
      userMovieUuidSchema,
      listMovieUuidSchema,
    ]) {
      expect(schema.safeParse("not-a-uuid").success).toBe(false);
    }
  });

  it("preserves submitted movie order and rejects empty, duplicate, or oversized batches", () => {
    expect(
      userMovieIdsSchema.parse([secondUserMovieId, userMovieId]),
    ).toEqual([secondUserMovieId, userMovieId]);
    expect(userMovieIdsSchema.safeParse([]).success).toBe(false);
    expect(
      userMovieIdsSchema.safeParse([userMovieId, ` ${userMovieId} `]).success,
    ).toBe(false);

    const oversized = Array.from(
      { length: 101 },
      (_, index) =>
        `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );
    expect(userMovieIdsSchema.safeParse(oversized).success).toBe(false);
  });

  it("accepts an empty membership list but keeps non-empty list IDs ordered and unique", () => {
    expect(listIdsSchema.parse([])).toEqual([]);
    expect(listIdsSchema.parse([secondListId, listId])).toEqual([
      secondListId,
      listId,
    ]);
    expect(
      listIdsSchema.safeParse([listId, ` ${listId} `]).success,
    ).toBe(false);

    expect(
      setMovieListMembershipsSchema.parse({
        userMovieId,
        listIds: [],
      }),
    ).toEqual({ userMovieId, listIds: [] });
  });

  it("allows membership reconciliation across 500 lists but rejects 501", () => {
    const listIds = Array.from(
      { length: 501 },
      (_, index) =>
        `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );

    expect(listIdsSchema.parse(listIds.slice(0, 500))).toHaveLength(500);
    expect(listIdsSchema.safeParse(listIds).success).toBe(false);
  });

  it("keeps list and user_movies identifiers distinct in add requests", () => {
    expect(
      addMoviesToListSchema.parse({
        listId,
        userMovieIds: [secondUserMovieId, userMovieId],
      }),
    ).toEqual({
      listId,
      userMovieIds: [secondUserMovieId, userMovieId],
    });
  });
});

describe("custom-list picker validation", () => {
  it("normalizes safe picker defaults and the first repeated URL value", () => {
    expect(
      parseListPickerState({
        listQuery: ["  Nolan  ", "ignored"],
        listStatus: "watched",
        listFavourite: "favourites",
      }),
    ).toEqual({
      query: "Nolan",
      status: "watched",
      favourite: "favourites",
    });

    expect(
      parseListPickerState({
        listStatus: "not-a-status",
        listFavourite: "not-a-filter",
      }),
    ).toEqual({
      query: "",
      status: "all",
      favourite: "all",
    });
  });
});
