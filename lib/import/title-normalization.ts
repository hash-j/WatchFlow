export function normalizeMovieTitle(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function movieTitleKey(value: string) {
  return (
    normalizeMovieTitle(value) ||
    value.normalize("NFKC").trim().toLocaleLowerCase()
  );
}
