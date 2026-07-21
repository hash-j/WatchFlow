import type { LibraryMovie } from "../movies/types";
import { compareLocalDate, normalizeTimeZone } from "./timezone";

export function getScheduleTimezone(
  item: Pick<LibraryMovie, "scheduleTimezone">,
  fallbackTimezone: string,
) {
  return normalizeTimeZone(item.scheduleTimezone, fallbackTimezone);
}

export function groupScheduledMovies(
  movies: LibraryMovie[],
  fallbackTimezone: string,
  now = new Date(),
) {
  const scheduled = movies
    .filter(
      (item): item is LibraryMovie & { scheduledFor: string } =>
        item.status === "scheduled" && Boolean(item.scheduledFor),
    )
    .sort((left, right) => left.scheduledFor.localeCompare(right.scheduledFor));
  const compare = (item: LibraryMovie & { scheduledFor: string }) =>
    compareLocalDate(
      item.scheduledFor,
      getScheduleTimezone(item, fallbackTimezone),
      now,
    );

  return {
    today: scheduled.filter((item) => compare(item) === 0),
    upcoming: scheduled.filter((item) => compare(item) > 0),
    past: scheduled.filter((item) => compare(item) < 0).reverse(),
  };
}
