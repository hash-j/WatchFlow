export const ARTWORK_BUCKET = "watchflow-artwork";
export const MAX_ARTWORK_BYTES = 2 * 1024 * 1024;
export const ARTWORK_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export function artworkFileError(file: Pick<File, "size" | "type">): string | null {
  if (!file.size) return "Choose an image to upload.";
  if (file.size > MAX_ARTWORK_BYTES) return "Choose an image no larger than 2 MiB.";
  if (!(ARTWORK_TYPES as readonly string[]).includes(file.type)) return "Use a JPEG, PNG or WebP image. SVG files are not supported.";
  return null;
}
// The final lookahead also rejects JavaScript $'s trailing-newline exception.
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$(?![\s\S])/;
export type ArtworkTarget = { kind: "avatar" } | { kind: "list"; listId: string };

export function parseArtworkPath(value: unknown) {
  if (typeof value !== "string" || value.length > 200) return null;
  const parts = value.split("/");
  if (!UUID_PATTERN.test(parts[1] ?? "")) return null;
  const file = parts.at(-1);
  if (!file?.endsWith(".webp") || !UUID_PATTERN.test(file.slice(0, -5))) return null;
  if (parts[0] === "avatars" && parts.length === 3) return { kind: "avatar" as const, ownerId: parts[1] };
  if (parts[0] === "list-thumbnails" && parts.length === 4 && UUID_PATTERN.test(parts[2])) {
    return { kind: "list" as const, ownerId: parts[1], listId: parts[2] };
  }
  return null;
}
export function ownsArtworkPath(path: unknown, ownerId: string, target: ArtworkTarget) {
  const parsed = parseArtworkPath(path);
  return !!parsed && parsed.ownerId === ownerId && parsed.kind === target.kind &&
    (target.kind === "avatar" || (parsed.kind === "list" && parsed.listId === target.listId));
}
export function createArtworkPath(ownerId: string, target: ArtworkTarget, version: string) {
  if (!UUID_PATTERN.test(ownerId) || !UUID_PATTERN.test(version) || (target.kind === "list" && !UUID_PATTERN.test(target.listId))) {
    throw new Error("Invalid artwork target.");
  }
  return target.kind === "avatar" ? `avatars/${ownerId}/${version}.webp` : `list-thumbnails/${ownerId}/${target.listId}/${version}.webp`;
}
export function artworkSource(path: unknown) {
  return parseArtworkPath(path) ? `/api/artwork/${path}` : null;
}
export function profileInitials(name: string | null | undefined, email?: string | null) {
  return (name?.trim() || email || "W").split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]?.toUpperCase()).join("");
}
