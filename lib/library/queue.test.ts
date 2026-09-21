import { describe, expect, it } from "vitest";

import { reorderQueueIds, toSequentialQueuePositions } from "./queue";

describe("Watch Next queue invariants", () => {
  it("keeps empty and one-item queues contiguous", () => {
    expect(toSequentialQueuePositions([])).toEqual([]);
    expect(toSequentialQueuePositions(["only"])).toEqual([
      { libraryId: "only", queuePosition: 1 },
    ]);
    expect(reorderQueueIds([], "missing", "up")).toEqual([]);
    expect(reorderQueueIds(["only"], "only", "down")).toEqual(["only"]);
  });

  it("preserves multi-item order while assigning contiguous positions", () => {
    expect(toSequentialQueuePositions(["first", "second", "third"])).toEqual([
      { libraryId: "first", queuePosition: 1 },
      { libraryId: "second", queuePosition: 2 },
      { libraryId: "third", queuePosition: 3 },
    ]);
  });

  it("moves only the adjacent requested item and preserves boundaries", () => {
    expect(reorderQueueIds(["first", "second", "third"], "second", "up")).toEqual([
      "second",
      "first",
      "third",
    ]);
    expect(reorderQueueIds(["first", "second", "third"], "second", "down")).toEqual([
      "first",
      "third",
      "second",
    ]);
    expect(reorderQueueIds(["first", "second"], "first", "up")).toEqual([
      "first",
      "second",
    ]);
    expect(reorderQueueIds(["first", "second"], "second", "down")).toEqual([
      "first",
      "second",
    ]);
  });

  it("compacts after removal without changing survivor order", () => {
    const remaining = ["first", "second", "third"].filter(
      (id) => id !== "second",
    );
    expect(toSequentialQueuePositions(remaining)).toEqual([
      { libraryId: "first", queuePosition: 1 },
      { libraryId: "third", queuePosition: 2 },
    ]);
  });
});
