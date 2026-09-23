"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleHelp,
  Copy,
  Download,
  Eye,
  FileSearch,
  FileUp,
  Library,
  Loader2,
  RotateCcw,
  Save,
  TableProperties,
} from "lucide-react";

import {
  confirmCsvImportAction,
  matchCsvRowsAction,
  parseCsvAction,
} from "@/app/(app)/actions/import";
import { MoviePoster } from "@/components/movies/movie-poster";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataScrollRegion, ResponsiveActions } from "@/components/ui/responsive-layout";
import { Select } from "@/components/ui/select";
import { escapeCsvCell } from "@/lib/csv/safety";
import {
  chunkImportValues,
  mergeImportBatchResults,
} from "@/lib/import/chunks";
import {
  CsvImportValidationError,
  validateCsvFileMetadata,
} from "@/lib/import/csv";
import {
  canMatchImportRow,
  ImportMappingValidationError,
  suggestColumnMappings,
  validateAndMapRows,
  validateColumnMapping,
} from "@/lib/import/mapping";
import {
  CSV_IMPORT_MAX_BYTES,
  CSV_IMPORT_PREVIEW_ROWS,
  IMPORT_FIELD_LABELS,
  IMPORT_FIELDS,
  type ColumnMapping,
  type ImportBatchResult,
  type ImportDecision,
  type ImportField,
  type ImportRowMatch,
  type ParsedCsv,
  type ValidatedImportRow,
} from "@/lib/import/types";
import { LIBRARY_MOVIE_STATUS_LABELS } from "@/lib/movies/types";

const STEPS = [
  { label: "Upload CSV", icon: FileUp },
  { label: "Map columns", icon: TableProperties },
  { label: "Preview", icon: Eye },
  { label: "Match TMDB", icon: FileSearch },
  { label: "Review matches", icon: CircleHelp },
  { label: "Confirm", icon: Save },
  { label: "Results", icon: CheckCircle2 },
] as const;

function rowState(row: ValidatedImportRow) {
  const primaryIssue = row.issues[0];
  if (!primaryIssue) {
    return { label: "Ready", classes: "bg-emerald-100 text-emerald-800" };
  }

  if (primaryIssue.severity === "review") {
    return { label: "Needs review", classes: "bg-amber-100 text-amber-900" };
  }

  const labels = {
    missing_title: "Missing title",
    invalid_tmdb_id: "Invalid TMDB ID",
    invalid_year: "Invalid year",
    invalid_rating: "Invalid rating",
    invalid_watched_date: "Invalid date",
    invalid_priority: "Invalid priority",
    invalid_review: "Review too long",
    invalid_favourite: "Invalid favourite",
    invalid_watch_again: "Invalid watch-again value",
    unknown_status: "Needs review",
    duplicate_csv_row: "Duplicate CSV row",
  } as const;

  return {
    label: labels[primaryIssue.code],
    classes: "bg-destructive/10 text-destructive",
  };
}

function matchLabel(match: ImportRowMatch) {
  switch (match.classification) {
    case "exact":
      return "Exact match";
    case "probable":
      return "Probable match";
    case "ambiguous":
      return "Ambiguous";
    case "no_match":
      return "No match";
    case "error":
      return "Matching failed";
  }
}

function failureReport(result: ImportBatchResult) {
  const failures = result.rows.filter(
    (row) => !["added", "updated"].includes(row.status),
  );
  return [
    ["CSV row", "Imported title", "Result", "Message"],
    ...failures.map((row) => [
      row.rowNumber,
      row.importedTitle,
      row.status,
      row.message,
    ]),
  ]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\n");
}

