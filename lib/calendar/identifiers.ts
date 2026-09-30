import "server-only";

import { createHash } from "node:crypto";

type CalendarUpsertVersionInput = {
  sourceKey: string;
  scheduledFor: string | Date;
  scheduleTimezone: string;
  movieTitle: string;
  runtimeMinutes: number;
};

function md5(value: string) {
  return createHash("md5").update(value, "utf8").digest("hex");
}

function codePointLength(value: string) {
  return Array.from(value).length;
}

export function createCalendarSourceKey(
  connectionId: string,
  userMovieId: string,
) {
  return md5(
    `watchflow:calendar-source:${connectionId}:${userMovieId}`,
  );
}

export function createCalendarUpsertVersion({
  sourceKey,
  scheduledFor,
  scheduleTimezone,
  movieTitle,
  runtimeMinutes,
}: CalendarUpsertVersionInput) {
  const instant =
    scheduledFor instanceof Date ? scheduledFor : new Date(scheduledFor);

  if (!Number.isFinite(instant.getTime())) {
    throw new Error("Calendar source version requires a valid instant.");
  }

  const epochMicroseconds = BigInt(instant.getTime()) * BigInt(1_000);
  const value =
    `watchflow:calendar-version:upsert:${codePointLength(sourceKey)}:${sourceKey}`
    + `:${epochMicroseconds}`
    + `:${codePointLength(scheduleTimezone)}:${scheduleTimezone}`
    + `:${codePointLength(movieTitle)}:${movieTitle}`
    + `:${runtimeMinutes}`;

  return md5(value);
}

export function createCalendarDeleteVersion(sourceKey: string) {
  return md5(`watchflow:calendar-version:delete:${sourceKey}`);
}

export function createCalendarProviderEventId(
  connectionId: string,
  sourceKey: string,
) {
  return `a${md5(
    `watchflow:calendar-provider-event:${connectionId}:${sourceKey}`,
  )}`;
}
