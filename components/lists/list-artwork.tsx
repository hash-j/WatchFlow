import { ArtworkImage } from "@/components/artwork/artwork-image";
import { parseArtworkPath } from "@/lib/artwork/paths";
import { ListPosterCollage } from "./list-poster-collage";

export function ListArtwork({ path, listId, listName, posterPaths }: {
  path?: string | null; listId: string; listName: string; posterPaths: string[];
}) {
  const parsed = parseArtworkPath(path);
  const safePath = parsed?.kind === "list" && parsed.listId === listId ? path : null;
  const fallback = <ListPosterCollage posterPaths={posterPaths} listName={listName} />;
  return <div className="aspect-[16/9] overflow-hidden rounded-lg bg-muted">
    <ArtworkImage path={safePath} alt={`${listName} custom thumbnail`} fallback={fallback} />
  </div>;
}
