import {
  CSV_IMPORT_MAX_BYTES,
  CSV_IMPORT_MAX_CELL_CHARACTERS,
  CSV_IMPORT_MAX_COLUMNS,
  CSV_IMPORT_MAX_ROWS,
  type CsvColumn,
  type CsvRawRow,
  type ParsedCsv,
} from "./types";

const ACCEPTED_CSV_MIME_TYPES = new Set([
  "",
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "text/plain",
]);

export class CsvImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvImportValidationError";
  }
}

export type CsvFileMetadata = {
  name: string;
  type: string;
  size: number;
};

export function validateCsvFileMetadata(
  file: CsvFileMetadata,
  maximumBytes = CSV_IMPORT_MAX_BYTES,
) {
  if (!file.name.toLowerCase().endsWith(".csv")) {
    throw new CsvImportValidationError("Choose a file with a .csv extension.");
  }

  if (!ACCEPTED_CSV_MIME_TYPES.has(file.type.toLowerCase())) {
    throw new CsvImportValidationError("The selected file is not a CSV file.");
  }

  if (file.size <= 0) {
    throw new CsvImportValidationError("The selected CSV file is empty.");
  }

  if (file.size > maximumBytes) {
    throw new CsvImportValidationError(
      `The CSV file must be ${Math.floor(maximumBytes / 1024 / 1024)} MB or smaller.`,
    );
  }
}

function parseCsvCells(source: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell.trim() === "") {
      cell = "";
      quoted = true;
    } else if (character === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (character === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else if (character !== "\r") {
      cell += character;
    }
  }

  if (quoted) {
    throw new CsvImportValidationError(
      "The CSV contains an unfinished quoted value.",
    );
  }

  row.push(cell.trim());
  if (row.some(Boolean) || rows.length === 0) {
    rows.push(row);
  }

  return rows;
}

function isEmptyRow(row: readonly string[]) {
  return row.every((value) => !value.trim());
}

function createColumns(headers: string[]) {
  if (headers.length === 0 || headers.every((header) => !header.trim())) {
    throw new CsvImportValidationError(
      "The CSV must include a header row with at least one named column.",
    );
  }

  const counts = new Map<string, number>();
  const duplicateNames = new Set<string>();
  const columns: CsvColumn[] = headers.map((header, index) => {
    const cleaned = header.replace(/^\uFEFF/, "").trim();
    const comparison = cleaned.toLocaleLowerCase();
    const count = (counts.get(comparison) ?? 0) + 1;
    counts.set(comparison, count);

    if (cleaned && count > 1) {
      duplicateNames.add(cleaned);
    }

    return {
      id: `column_${index + 1}`,
      header: cleaned || `Unnamed column ${index + 1}`,
      index,
    };
  });

  return { columns, duplicateNames: [...duplicateNames] };
}

export function parseCsvText(
  source: string,
  fileName = "import.csv",
  maximumRows = CSV_IMPORT_MAX_ROWS,
): ParsedCsv {
  const normalizedSource = source.replace(/^\uFEFF/, "");

  if (!normalizedSource.trim()) {
    throw new CsvImportValidationError("The selected CSV file is empty.");
  }

  const parsedRows = parseCsvCells(normalizedSource);
  if (parsedRows.some((row) => row.length > CSV_IMPORT_MAX_COLUMNS)) {
    throw new CsvImportValidationError(
      `The CSV must contain ${CSV_IMPORT_MAX_COLUMNS} columns or fewer.`,
    );
  }

  if (
    parsedRows.some((row) =>
      row.some((cell) => cell.length > CSV_IMPORT_MAX_CELL_CHARACTERS),
    )
  ) {
    throw new CsvImportValidationError(
      `CSV values must contain ${CSV_IMPORT_MAX_CELL_CHARACTERS.toLocaleString("en-US")} characters or fewer.`,
    );
  }

  const headerIndex = parsedRows.findIndex((row) => !isEmptyRow(row));

  if (headerIndex === -1) {
    throw new CsvImportValidationError("The selected CSV file is empty.");
  }

  const { columns, duplicateNames } = createColumns(parsedRows[headerIndex]);
  const dataRows = parsedRows
    .slice(headerIndex + 1)
    .filter((row) => !isEmptyRow(row));

  if (dataRows.length === 0) {
    throw new CsvImportValidationError(
      "The CSV has headers but does not contain any movie rows.",
    );
  }

  if (dataRows.length > maximumRows) {
    throw new CsvImportValidationError(
      `The CSV contains ${dataRows.length} rows. Import at most ${maximumRows} rows at a time.`,
    );
  }

  const rows: CsvRawRow[] = dataRows.map((cells, index) => ({
    id: `row_${index + 1}`,
    rowNumber: headerIndex + index + 2,
    values: Object.fromEntries(
      columns.map((column) => [column.id, (cells[column.index] ?? "").trim()]),
    ),
  }));
  const warnings: string[] = [];

  if (duplicateNames.length > 0) {
    warnings.push(
      `Duplicate headers were kept as separate columns: ${duplicateNames.join(", ")}.`,
    );
  }

  if (columns.some((column) => column.header.startsWith("Unnamed column "))) {
    warnings.push("Unnamed columns were kept and can be left unmapped.");
  }

  return { fileName, columns, rows, warnings };
}

