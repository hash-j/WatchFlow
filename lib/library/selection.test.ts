import { describe, expect, it } from "vitest";

import {
  getPageSelectionState,
  orderedSelectedLibraryIds,
  selectVisibleLibraryIds,
  toggleLibrarySelection,
} from "./selection";

describe("current-page library selection", () => {
  const visible = ["first", "second", "third"];

  it("selects and deselects one movie", () => {
    const selected = toggleLibrarySelection(new Set(), "second");
    expect([...selected]).toEqual(["second"]);
    expect([...toggleLibrarySelection(selected, "second")]).toEqual([]);
  });

  it("selects all movies on only the current page", () => {
    expect([...selectVisibleLibraryIds(visible)]).toEqual(visible);
  });

  it("serializes selected IDs in visible display order rather than click order", () => {
    const selected = new Set(["third", "first"]);
    expect(orderedSelectedLibraryIds(visible, selected)).toEqual([
      "first",
      "third",
    ]);
  });

  it("reports unchecked, indeterminate, and checked selection states", () => {
    expect(getPageSelectionState(visible, new Set())).toEqual({
      selectedCount: 0,
      checked: false,
      indeterminate: false,
    });
    expect(getPageSelectionState(visible, new Set(["second"]))).toEqual({
      selectedCount: 1,
      checked: false,
      indeterminate: true,
    });
    expect(getPageSelectionState(visible, new Set(visible))).toEqual({
      selectedCount: 3,
      checked: true,
      indeterminate: false,
    });
  });

  it("drops off-page selections when ordered for a new scope", () => {
    expect(
      orderedSelectedLibraryIds(["new-page"], new Set(["old-page"])),
    ).toEqual([]);
  });
});

