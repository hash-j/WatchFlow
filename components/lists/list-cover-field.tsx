"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, RotateCcw, Trash2, Upload } from "lucide-react";
import { ArtworkImage } from "@/components/artwork/artwork-image";
import { Button } from "@/components/ui/button";
import { ARTWORK_TYPES, artworkFileError, parseArtworkPath } from "@/lib/artwork/paths";

export type ListCoverSelection = { operation: "keep" | "upload" | "remove"; file: File | null };

export function ListCoverField({ idPrefix, listId, currentPath, value, disabled, onChange, onError }: {
  idPrefix: string; listId?: string; currentPath?: string | null; value: ListCoverSelection; disabled: boolean;
  onChange: (value: ListCoverSelection) => void; onError: (message: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const parsed = parseArtworkPath(currentPath);
  const savedPath = parsed?.kind === "list" && parsed.listId === listId ? currentPath : null;
  const showSaved = !!savedPath && value.operation !== "remove";
  const hasPreview = !!preview && !!value.file;
  const id = `${idPrefix}-cover`;
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function clearError() { setError(null); onError(null); }
  function clearSelection() {
    if (input.current) input.current.value = "";
    setPreview(null); clearError();
    onChange({ operation: savedPath ? "remove" : "keep", file: null });
  }
  const empty = <div className="flex h-full flex-col items-center justify-center gap-3 px-5 py-7 text-center">
    <div className="grid size-12 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
      <ImagePlus className="size-6" aria-hidden="true" />
    </div>
    <div><p className="font-semibold text-foreground">Give your list a cover</p>
      <p className="mt-1 text-sm text-muted-foreground">Add a personal touch to your collection.</p></div>
  </div>;

  return <section className="space-y-3" aria-labelledby={`${id}-label`}>
    <div className="flex items-center justify-between gap-2">
      <h3 id={`${id}-label`} className="text-sm font-semibold">Cover image</h3>
      <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">Optional</span>
    </div>
    <input ref={input} id={id} name="coverImage" type="file" accept={ARTWORK_TYPES.join(",")} className="sr-only" tabIndex={-1}
      aria-label="Choose cover image" aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`} aria-invalid={!!error}
      disabled={disabled} onChange={event => {
        const file = event.currentTarget.files?.[0];
        if (!file) return;
        const invalid = artworkFileError(file);
        setError(invalid); onError(invalid);
        if (invalid) {
          event.currentTarget.value = ""; setPreview(null);
          onChange({ operation: "keep", file: null }); return;
        }
        setPreview(URL.createObjectURL(file));
        onChange({ operation: "upload", file });
      }} />
    <input type="hidden" name="coverOperation" value={value.operation} />
    <div className="overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-surface to-surface shadow-sm">
      <div className="relative aspect-[16/9] overflow-hidden">
        <div className="absolute inset-0">
        {hasPreview ? <>
          {/* Browser-local preview only; the server validates and re-encodes bytes. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview!} alt="Selected cover preview" className="size-full object-cover" />
        </> : showSaved ? <ArtworkImage path={savedPath} alt="Current list cover" fallback={empty} /> : empty}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-primary/20 bg-surface/80 p-3">
        <Button type="button" size="sm" disabled={disabled} onClick={() => input.current?.click()} aria-controls={id} className="min-w-0 flex-[1_1_10rem] sm:text-sm">
          <Upload className="size-4" aria-hidden="true" />
          {hasPreview || showSaved ? "Replace cover image" : "Upload cover image"}
        </Button>
        {hasPreview || showSaved || error ? <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={clearSelection}
          className="min-w-0 flex-[1_1_7rem] border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive sm:text-sm">
          <Trash2 className="size-4" aria-hidden="true" />{error && !showSaved && !hasPreview ? "Clear selection" : "Remove cover"}
        </Button> : null}
        {value.operation === "remove" ? <Button type="button" size="sm" variant="outline" disabled={disabled}
          onClick={() => { clearError(); onChange({ operation: "keep", file: null }); }}>
          <RotateCcw className="size-4" aria-hidden="true" />Undo removal
        </Button> : null}
      </div>
    </div>
    <p id={`${id}-help`} className="text-xs leading-relaxed text-muted-foreground">JPEG, PNG or WebP · up to 2 MiB and 20 megapixels. Images are resized and metadata is removed.</p>
    {value.operation === "remove" ? <p className="text-sm text-muted-foreground" role="status">The cover will be removed when you save. Movie posters will return as the fallback.</p>
      : hasPreview ? <p className="text-xs text-muted-foreground" role="status">New cover selected. {listId ? "Save changes" : "Create the list"} to upload it.</p> : null}
    {error ? <p id={`${id}-error`} className="text-sm text-destructive" role="alert">{error}</p> : null}
  </section>;
}
