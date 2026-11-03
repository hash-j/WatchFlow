"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { updateArtworkAction } from "@/app/(app)/actions/artwork";
import { ARTWORK_TYPES, MAX_ARTWORK_BYTES, type ArtworkTarget } from "@/lib/artwork/paths";
import type { ArtworkResult } from "@/lib/artwork/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ArtworkEditor({ target, hasImage }: { target: ArtworkTarget; hasImage: boolean }) {
  const [fileError, setFileError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (previous: ArtworkResult, data: FormData) => {
    const result = await updateArtworkAction(previous, data);
    if (result.status === "success") { form.current?.reset(); setPreview(null); setFileError(""); }
    return result;
  }, { status: "idle", message: "" } as ArtworkResult);
  const inputId = target.kind === "avatar" ? "avatar-image" : `list-image-${target.listId}`;
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  return <form ref={form} action={action} className="space-y-3" aria-busy={pending}>
    <input type="hidden" name="kind" value={target.kind} />
    {target.kind === "list" && <input type="hidden" name="listId" value={target.listId} />}
    <Label htmlFor={inputId}>{target.kind === "avatar" ? "Profile picture" : "List thumbnail"}</Label>
    <Input id={inputId} name="image" type="file" accept={ARTWORK_TYPES.join(",")} disabled={pending}
      aria-describedby={`${inputId}-help`} onChange={event => {
        const file = event.currentTarget.files?.[0]; setFileError(""); setPreview(null);
        if (!file) return;
        if (!(ARTWORK_TYPES as readonly string[]).includes(file.type) || file.size > MAX_ARTWORK_BYTES || !file.size) {
          setFileError("Choose a JPEG, PNG or WebP image no larger than 2 MiB."); event.currentTarget.value = ""; return;
        }
        setPreview(URL.createObjectURL(file));
      }} />
    <p id={`${inputId}-help`} className="text-xs text-muted-foreground">JPEG, PNG or WebP; up to 2 MiB and 20 megapixels. Images are resized and metadata is removed.</p>
    {preview && <div className="size-24 overflow-hidden rounded-lg border">
      {/* Local object URL only; never persisted or sent as an object path. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview} alt="Selected image preview" className="size-full object-cover" />
    </div>}
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button type="submit" name="operation" value="upload" disabled={pending || !!fileError || !preview}>{pending ? "Saving…" : hasImage ? "Change image" : "Upload image"}</Button>
      {hasImage && <Button type="submit" name="operation" value="remove" variant="outline" disabled={pending}>Remove image</Button>}
    </div>
    {(fileError || state.message) && <p className={fileError || state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
      role={fileError || state.status === "error" ? "alert" : "status"}>{fileError || state.message}</p>}
  </form>;
}
