function stringValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function neutralizeSpreadsheetFormula(value: string) {
  return /^[\t\r\n ]*[=+\-@*]/.test(value) ? `'${value}` : value;
}

export function escapeCsvCell(value: unknown) {
  const safe = neutralizeSpreadsheetFormula(stringValue(value));
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
