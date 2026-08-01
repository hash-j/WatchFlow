import type { Locator } from "@playwright/test";

export type CsvFixtureValue = string | number | boolean | null | undefined;
export type CsvFixtureRow = Record<string, CsvFixtureValue>;

function escapeCsvCell(value: CsvFixtureValue) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function createCsvFixture(
  rows: readonly CsvFixtureRow[],
  headers = rows.length > 0 ? Object.keys(rows[0]!) : ["Title"],
) {
  return [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) =>
      headers.map((header) => escapeCsvCell(row[header])).join(","),
    ),
  ].join("\r\n");
}

export async function uploadCsvFixture(
  input: Locator,
  rows: readonly CsvFixtureRow[],
  fileName = "watchflow-qa.csv",
) {
  const text = createCsvFixture(rows);
  await input.setInputFiles({
    name: fileName,
    mimeType: "text/csv",
    buffer: Buffer.from(text, "utf8"),
  });
}
