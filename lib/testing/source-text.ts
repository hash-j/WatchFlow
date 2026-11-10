/** Preserve source tokens and whitespace; canonicalize only Windows newlines. */
export function normalizeSourceNewlines(source: string): string {
  return source.replace(/\r\n/g, "\n");
}
