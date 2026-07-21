export type QueueDirection = "up" | "down";

export function reorderQueueIds(
  queueIds: readonly string[],
  itemId: string,
  direction: QueueDirection,
) {
  const reordered = [...queueIds];
  const currentIndex = reordered.indexOf(itemId);

  if (currentIndex === -1) {
    return reordered;
  }

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (targetIndex < 0 || targetIndex >= reordered.length) {
    return reordered;
  }

  [reordered[currentIndex], reordered[targetIndex]] = [
    reordered[targetIndex],
    reordered[currentIndex],
  ];

  return reordered;
}

export function toSequentialQueuePositions(queueIds: readonly string[]) {
  return queueIds.map((libraryId, index) => ({
    libraryId,
    queuePosition: index + 1,
  }));
}
