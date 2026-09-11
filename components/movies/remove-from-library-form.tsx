"use client";

import { useActionState, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { removeMovieAction } from "@/app/(app)/actions/library";
import { Button } from "@/components/ui/button";
import { initialLibraryActionState } from "@/lib/library/action-state";

type RemoveFromLibraryFormProps = {
  userMovieId: string;
  movieId: string;
  movieTitle: string;
  redirectAfterRemoval?: boolean;
  compact?: boolean;
};

export function RemoveFromLibraryForm({
  userMovieId,
  movieId,
  movieTitle,
  redirectAfterRemoval = false,
  compact = false,
}: RemoveFromLibraryFormProps) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [state, action, isPending] = useActionState(
    removeMovieAction,
    initialLibraryActionState,
  );

  useEffect(() => {
    if (state.status !== "success") {
      return;
    }

    if (redirectAfterRemoval) {
      router.replace(`/library?removed=${encodeURIComponent(movieTitle)}`);
      router.refresh();
      return;
    }

    router.refresh();
  }, [movieTitle, redirectAfterRemoval, router, state.status]);

  if (state.status === "success") {
    return (
      <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300" role="status">
        {state.message}
      </p>
    );
  }

  if (!isConfirming) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label={`Remove ${movieTitle} from your library`}
        className="border-destructive/50 text-destructive hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setIsConfirming(true)}
      >
        <Trash2 className="size-4" aria-hidden="true" />
        {compact ? "Remove" : "Remove from Library"}
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="userMovieId" value={userMovieId} />
      <input type="hidden" name="movieId" value={movieId} />
      <input type="hidden" name="movieTitle" value={movieTitle} />
      <p className="text-xs font-medium">Remove this movie from your library?</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant="destructive" disabled={isPending}>
          {isPending ? "Removing..." : "Yes, remove"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => setIsConfirming(false)}
        >
          Cancel
        </Button>
      </div>
      {state.message && state.status === "error" ? (
        <p className="text-xs text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
