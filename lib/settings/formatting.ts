import type { DateFormat, TimeFormat } from "./types";

function zonedDateParts(value: string | Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

export function formatUserDate(
  value: string | Date,
  timeZone: string,
  format: DateFormat,
) {
  const parts = zonedDateParts(value, timeZone);

  if (format === "MM/DD/YYYY") {
    return `${parts.month}/${parts.day}/${parts.year}`;
  }

  if (format === "YYYY-MM-DD") {
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  return `${parts.day}/${parts.month}/${parts.year}`;
}

export function formatUserTime(
  value: string | Date,
  timeZone: string,
  format: TimeFormat,
) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: format === "12h",
  }).format(new Date(value));
}

export function formatUserDateTime(
  value: string | Date,
  timeZone: string,
  dateFormat: DateFormat,
  timeFormat: TimeFormat,
) {
  const zoneName = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
  })
    .formatToParts(new Date(value))
    .find((part) => part.type === "timeZoneName")?.value;

  return `${formatUserDate(value, timeZone, dateFormat)} at ${formatUserTime(
    value,
    timeZone,
    timeFormat,
  )}${zoneName ? ` ${zoneName}` : ""}`;
}
