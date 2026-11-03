"use server";
import { revalidatePath } from "next/cache";
import { ArtworkError } from "@/lib/artwork/images";
import { mutateArtwork, type ArtworkResult } from "@/lib/artwork/server";
import { UUID_PATTERN, type ArtworkTarget } from "@/lib/artwork/paths";

export async function updateArtworkAction(_previous: ArtworkResult, form: FormData): Promise<ArtworkResult> {
  const kind = form.get("kind"), operation = form.get("operation");
  const listId = form.get("listId");
  if ((kind !== "avatar" && kind !== "list") || (operation !== "upload" && operation !== "remove") ||
    (kind === "list" && (typeof listId !== "string" || !UUID_PATTERN.test(listId)))) {
    return { status: "error", message: "The selected image target was invalid." };
  }
  const target: ArtworkTarget = kind === "avatar" ? { kind } : { kind, listId: listId as string };
  try {
    const result = await mutateArtwork(target, operation, form.get("image"));
    if (kind === "avatar") revalidatePath("/", "layout");
    else { revalidatePath("/lists"); revalidatePath(`/lists/${listId}`); }
    return result;
  } catch (error) {
    // Even ambiguous storage/network failures must refresh potentially committed refs.
    if (kind === "avatar") revalidatePath("/settings/profile");
    return { status: "error", message: error instanceof ArtworkError ? error.message : "The image could not be changed. Please try again." };
  }
}
