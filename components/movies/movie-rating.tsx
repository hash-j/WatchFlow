import { Star } from "lucide-react";

export function MovieRating({ rating }: { rating: number | null }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
      <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden="true" />
      {rating === null ? "Not rated" : `${rating.toFixed(1)} / 10`}
    </span>
  );
}