export function ImportWizard() {
  const [step, setStep] = useState(1);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [rows, setRows] = useState<ValidatedImportRow[]>([]);
  const [matches, setMatches] = useState<ImportRowMatch[]>([]);
  const [selectedMatches, setSelectedMatches] = useState<Record<string, number>>(
    {},
  );
  const [skippedRows, setSkippedRows] = useState<Record<string, boolean>>({});
  const [acceptedStatuses, setAcceptedStatuses] = useState<
    Record<string, boolean>
  >({});
  const [result, setResult] = useState<ImportBatchResult | null>(null);
  const [completedBatches, setCompletedBatches] = useState<ImportBatchResult[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isProcessing, setIsProcessing] = useState(false);

  function resetImport() {
    setStep(1);
    setParsed(null);
    setMapping({});
    setRows([]);
    setMatches([]);
    setSelectedMatches({});
    setSkippedRows({});
    setAcceptedStatuses({});
    setResult(null);
    setCompletedBatches([]);
    setMessage(null);
    setProgress(null);
  }

  function uploadCsv(formData: FormData) {
    const file = formData.get("file");
    setMessage(null);

    try {
      if (!(file instanceof File)) {
        throw new CsvImportValidationError("Choose a CSV file to upload.");
      }
      validateCsvFileMetadata(file);
    } catch (error) {
      setMessage(
        error instanceof CsvImportValidationError
          ? error.message
          : "Choose a valid CSV file.",
      );
      return;
    }

    setProgress("Reading CSV");
    startTransition(async () => {
      const response = await parseCsvAction(formData);
      if (!response.ok) {
        setMessage(response.message);
        setProgress(null);
        return;
      }

      setProgress("Validating");
      const suggested = suggestColumnMappings(response.data.columns);
      setParsed(response.data);
      setMapping(suggested);
      setStep(2);
      setProgress(null);
    });
  }

  function updateMapping(field: ImportField, columnId: string) {
    setMapping((current) => {
      const next = { ...current };

      for (const existingField of IMPORT_FIELDS) {
        if (existingField !== field && next[existingField] === columnId) {
          delete next[existingField];
        }
      }

      if (columnId) {
        next[field] = columnId;
      } else {
        delete next[field];
      }
      return next;
    });
  }

  function previewRows() {
    if (!parsed) {
      return;
    }

    try {
      validateColumnMapping(mapping, parsed.columns);
      const validated = validateAndMapRows(parsed, mapping);
      setRows(validated);
      setCompletedBatches([]);
      setMessage(null);
      setStep(3);
    } catch (error) {
      setMessage(
        error instanceof ImportMappingValidationError
          ? error.message
          : "The column mapping could not be validated.",
      );
    }
  }

  function parsedRows(rowIds: readonly string[]): ParsedCsv {
    const selected = new Set(rowIds);
    return {
      ...parsed!,
      rows: parsed!.rows.filter((row) => selected.has(row.id)),
    };
  }

  function runMatching(rowIds?: string[], merge = false) {
    if (!parsed) {
      return;
    }

    const ids =
      rowIds ??
      rows
        .filter((row) => canMatchImportRow(row) && !skippedRows[row.id])
        .map((row) => row.id);
    setMessage(null);
    setProgress(`Matching: Processed 0 / ${ids.length}`);
    setStep(4);
    setIsProcessing(true);

    void (async () => {
      const collected = merge
        ? matches.filter((existing) => !ids.includes(existing.rowId))
        : [];
      let processed = 0;
      for (const chunk of chunkImportValues(ids)) {
        const response = await matchCsvRowsAction({
          parsed: parsedRows(chunk),
          mapping,
          rowIds: chunk,
        });
        if (!response.ok) {
          setMatches(collected);
          setMessage(`${response.message} Retry matching to continue.`);
          setProgress(null);
          setIsProcessing(false);
          setStep(3);
          return;
        }
        collected.push(...response.data);
        processed += chunk.length;
        setProgress(`Matching: Processed ${processed} / ${ids.length}`);
        setSelectedMatches((current) => ({
          ...current,
          ...Object.fromEntries(
            response.data.flatMap((match) =>
              match.selectedTmdbId ? [[match.rowId, match.selectedTmdbId]] : [],
            ),
          ),
        }));
      }
      setMatches(collected);
      setProgress(null);
      setIsProcessing(false);
      setStep(5);
    })();
  }

  function canContinueToConfirm() {
    return matches.every((match) => {
      if (skippedRows[match.rowId]) {
        return true;
      }

      if (match.classification === "no_match" || match.classification === "error") {
        return true;
      }

      const row = rows.find((candidate) => candidate.id === match.rowId);
      const statusAccepted =
        !row?.importedStatus || row.status !== null || acceptedStatuses[row.id];
      return Boolean(selectedMatches[match.rowId]) && statusAccepted;
    });
  }

  function createDecisions(): ImportDecision[] {
    const selectedIds = new Set<number>();
    return rows.map((row): ImportDecision => {
      const match = matches.find((candidate) => candidate.rowId === row.id);
      const selectedTmdbId = selectedMatches[row.id] ?? null;

      if (row.issues.some((issue) => issue.code === "duplicate_csv_row")) {
        return {
          rowId: row.id,
          disposition: "skip",
          tmdbId: null,
          acceptDefaultStatus: false,
          skipReason: "duplicate",
        };
      }

      if (skippedRows[row.id]) {
        return {
          rowId: row.id,
          disposition: "skip",
          tmdbId: null,
          acceptDefaultStatus: false,
          skipReason: "user",
        };
      }

      if (!match || !selectedTmdbId) {
        return {
          rowId: row.id,
          disposition: "unmatched",
          tmdbId: null,
          acceptDefaultStatus: false,
        };
      }

      if (selectedIds.has(selectedTmdbId)) {
        return {
          rowId: row.id,
          disposition: "skip",
          tmdbId: null,
          acceptDefaultStatus: false,
          skipReason: "duplicate",
        };
      }
      selectedIds.add(selectedTmdbId);

      return {
        rowId: row.id,
        disposition: "import",
        tmdbId: selectedTmdbId,
        acceptDefaultStatus: acceptedStatuses[row.id] === true,
      };
    });
  }

  function confirmImport() {
    if (!parsed) {
      return;
    }

    setMessage(null);
    setIsProcessing(true);
    const existing = [...completedBatches];
    const processedIds = new Set(existing.flatMap((batch) => batch.rows.map((row) => row.rowId)));
    const pendingRows = rows.filter((row) => !processedIds.has(row.id));
    const decisions = new Map(createDecisions().map((decision) => [decision.rowId, decision]));
    const batches = [...existing];
    const total = rows.length;
    const reportProgress = () => {
      const merged = mergeImportBatchResults(batches);
      setProgress(
        `Processed ${merged.summary.total} / ${total} · Added: ${merged.summary.added} · Updated: ${merged.summary.updated} · Skipped: ${merged.summary.skipped + merged.summary.invalid + merged.summary.unmatched} · Failed: ${merged.summary.failed}`,
      );
    };
    reportProgress();

    void (async () => {
      for (const chunk of chunkImportValues(pendingRows)) {
        const response = await confirmCsvImportAction({
          parsed: parsedRows(chunk.map((row) => row.id)),
          mapping,
          decisions: chunk.map((row) => decisions.get(row.id)!),
        });
        if (!response.ok) {
          setCompletedBatches(batches);
          setMessage(`${response.message} Retry to continue with the remaining rows.`);
          setIsProcessing(false);
          return;
        }
        batches.push(response.data);
        setCompletedBatches([...batches]);
        reportProgress();
      }

      const merged = mergeImportBatchResults(batches);
      setResult(merged);
      setProgress(
        `Complete · Processed ${merged.summary.total} / ${total} · Added: ${merged.summary.added} · Updated: ${merged.summary.updated} · Skipped: ${merged.summary.skipped + merged.summary.invalid + merged.summary.unmatched} · Failed: ${merged.summary.failed}`,
      );
      setCompletedBatches([]);
      setIsProcessing(false);
      setStep(7);
    })();
  }

  function retryUnmatched() {
    if (!result) {
      return;
    }

    const retryIds = result.rows
      .filter((row) => row.status === "unmatched" || row.status === "failed")
      .map((row) => row.rowId);
    const completedRows = Object.fromEntries(
      result.rows
        .filter((row) => !retryIds.includes(row.rowId))
        .map((row) => [row.rowId, true]),
    );
    setSkippedRows(completedRows);
    setResult(null);
    runMatching(retryIds, true);
  }

  async function copyFailureReport() {
    if (!result) {
      return;
    }
    try {
      await navigator.clipboard.writeText(failureReport(result));
      setMessage("Failure report copied.");
    } catch {
      setMessage("The failure report could not be copied in this browser.");
    }
  }

  function downloadFailureReport() {
    if (!result) {
      return;
    }
    const blob = new Blob([failureReport(result)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "watchflow-import-failures.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const importableCount = matches.filter(
    (match) => !skippedRows[match.rowId] && selectedMatches[match.rowId],
  ).length;

  return (
    <div className="mt-8">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7" aria-label="Import progress">
        {STEPS.map(({ label, icon: Icon }, index) => {
          const number = index + 1;
          const active = step === number;
          const complete = step > number;
          return (
            <li
              key={label}
              aria-current={active ? "step" : undefined}
              className={`flex min-h-12 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : complete
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "bg-card text-muted-foreground"
              }`}
            >
              {complete ? <Check className="size-4" aria-hidden="true" /> : <Icon className="size-4" aria-hidden="true" />}
              <span>{number}. {label}</span>
            </li>
          );
        })}
      </ol>

      {progress ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm" role="status" aria-live="polite">
          {!progress.startsWith("Complete") ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />}
          {progress}
        </div>
      ) : null}
      {message ? (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm" role="alert">
          {message}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="mt-6 space-y-4">
          <details className="rounded-xl border bg-card">
            <summary className="flex min-h-12 cursor-pointer list-none items-center px-4 py-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              What happens during import?
            </summary>
            <ol className="list-decimal space-y-2 border-t px-9 py-4 text-sm text-muted-foreground">
              <li>Upload a comma-separated <strong className="text-foreground">.csv</strong> file.</li>
              <li>Choose which columns contain titles and personal details.</li>
              <li>Review WatchFlow’s movie matches and correct any uncertain rows.</li>
              <li>Confirm once to add the matched movies to your private Library.</li>
            </ol>
          </details>
          <Card>
            <CardHeader>
              <CardTitle>Upload CSV</CardTitle>
              <p className="text-sm text-muted-foreground">
                Use this when you already keep movies in a spreadsheet. Your
                file remains temporary while you review it.
              </p>
            </CardHeader>
            <CardContent>
              <form action={uploadCsv} className="space-y-4">
              <div>
                <label htmlFor="csv-file" className="text-sm font-medium">CSV file</label>
                <input
                  id="csv-file"
                  name="file"
                  type="file"
                  accept=".csv,text/csv"
                  required
                  className="mt-2 block min-h-11 w-full rounded-md border bg-background px-3 py-2 text-sm file:mr-4 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  CSV only, up to {CSV_IMPORT_MAX_BYTES / 1024 / 1024} MB and 500 movie rows.
                </p>
              </div>
              <Button type="submit" disabled={isPending}>
                <FileUp aria-hidden="true" />
                {isPending ? "Reading..." : "Upload and inspect"}
              </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {step === 2 && parsed ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Map columns</CardTitle>
            <p className="text-sm text-muted-foreground">
              Choose which CSV column supplies each WatchFlow field. Movie title is required; generic Rating columns require your explicit selection.
            </p>
          </CardHeader>
          <CardContent>
            {parsed.warnings.map((warning) => (
              <p key={warning} className="mb-3 rounded-md bg-amber-50 p-3 text-sm text-amber-950">{warning}</p>
            ))}
            <div className="grid gap-4 md:grid-cols-2">
              {IMPORT_FIELDS.map((field) => (
                <div key={field}>
                  <label htmlFor={`mapping-${field}`} className="text-sm font-medium">
                    {IMPORT_FIELD_LABELS[field]} {field === "title" ? <span className="text-destructive">*</span> : null}
                  </label>
                  <Select
                    id={`mapping-${field}`}
                    value={mapping[field] ?? ""}
                    onChange={(event) => updateMapping(field, event.target.value)}
                    containerClassName="mt-2"
                  >
                    <option value="">Not imported</option>
                    {parsed.columns.map((column) => (
                      <option key={column.id} value={column.id}>{column.header}</option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button type="button" variant="outline" onClick={() => setStep(1)}><ArrowLeft aria-hidden="true" />Back</Button>
              <Button type="button" onClick={previewRows}>Preview rows<ArrowRight aria-hidden="true" /></Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Preview and validate</CardTitle>
            <p className="text-sm text-muted-foreground">
              Showing the first {Math.min(CSV_IMPORT_PREVIEW_ROWS, rows.length)} of {rows.length} non-empty rows. Invalid and duplicate rows will not be matched.
            </p>
          </CardHeader>
          <CardContent>
            <DataScrollRegion label="CSV preview rows">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">Skip</th><th className="px-3 py-3">Row</th><th className="px-3 py-3">Title</th><th className="px-3 py-3">Year</th><th className="px-3 py-3">Director</th><th className="px-3 py-3">Genres</th><th className="px-3 py-3">Rating</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Validation</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.slice(0, CSV_IMPORT_PREVIEW_ROWS).map((row) => {
                    const state = rowState(row);
                    const valid = canMatchImportRow(row);
                    return (
                      <tr key={row.id}>
                        <td className="px-3 py-3"><input type="checkbox" checked={!valid || skippedRows[row.id] === true} disabled={!valid} onChange={(event) => setSkippedRows((current) => ({ ...current, [row.id]: event.target.checked }))} aria-label={`Skip CSV row ${row.rowNumber}`} className="size-4" /></td>
                        <td className="px-3 py-3 text-muted-foreground">{row.rowNumber}</td>
                        <td className="max-w-48 truncate px-3 py-3 font-medium">{row.title || "—"}</td>
                        <td className="px-3 py-3">{row.releaseYear ?? "—"}</td>
                        <td className="max-w-40 truncate px-3 py-3">{row.director ?? "—"}</td>
                        <td className="max-w-40 truncate px-3 py-3">{row.genres.join(", ") || "—"}</td>
                        <td className="px-3 py-3">{row.personalRating ?? "—"}</td>
                        <td className="px-3 py-3">{row.status ? LIBRARY_MOVIE_STATUS_LABELS[row.status] : row.importedStatus ?? "Default"}</td>
                        <td className="px-3 py-3"><span title={row.issues.map((issue) => issue.message).join(" ")} className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${state.classes}`}>{state.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </DataScrollRegion>
            <ResponsiveActions className="mt-6">
              <Button type="button" variant="outline" onClick={() => setStep(2)}><ArrowLeft aria-hidden="true" />Back to mapping</Button>
              <Button type="button" disabled={isPending || isProcessing || rows.every((row) => !canMatchImportRow(row) || skippedRows[row.id])} onClick={() => runMatching()}>Match with TMDB<ArrowRight aria-hidden="true" /></Button>
            </ResponsiveActions>
          </CardContent>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card className="mt-6">
          <CardContent className="grid min-h-72 place-items-center pt-6 text-center">
            <div><Loader2 className="mx-auto size-8 animate-spin text-primary" aria-hidden="true" /><h2 className="mt-4 text-lg font-semibold">Matching movies securely</h2><p className="mt-2 text-sm text-muted-foreground">TMDB requests are limited and processed only on the server.</p></div>
          </CardContent>
        </Card>
      ) : null}

      {step === 5 ? (
        <div className="mt-6 space-y-4">
          <div><h2 className="text-xl font-semibold">Review matches</h2><p className="mt-1 text-sm text-muted-foreground">Only exact and high-confidence probable matches are preselected. Choose ambiguous movies or skip them.</p></div>
          {matches.map((match) => {
            const row = rows.find((candidate) => candidate.id === match.rowId)!;
            const showOptions = match.classification === "ambiguous";
            return (
              <Card key={match.rowId}>
                <CardContent className="pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="text-xs text-muted-foreground">CSV row {row.rowNumber}</p><h3 className="font-semibold">{row.title} {row.releaseYear ? `(${row.releaseYear})` : ""}</h3><p className="mt-1 text-sm text-muted-foreground">{match.message}</p></div>
                    <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{matchLabel(match)}</span>
                  </div>
                  {match.candidates.length > 0 ? (
                    <div className={`mt-4 grid gap-3 ${showOptions ? "md:grid-cols-2 xl:grid-cols-3" : "max-w-xl"}`}>
                      {(showOptions ? match.candidates : match.candidates.slice(0, 1)).map((candidate) => (
                        <label key={candidate.tmdbId} className={`flex cursor-pointer gap-3 rounded-lg border p-3 focus-within:ring-2 focus-within:ring-ring ${selectedMatches[row.id] === candidate.tmdbId ? "border-primary bg-primary/5" : ""}`}>
                          <input type="radio" name={`match-${row.id}`} value={candidate.tmdbId} checked={selectedMatches[row.id] === candidate.tmdbId} onChange={() => setSelectedMatches((current) => ({ ...current, [row.id]: candidate.tmdbId }))} className="mt-2 size-4" />
                          <div className="w-16 shrink-0"><MoviePoster path={candidate.posterPath} title={candidate.title} sizes="64px" /></div>
                          <span className="min-w-0"><span className="block font-medium">{candidate.title}</span>{candidate.originalTitle ? <span className="block text-xs text-muted-foreground">Original: {candidate.originalTitle}</span> : null}<span className="mt-1 block text-xs text-muted-foreground">{candidate.releaseDate?.slice(0, 4) ?? "Year unavailable"}</span><span className="mt-2 line-clamp-3 text-xs text-muted-foreground">{candidate.overview ?? "Overview unavailable"}</span></span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                  {row.importedStatus && row.status === null && !skippedRows[row.id] ? (
                    <label className="mt-4 flex min-h-11 items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"><input type="checkbox" checked={acceptedStatuses[row.id] === true} onChange={(event) => setAcceptedStatuses((current) => ({ ...current, [row.id]: event.target.checked }))} className="size-4" />Use Saved instead of unrecognized status “{row.importedStatus}”.</label>
                  ) : null}
                  <label className="mt-4 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={skippedRows[row.id] === true} onChange={(event) => setSkippedRows((current) => ({ ...current, [row.id]: event.target.checked }))} className="size-4" />Skip this CSV row</label>
                </CardContent>
              </Card>
            );
          })}
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={() => setStep(3)}><ArrowLeft aria-hidden="true" />Back to preview</Button>
            <Button type="button" disabled={!canContinueToConfirm()} onClick={() => setStep(6)}>Review import summary<ArrowRight aria-hidden="true" /></Button>
          </div>
        </div>
      ) : null}

      {step === 6 ? (
        <Card className="mt-6">
          <CardHeader><CardTitle>Confirm import</CardTitle><p className="text-sm text-muted-foreground">Confirm once to process the file in safe batches. New movies are added and supplied metadata updates existing Library movies.</p></CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-muted p-4"><dt className="text-xs text-muted-foreground">CSV rows</dt><dd className="mt-1 text-2xl font-bold">{rows.length}</dd></div><div className="rounded-lg bg-muted p-4"><dt className="text-xs text-muted-foreground">Selected to import</dt><dd className="mt-1 text-2xl font-bold">{importableCount}</dd></div><div className="rounded-lg bg-muted p-4"><dt className="text-xs text-muted-foreground">Skipped, invalid, or unmatched</dt><dd className="mt-1 text-2xl font-bold">{rows.length - importableCount}</dd></div></dl>
            <p className="mt-4 text-sm text-muted-foreground">Existing Library movies receive only mapped user metadata. Watch Next entries are appended in CSV order.</p>
            <div className="mt-6 flex flex-wrap gap-3"><Button type="button" variant="outline" disabled={isProcessing} onClick={() => setStep(5)}><ArrowLeft aria-hidden="true" />Back to matches</Button><Button type="button" disabled={isPending || isProcessing || importableCount === 0} onClick={confirmImport}>{isProcessing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}{isProcessing ? "Processing batches..." : completedBatches.length > 0 ? "Retry remaining rows" : "Confirm import"}</Button></div>
          </CardContent>
        </Card>
      ) : null}

      {step === 7 && result ? (
        <div className="mt-6 space-y-6">
          <Card><CardHeader><CardTitle>Import complete</CardTitle><p className="text-sm text-muted-foreground">Each row was handled independently, so successful movies remain saved if another row failed.</p></CardHeader><CardContent>
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
              {[["Total", result.summary.total], ["Added", result.summary.added], ["Updated", result.summary.updated], ["Skipped", result.summary.skipped], ["Invalid", result.summary.invalid], ["Unmatched", result.summary.unmatched], ["Failed", result.summary.failed]].map(([label, value]) => <div key={label} className="min-w-0 rounded-lg bg-muted p-3"><dt className="whitespace-nowrap text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-bold">{value}</dd></div>)}
            </dl>
            {result.warnings.map((warning) => <p key={warning} className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-950">{warning}</p>)}
          </CardContent></Card>
          <DataScrollRegion label="Import result rows" className="bg-card"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-muted/60 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">CSV row</th><th className="px-4 py-3">Imported title</th><th className="px-4 py-3">TMDB title</th><th className="min-w-24 whitespace-nowrap px-4 py-3">Result</th><th className="px-4 py-3">Message</th></tr></thead><tbody className="divide-y">{result.rows.map((row) => <tr key={`${row.rowId}-${row.rowNumber}`}><td className="px-4 py-3">{row.rowNumber}</td><td className="px-4 py-3 font-medium">{row.importedTitle}</td><td className="px-4 py-3">{row.matchedTitle ?? "—"}</td><td className="min-w-24 whitespace-nowrap px-4 py-3 capitalize">{row.status.replaceAll("_", " ")}</td><td className="px-4 py-3 text-muted-foreground">{row.message}</td></tr>)}</tbody></table></DataScrollRegion>
          <ResponsiveActions><Button asChild><Link href="/library"><Library aria-hidden="true" />Open library</Link></Button><Button type="button" variant="outline" onClick={downloadFailureReport}><Download aria-hidden="true" />Download failure report</Button><Button type="button" variant="outline" onClick={copyFailureReport}><Copy aria-hidden="true" />Copy failure report</Button>{result.summary.unmatched + result.summary.failed > 0 ? <Button type="button" variant="outline" onClick={retryUnmatched}><RotateCcw aria-hidden="true" />Retry unmatched rows</Button> : null}<Button type="button" variant="ghost" onClick={resetImport}>Start another import</Button></ResponsiveActions>
        </div>
      ) : null}
    </div>
  );
}
