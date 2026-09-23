export const WATCH_NEXT_PRIORITY_LABELS = [
  "None",
  "Low",
  "Low",
  "Medium",
  "High",
  "Must Watch",
] as const;

export type WatchNextPriority = 0 | 1 | 2 | 3 | 4 | 5;

export function isWatchNextPriority(value: unknown): value is WatchNextPriority {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 5
  );
}

export function getWatchNextPriorityLabel(value: number) {
  return isWatchNextPriority(value)
    ? WATCH_NEXT_PRIORITY_LABELS[value]
    : WATCH_NEXT_PRIORITY_LABELS[0];
}
