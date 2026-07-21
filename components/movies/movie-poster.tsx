import Image from "next/image";
import { ImageOff } from "lucide-react";

import { getTmdbImageUrl } from "@/lib/movies/images";

type MoviePosterProps = {
  path: string | null;
  title: string;
  priority?: boolean;
  sizes?: string;
};

export function MoviePoster({
  path,
  title,
  priority = false,
  sizes = "(max-width: 640px) 45vw, (max-width: 1280px) 25vw, 220px",
}: MoviePosterProps) {
  const source = getTmdbImageUrl(path);

  return (
    <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-muted">
      {source ? (
        <Image
          src={source}
          alt={`${title} poster`}
          fill
          priority={priority}
          sizes={sizes}
          className="object-cover"
        />
      ) : (
        <div className="grid h-full place-items-center p-4 text-center text-muted-foreground">
          <div>
            <ImageOff className="mx-auto size-7" aria-hidden="true" />
            <p className="mt-2 text-xs">Poster unavailable</p>
          </div>
        </div>
      )}
    </div>
  );
}
