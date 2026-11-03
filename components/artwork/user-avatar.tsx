import { ownsArtworkPath, profileInitials } from "@/lib/artwork/paths";
import { cn } from "@/lib/utils";
import { ArtworkImage } from "./artwork-image";

export function UserAvatar({ ownerId, path, name, email, className }: {
  ownerId?: string; path?: string | null; name?: string | null; email?: string | null; className?: string;
}) {
  const safePath = ownerId && ownsArtworkPath(path, ownerId, { kind: "avatar" }) ? path : null;
  return <div className={cn("grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border bg-muted font-semibold text-foreground", className)} aria-label="Profile photo or initials">
    <ArtworkImage path={safePath} alt="Your profile photo" fallback={<span>{profileInitials(name, email)}</span>} />
  </div>;
}
