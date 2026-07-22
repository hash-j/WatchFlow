import {
  LIBRARY_VIEWS,
  MOVIES_PER_PAGE_OPTIONS,
  type LibraryView,
} from "@/lib/settings/types";

export function normalizeLibraryView(
  value: unknown,
  fallback: LibraryView,
): LibraryView {
  return typeof value === "string" &&
    (LIBRARY_VIEWS as readonly string[]).includes(value)
    ? (value as LibraryView)
    : fallback;
}

export function normalizeLibraryPage(value: unknown) {
  const page = typeof value === "string" ? Number(value) : value;
  return typeof page === "number" && Number.isSafeInteger(page) && page > 0
    ? page
    : 1;
}

export function normalizeMoviesPerPage(value: unknown, fallback: number) {
  const amount = typeof value === "string" ? Number(value) : value;
  return typeof amount === "number" &&
    (MOVIES_PER_PAGE_OPTIONS as readonly number[]).includes(amount)
    ? amount
    : fallback;
}
