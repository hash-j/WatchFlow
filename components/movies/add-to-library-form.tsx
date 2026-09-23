"use client";

import { useActionState } from "react";
import { Check, Plus } from "lucide-react";

import { addMovieAction } from "@/app/(app)/actions/library";
import { Button } from "@/components/ui/button";
import { initialLibraryActionState } from "@/lib/library/action-state";

export function AddToLibraryForm({
  tmdbId,
  alreadyInLibrary = false,
}: {
  tmdbId: number;
  alreadyInLibrary?: boolean;
}) {
  const [state, action, isPending] = useActionState(
    addMovieAction,
    initialLibraryActionState,
  );

  if (alreadyInLibrary) {
    return (
      <div className="mt-auto pt-4">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled
          aria-describedby={`library-membership-${tmdbId}`}
          className="w-full"
        >
          <Check className="mr-2 size-4" aria-hidden="true" />
          Already in your Library
        </Button>
        <p
          id={`library-membership-${tmdbId}`}
          className="mt-2 text-xs text-muted-foreground"
          role="status"
        >
          This movie is already in your private Library.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-auto pt-4">
      <input type="hidden" name="tmdbId" value={tmdbId} />
      <Button
        type="submit"
        size="sm"
        variant={state.status === "success" ? "outline" : "default"}
        disabled={isPending || state.status === "success"}
        className="w-full"
      >
        {state.status === "success" ? (
          <Check className="mr-2 size-4" aria-hidden="true" />
        ) : (
          <Plus className="mr-2 size-4" aria-hidden="true" />
        )}
        {isPending
          ? "Adding..."
          : state.status === "success"
            ? "Already in your Library"
            : "Add to Library"}
      </Button>
      {state.message ? (
        <p
          className={`mt-2 text-xs ${
            state.status === "error" ? "text-destructive" : "text-muted-foreground"
          }`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
