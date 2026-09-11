const MAX_REMOVAL_TITLE_LENGTH = 160;

export function sanitizeRemovalMovieTitle(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const sanitized = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_REMOVAL_TITLE_LENGTH)
    .trim();

  return sanitized || null;
}

export function getMovieRemovalMessage(value: unknown) {
  const title = sanitizeRemovalMovieTitle(value);
  return title
    ? `${title} was removed from your library.`
    : "The movie was removed from your library.";
}
