import { describe, expect, it } from "vitest";

import {
  normalizeLibraryPage,
  normalizeLibraryView,
  normalizeMoviesPerPage,
} from "./view";

describe("saved library defaults and URL overrides", () => {
  it("uses saved view when the URL has no explicit view", () => {
    expect(normalizeLibraryView(undefined, "list")).toBe("list");
  });

  it("lets an explicit valid URL view override the saved default", () => {
    expect(normalizeLibraryView("grid", "list")).toBe("grid");
  });

  it("uses only supported page sizes and positive pages", () => {
    expect(normalizeMoviesPerPage("48", 24)).toBe(48);
    expect(normalizeMoviesPerPage("25", 24)).toBe(24);
    expect(normalizeLibraryPage("3")).toBe(3);
    expect(normalizeLibraryPage("0")).toBe(1);
  });
});
