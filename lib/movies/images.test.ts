import { describe, expect, it } from "vitest";

import { getTmdbImageUrl } from "./images";

describe("TMDB image URLs", () => {
  it("builds only a fixed HTTPS TMDB image URL", () => {
    expect(getTmdbImageUrl("/poster_123.jpg", "w342")).toBe(
      "https://image.tmdb.org/t/p/w342/poster_123.jpg",
    );
  });

  it.each([
    null,
    "",
    "poster.jpg",
    "//another-host.invalid/poster.jpg",
    "/../secret",
    "/poster?<script>",
  ])("uses the missing-image state for unsafe path %#", (path) => {
    expect(getTmdbImageUrl(path, "w342")).toBeNull();
  });
});
