"use client";

import { Star } from "lucide-react";
import { useActionState } from "react";

import { setFavouriteAction } from "@/app/(app)/actions/library";
import { Button } from "@/components/ui/button";
import { initialLibraryActionState } from "@/lib/library/action-state";
import { cn } from "@/lib/utils";

type FavouriteToggleFormProps = {
  libraryId: string;
  movieId: string;
  title: string;
  favourite: boolean;
  compact?: boolean;
};

export function FavouriteToggleForm({
  libraryId,
  movieId,
  title,
  favourite,
  compact = false,
}: FavouriteToggleFormProps) {
  const [state, action, isPending] = useActionState(
    setFavouriteAction,
    initialLibraryActionState,
  );
  const label = favourite
    ? `Remove ${title} from favourites`
    : `Add ${title} to favourites`;

  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="libraryId" value={libraryId} />
      <input type="hidden" name="movieId" value={movieId} />
      <input type="hidden" name="favourite" value={String(!favourite)} />
      <Button
        type="submit"
        size="sm"
        variant={favourite ? "secondary" : "outline"}
        disabled={isPending}
        aria-label={label}
        aria-pressed={favourite}
        className={cn(favourite && "font-semibold")}
      >
        <Star
          className={cn("size-4", favourite && "fill-current")}
          aria-hidden="true"
        />
        {compact
          ? favourite
            ? "Favourite"
            : "Add favourite"
          : isPending
            ? "Saving favourite…"
            : favourite
              ? "Favourite"
              : "Add to favourites"}
      </Button>
      {state.message ? (
        <p
          className={cn(
            "text-xs",
            state.status === "error"
              ? "text-destructive"
              : "sr-only text-muted-foreground",
          )}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

