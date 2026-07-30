import { describe, expect, it } from "vitest";

import {
  MOOD_RULES,
  matchesMood,
  normalizeGenreLabel,
  normalizeGenreLabels,
} from "./moods";
import { MOOD_KEYS, type MoodKey } from "./types";

describe("discovery genre normalization", () => {
  it("trims, collapses, deduplicates, and sorts string and legacy object genres", () => {
    expect(
      normalizeGenreLabels([
        "  Science   Fiction ",
        { name: "science fiction" },
        { name: " Drama " },
        "",
        null,
        { label: "ignored" },
      ]),
    ).toEqual(["Drama", "Science Fiction"]);
  });

  it("returns no labels for malformed values", () => {
    expect(normalizeGenreLabels(null)).toEqual([]);
    expect(normalizeGenreLabels({ name: "Drama" })).toEqual([]);
    expect(normalizeGenreLabel(" \t ")).toBeNull();
  });
});

describe("explicit mood rules", () => {
  const examples: Array<[MoodKey, string, string]> = [
    ["exciting", "Action", "Documentary"],
    ["relaxing", "Romance", "Crime"],
    ["funny", "Comedy", "War"],
    ["emotional", "Drama", "Action"],
    ["dark", "Horror", "Music"],
    ["intense", "War", "Romance"],
    ["mind_bending", "Science Fiction", "Comedy"],
    ["family_oriented", "Family", "Horror"],
  ];

  it("defines exactly the eight documented moods", () => {
    expect(Object.keys(MOOD_RULES)).toEqual([...MOOD_KEYS]);
  });

  it.each(examples)(
    "%s matches a configured genre and rejects an unrelated genre",
    (mood, matchingGenre, unrelatedGenre) => {
      expect(matchesMood([matchingGenre], 100, mood)).toBe(true);
      expect(matchesMood([unrelatedGenre], 100, mood)).toBe(false);
    },
  );

  it("matches one rule in a multi-genre movie and ignores casing and whitespace", () => {
    expect(
      matchesMood([" Drama ", "science   fiction"], 140, "mind_bending"),
    ).toBe(true);
  });

  it("requires known runtime within 130 minutes for Relaxing", () => {
    expect(matchesMood(["Comedy"], 130, "relaxing")).toBe(true);
    expect(matchesMood(["Comedy"], 131, "relaxing")).toBe(false);
    expect(matchesMood(["Comedy"], null, "relaxing")).toBe(false);
  });

  it("keeps explanations concrete and labels the family mood cautiously", () => {
    expect(MOOD_RULES.mind_bending.explanation).toContain("Mystery");
    expect(MOOD_RULES.mind_bending.explanation).toContain("Science Fiction");
    expect(MOOD_RULES.family_oriented.label).toBe("Family-oriented");
    expect(MOOD_RULES.family_oriented.caution).toMatch(/certification/i);
    expect(MOOD_RULES.family_oriented.caution).not.toMatch(/safe for every child/i);
  });
});

