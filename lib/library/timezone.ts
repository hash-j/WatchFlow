import { LibraryValidationError } from "./errors";

type ZonedDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function getZonedParts(date: Date, timeZone: string): ZonedDateTimeParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
  };
}

function parseDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? { year, month, day }
    : null;
}

function parseTimeInput(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
    ? { hour, minute }
    : null;
}

export function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimeZone(value: unknown, fallback = "UTC") {
  return typeof value === "string" && isValidTimeZone(value)
    ? value
    : fallback;
}

export function isValidDateInput(value: string) {
  return Boolean(parseDateInput(value));
}

export function getWatchedDateInput(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim();
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|T)/.exec(normalized);
  const calendarDate = match?.[1] ?? "";

  if (!isValidDateInput(calendarDate)) {
    return "";
  }

  if (normalized.length > 10 && Number.isNaN(Date.parse(normalized))) {
    return "";
  }

  return calendarDate;
}

export function zonedDateTimeToIso(
  dateInput: string,
  timeInput: string,
  timeZone: string,
) {
  const date = parseDateInput(dateInput);
  const time = parseTimeInput(timeInput);

  if (!date) {
    throw new LibraryValidationError("Choose a valid scheduled date.");
  }

  if (!time) {
    throw new LibraryValidationError("Choose a valid scheduled time.");
  }

  if (!isValidTimeZone(timeZone)) {
    throw new LibraryValidationError("Choose a valid IANA timezone.");
  }

  const desiredUtc = Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    time.hour,
    time.minute,
  );
  let candidate = desiredUtc;

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const represented = getZonedParts(new Date(candidate), timeZone);
    const representedUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
    );
    const correction = desiredUtc - representedUtc;

    candidate += correction;
    if (correction === 0) {
      break;
    }
  }

  const result = new Date(candidate);
  const represented = getZonedParts(result, timeZone);
  const matchesRequestedWallTime =
    represented.year === date.year &&
    represented.month === date.month &&
    represented.day === date.day &&
    represented.hour === time.hour &&
    represented.minute === time.minute;

  if (!matchesRequestedWallTime) {
    throw new LibraryValidationError(
      "That local time does not exist in the selected timezone.",
    );
  }

  return result.toISOString();
}

export function getLocalDateInput(isoDate: string, timeZone: string) {
  const parts = getZonedParts(new Date(isoDate), timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function getLocalTimeInput(isoDate: string, timeZone: string) {
  const parts = getZonedParts(new Date(isoDate), timeZone);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function formatScheduledDateTime(isoDate: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(isoDate));
}

export function compareLocalDate(
  isoDate: string,
  timeZone: string,
  now = new Date(),
) {
  const scheduledDate = getLocalDateInput(isoDate, timeZone);
  const today = getLocalDateInput(now.toISOString(), timeZone);
  return scheduledDate.localeCompare(today);
}
