import { Star } from "lucide-react";

export function MovieRating({ rating }: { rating: number | null }) {
  if (rating === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
        <Star className="size-3.5" aria-hidden="true" />
        Not rated
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-rating bg-rating px-2.5 py-1 text-xs font-semibold tabular-nums text-rating-foreground shadow-sm"
      aria-label={`Public movie rating: ${rating.toFixed(1)} out of 10`}
    >
      <Star className="size-3.5 fill-current" aria-hidden="true" />
      {rating.toFixed(1)} / 10
    </span>
  );
}
