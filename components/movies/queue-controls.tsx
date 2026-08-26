"use client";

import { useActionState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { moveQueueMovieAction } from "@/app/(app)/actions/management";
import { Button } from "@/components/ui/button";
import { initialLibraryActionState } from "@/lib/library/action-state";

type QueueControlsProps = {
  libraryId: string;
  isFirst: boolean;
  isLast: boolean;
};

export function QueueControls({
  libraryId,
  isFirst,
  isLast,
}: QueueControlsProps) {
  const [state, action, isPending] = useActionState(
    moveQueueMovieAction,
    initialLibraryActionState,
  );

  return (
    <form action={action} className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
      <input type="hidden" name="libraryId" value={libraryId} />
      <Button
        type="submit"
        name="direction"
        value="up"
        size="sm"
        variant="outline"
        disabled={isPending || isFirst}
        aria-label={
          isFirst
            ? "Move movie earlier in the queue (already first)"
            : "Move movie earlier in the queue"
        }
        title={isFirst ? "This movie is already first in the queue." : "Move earlier in Watch Next"}
        className="w-full sm:w-auto"
      >
        <ArrowUp className="size-4" aria-hidden="true" />
        Move earlier
      </Button>
      <Button
        type="submit"
        name="direction"
        value="down"
        size="sm"
        variant="outline"
        disabled={isPending || isLast}
        aria-label={
          isLast
            ? "Move movie later in the queue (already last)"
            : "Move movie later in the queue"
        }
        title={isLast ? "This movie is already last in the queue." : "Move later in Watch Next"}
        className="w-full sm:w-auto"
      >
        <ArrowDown className="size-4" aria-hidden="true" />
        Move later
      </Button>
      {state.message ? (
        <span
          className={
            state.status === "error"
              ? "col-span-2 break-words text-xs text-destructive sm:col-span-1"
              : "sr-only"
          }
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
