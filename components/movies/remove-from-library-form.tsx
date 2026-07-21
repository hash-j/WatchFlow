"use client";

import { useActionState, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { removeMovieAction } from "@/app/(app)/actions/library";
import { Button } from "@/components/ui/button";
import { initialLibraryActionState } from "@/lib/library/action-state";

type RemoveFromLibraryFormProps = {
  libraryId: string;
  redirectAfterRemoval?: boolean;
};

export function RemoveFromLibraryForm({
  libraryId,
  redirectAfterRemoval = false,
}: RemoveFromLibraryFormProps) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [state, action, isPending] = useActionState(
    removeMovieAction,
    initialLibraryActionState,
  );

  useEffect(() => {
    if (state.status === "success" && redirectAfterRemoval) {
      router.replace("/library");
      router.refresh();
    }
  }, [redirectAfterRemoval, router, state.status]);

  if (!isConfirming) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setIsConfirming(true)}
      >
        <Trash2 className="mr-2 size-4" aria-hidden="true" />
        Remove
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="libraryId" value={libraryId} />
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
