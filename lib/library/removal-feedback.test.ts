import { describe, expect, it } from "vitest";

import {
  getMovieRemovalMessage,
  sanitizeRemovalMovieTitle,
} from "./removal-feedback";

describe("library removal feedback", () => {
  it("names the removed movie in the success message", () => {
    expect(getMovieRemovalMessage("Arrival")).toBe(
      "Arrival was removed from your library.",
    );
  });

  it("normalizes control characters, whitespace, and excessive title length", () => {
    expect(sanitizeRemovalMovieTitle("  The\nMatrix\u0000  ")).toBe(
      "The Matrix",
    );
    expect(sanitizeRemovalMovieTitle("A".repeat(200))).toHaveLength(160);
  });

  it("uses a safe generic fallback for absent or empty titles", () => {
    expect(getMovieRemovalMessage(undefined)).toBe(
      "The movie was removed from your library.",
    );
    expect(getMovieRemovalMessage(" \n ")).toBe(
      "The movie was removed from your library.",
    );
  });
});
