export function formatStatisticsCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatStatisticsRating(value: number | null) {
  if (value === null) {
    return "—";
  }

  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}/10`;
}

export function formatStatisticsRuntime(value: number | null) {
  if (value === null || !Number.isSafeInteger(value) || value <= 0) {
    return "—";
  }

  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export function formatStatisticsPercentage(value: number) {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
}

export function formatStatisticsWatchedDate(value: string | null) {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(
    new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))),
  );
}
