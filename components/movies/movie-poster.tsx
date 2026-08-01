"use client";

import Image from "next/image";
import { ImageOff } from "lucide-react";
import { useState } from "react";

import { getTmdbImageUrl } from "@/lib/movies/images";

type MoviePosterProps = {
  path: string | null;
  title: string;
  priority?: boolean;
  sizes?: string;
  sourceSize?: "w342" | "w500" | "w780";
};

export function MoviePoster({
  path,
  title,
  priority = false,
  sizes = "(max-width: 640px) 45vw, (max-width: 1280px) 25vw, 220px",
  sourceSize = "w342",
}: MoviePosterProps) {
  const source = getTmdbImageUrl(path, sourceSize);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const showImage = source && failedSource !== source;

  return (
    <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-muted">
      {showImage ? (
        <Image
          src={source}
          alt={`${title} poster`}
          fill
          priority={priority}
          sizes={sizes}
          className="object-cover"
          onError={() => setFailedSource(source)}
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
