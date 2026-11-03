"use client";
import Image from "next/image";
import { useState, type ReactNode } from "react";
import { artworkSource } from "@/lib/artwork/paths";

export function ArtworkImage({ path, alt, fallback, className = "" }: {
  path: string | null | undefined; alt: string; fallback: ReactNode; className?: string;
}) {
  const source = artworkSource(path);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  if (!source || source === failedSource) return <>{fallback}</>;
  // The same-origin private GET needs browser cookies. Do not proxy it through
  // the public Next image optimizer or issue signed URLs on every render.
  return <Image unoptimized src={source} alt={alt} width={1024} height={1024}
    className={`size-full object-cover ${className}`} onError={() => setFailedSource(source)} />;
}
