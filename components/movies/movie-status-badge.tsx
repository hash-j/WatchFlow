import { cn } from "@/lib/utils";
import { MOVIE_STATUS_VISUALS } from "@/lib/library/status-visuals";
import type { LibraryMovieStatus } from "@/lib/movies/types";

export function MovieStatusBadge({ status }: { status: LibraryMovieStatus }) {
  const visual = MOVIE_STATUS_VISUALS[status];
  const Icon = visual.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        visual.badgeClasses,
      )}
      aria-label={`${visual.label}. ${visual.description}`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {visual.label}
    </span>
  );
}
