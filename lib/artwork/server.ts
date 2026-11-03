import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ArtworkError, normalizeArtwork } from "./images";
import { ARTWORK_BUCKET, createArtworkPath, ownsArtworkPath, parseArtworkPath, UUID_PATTERN, type ArtworkTarget } from "./paths";

export type ArtworkResult = { status: "idle" | "success" | "error"; message: string };
export async function deleteAccountArtwork(client: SupabaseClient, verifiedUserId: string) {
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || user?.id !== verifiedUserId) throw new ArtworkError("Sign in again before deleting this account.");
  for (let batch = 0; batch < 20; batch++) {
    const { data, error } = await client.rpc("watchflow_owned_artwork_paths");
    // Before this atomic migration is installed, no artwork bucket/RPC exists.
    if (error && ["PGRST202", "42883"].includes(error.code)) return;
    if (error || !Array.isArray(data) || data.length > 500 || data.some(path => parseArtworkPath(path)?.ownerId !== verifiedUserId)) {
      throw new ArtworkError("Your stored images could not be checked. Your account remains active.");
    }
    if (!data.length) return;
    const removed = await client.storage.from(ARTWORK_BUCKET).remove(data);
    if (removed.error) throw new ArtworkError("Your stored images could not be removed. Your account remains active; please retry.");
  }
  throw new ArtworkError("Some stored images were removed. Please retry account deletion to finish cleanup.");
}
export async function mutateArtwork(target: ArtworkTarget, operation: "upload" | "remove", file?: unknown): Promise<ArtworkResult> {
  if (target.kind === "list" && !UUID_PATTERN.test(target.listId)) throw new ArtworkError("This list is no longer available.");
  const client = await createClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new ArtworkError("Sign in again to change this image.");
  const table = target.kind === "avatar" ? "profiles" : "lists";
  const column = target.kind === "avatar" ? "avatar_url" : "thumbnail_path";
  const id = target.kind === "avatar" ? user.id : target.listId;
  const owned = () => {
    const query = client.from(table).select(`id, ${column}`).eq("id", id);
    return target.kind === "list" ? query.eq("user_id", user.id) : query;
  };
  const { data: row, error: readError } = await owned().maybeSingle();
  if (readError) throw new ArtworkError("Image storage is not ready. Check that the artwork migration is installed, then try again.");
  if (!row) throw new ArtworkError(target.kind === "list" ? "This list is no longer available." : "Your profile could not be loaded.");
  const oldPath = (row as unknown as Record<string, unknown>)[column];
  if (oldPath !== null && typeof oldPath !== "string") throw new ArtworkError("The image reference could not be read.");
  if (operation === "remove" && oldPath === null) return { status: "success", message: "No custom image is set." };
  let path: string | null = null;
  const storage = client.storage.from(ARTWORK_BUCKET);
  if (operation === "upload") {
    const bytes = await normalizeArtwork(file);
    path = createArtworkPath(user.id, target, randomUUID());
    const { error } = await storage.upload(path, bytes, { contentType: "image/webp", upsert: false, cacheControl: "60" });
    if (error) throw new ArtworkError("The image could not be uploaded. Please try again.");
  }
  let update = client.from(table).update({ [column]: path }).eq("id", id);
  if (target.kind === "list") update = update.eq("user_id", user.id);
  // Serialize conflicting UI updates without overwriting a newer reference.
  update = oldPath === null ? update.is(column, null) : update.eq(column, oldPath);
  const { data: saved, error: saveError } = await update.select("id").maybeSingle();
  // A network error may follow a committed update: never delete the new object
  // on an ambiguous write result. It is private; the previous file stays intact.
  if (saveError) throw new ArtworkError("The image change could not be confirmed. Refresh before trying again.");
  if (!saved) {
    if (path) await storage.remove([path]).catch(() => undefined);
    throw new ArtworkError("This image changed in another tab. Refresh and try again.");
  }
  const message = operation === "upload" ? "Image saved." : "Custom image removed. The default image is restored.";
  if (ownsArtworkPath(oldPath, user.id, target)) {
    try {
      const { error } = await storage.remove([oldPath as string]);
      if (error) return { status: "success", message: `${message} Previous stored-file cleanup failed.` };
    } catch { return { status: "success", message: `${message} Previous stored-file cleanup failed.` }; }
  }
  return { status: "success", message };
}
