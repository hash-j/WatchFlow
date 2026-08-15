"use client";

import { useActionState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { moveListItemAction } from "@/app/(app)/actions/lists";
import { Button } from "@/components/ui/button";
import { initialListActionState } from "@/lib/lists/types";

export function ListOrderControls({
  listMovieId,
  title,
  isFirst,
  isLast,
}: {
  listMovieId: string;
  title: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [state, action, isPending] = useActionState(
    moveListItemAction,
    initialListActionState,
  );

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="listMovieId" value={listMovieId} />
      <Button
        type="submit"
        name="direction"
        value="up"
        size="sm"
        variant="outline"
        className="min-h-11"
        disabled={isPending || isFirst}
        aria-label={
          isFirst
            ? `${title} is already first in this list`
            : `Move ${title} up in this list`
        }
        title={isFirst ? "This movie is already first." : undefined}
      >
        <ArrowUp className="size-4" aria-hidden="true" />
        Up
      </Button>
      <Button
        type="submit"
        name="direction"
        value="down"
        size="sm"
        variant="outline"
        className="min-h-11"
        disabled={isPending || isLast}
        aria-label={
          isLast
            ? `${title} is already last in this list`
            : `Move ${title} down in this list`
        }
        title={isLast ? "This movie is already last." : undefined}
      >
        <ArrowDown className="size-4" aria-hidden="true" />
        Down
      </Button>
      {state.message ? (
        <p
          className={
            state.status === "error"
              ? "basis-full text-xs text-destructive"
              : "sr-only"
          }
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
