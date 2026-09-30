const GOOGLE_EVENT_TIME_PRECISION_MS = 1_000;

export function sameGoogleCalendarEventSecond(
  expected: string,
  actual: string,
) {
  const expectedMs = Date.parse(expected);
  const actualMs = Date.parse(actual);
  return (
    Number.isFinite(expectedMs) &&
    Number.isFinite(actualMs) &&
    Math.floor(expectedMs / GOOGLE_EVENT_TIME_PRECISION_MS) ===
      Math.floor(actualMs / GOOGLE_EVENT_TIME_PRECISION_MS)
  );
}

export function isGoogleCalendarEventDeleted(
  responseStatus: number,
  eventStatus: unknown,
) {
  return (
    responseStatus === 404 ||
    responseStatus === 410 ||
    (responseStatus === 200 && eventStatus === "cancelled")
  );
}
