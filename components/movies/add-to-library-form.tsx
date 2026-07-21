"use client";

import { useActionState } from "react";
import { Check, Plus } from "lucide-react";

import { addMovieAction } from "@/app/(app)/actions/library";
import { Button } from "@/components/ui/button";
import { initialLibraryActionState } from "@/lib/library/action-state";

export function AddToLibraryForm({ tmdbId }: { tmdbId: number }) {
  const [state, action, isPending] = useActionState(
    addMovieAction,
    initialLibraryActionState,
  );

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
            ? "In your library"
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