function validateParsedCsvPayloadInternal(
  value: unknown,
  allowRowSubset: boolean,
): ParsedCsv {
  if (
    typeof value !== "object" ||
    value === null ||
    !("columns" in value) ||
    !("rows" in value) ||
    !Array.isArray(value.columns) ||
    !Array.isArray(value.rows) ||
    value.columns.length === 0 ||
    value.columns.length > CSV_IMPORT_MAX_COLUMNS ||
    value.rows.length === 0 ||
    value.rows.length > CSV_IMPORT_MAX_ROWS ||
    JSON.stringify(value).length > CSV_IMPORT_MAX_BYTES * 2
  ) {
    throw new CsvImportValidationError(
      "The temporary CSV data is invalid. Upload the file again.",
    );
  }

  const columns: CsvColumn[] = value.columns.map((column, index) => {
    if (
      typeof column !== "object" ||
      column === null ||
      !("id" in column) ||
      !("header" in column) ||
      typeof column.id !== "string" ||
      typeof column.header !== "string" ||
      column.id !== `column_${index + 1}` ||
      column.header.length > 200
    ) {
      throw new CsvImportValidationError(
        "The temporary CSV columns are invalid. Upload the file again.",
      );
    }

    return { id: column.id, header: column.header, index };
  });
  const columnIds = new Set(columns.map((column) => column.id));
  const seenRowIds = new Set<string>();
  let previousRowIndex = 0;
  const rows: CsvRawRow[] = value.rows.map((row, index) => {
    const rowId =
      typeof row === "object" && row !== null && "id" in row
        ? row.id
        : null;
    const rowIdMatch =
      typeof rowId === "string" ? /^row_([1-9]\d{0,2})$/.exec(rowId) : null;
    const originalRowIndex = rowIdMatch ? Number(rowIdMatch[1]) : 0;
    if (
      typeof row !== "object" ||
      row === null ||
      !("id" in row) ||
      !("rowNumber" in row) ||
      !("values" in row) ||
      (!allowRowSubset && row.id !== `row_${index + 1}`) ||
      (allowRowSubset &&
        (!rowIdMatch ||
          originalRowIndex > CSV_IMPORT_MAX_ROWS ||
          originalRowIndex <= previousRowIndex ||
          seenRowIds.has(row.id))) ||
      typeof row.rowNumber !== "number" ||
      !Number.isSafeInteger(row.rowNumber) ||
      typeof row.values !== "object" ||
      row.values === null
    ) {
      throw new CsvImportValidationError(
        "The temporary CSV rows are invalid. Upload the file again.",
      );
    }

    seenRowIds.add(row.id);
    previousRowIndex = originalRowIndex;

    const values = Object.fromEntries(
      [...columnIds].map((columnId) => {
        const cell = (row.values as Record<string, unknown>)[columnId];
        if (
          typeof cell !== "string" ||
          cell.length > CSV_IMPORT_MAX_CELL_CHARACTERS
        ) {
          throw new CsvImportValidationError(
            "A CSV value is invalid or too long. Upload a corrected file.",
          );
        }
        return [columnId, cell.trim()];
      }),
    );

    return { id: row.id, rowNumber: row.rowNumber, values };
  });

  return {
    fileName:
      "fileName" in value && typeof value.fileName === "string"
        ? value.fileName.slice(0, 255)
        : "import.csv",
    columns,
    rows,
    warnings:
      "warnings" in value && Array.isArray(value.warnings)
        ? value.warnings
            .filter((warning): warning is string => typeof warning === "string")
            .slice(0, 10)
        : [],
  };
}

export function validateParsedCsvPayload(value: unknown): ParsedCsv {
  return validateParsedCsvPayloadInternal(value, false);
}

export function validateParsedCsvChunkPayload(value: unknown): ParsedCsv {
  return validateParsedCsvPayloadInternal(value, true);
}
