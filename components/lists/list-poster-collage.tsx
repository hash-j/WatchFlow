import Image from "next/image";
import { Images } from "lucide-react";

import { getTmdbImageUrl } from "@/lib/movies/images";
import { cn } from "@/lib/utils";

export function ListPosterCollage({
  posterPaths,
  listName,
}: {
  posterPaths: string[];
  listName: string;
}) {
  const sources = posterPaths
    .map((path) => getTmdbImageUrl(path, "w342"))
    .filter((source): source is string => Boolean(source))
    .slice(0, 4);

  if (sources.length === 0) {
    return (
      <div
        className="grid aspect-[16/9] place-items-center rounded-lg bg-muted text-center text-muted-foreground"
        aria-label={`${listName} has no movie posters yet`}
      >
        <div>
          <Images className="mx-auto size-8" aria-hidden="true" />
          <p className="mt-2 text-xs font-medium">No movies yet</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid aspect-[16/9] overflow-hidden rounded-lg bg-muted",
        sources.length === 1 ? "grid-cols-1" : "grid-cols-2",
        sources.length > 2 && "grid-rows-2",
      )}
      aria-label={`${listName} poster preview`}
    >
      {sources.map((source, index) => (
        <div
          key={`${source}-${index}`}
          className={cn(
            "relative min-h-0",
            sources.length === 3 && index === 0 && "row-span-2",
          )}
          aria-hidden="true"
        >
          <Image
            src={source}
            alt=""
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 220px"
            className="object-cover"
          />
        </div>
      ))}
    </div>
  );
}
