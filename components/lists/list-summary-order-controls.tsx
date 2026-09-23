"use client";

import { useActionState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { moveCustomListAction } from "@/app/(app)/actions/lists";
import { Button } from "@/components/ui/button";
import { initialListActionState } from "@/lib/lists/types";

export function ListSummaryOrderControls({
  listId,
  listName,
  isFirst,
  isLast,
}: {
  listId: string;
  listName: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [state, action, isPending] = useActionState(
    moveCustomListAction,
    initialListActionState,
  );

  return (
    <form action={action} className="grid grid-cols-2 gap-2">
      <input type="hidden" name="listId" value={listId} />
      <Button
        type="submit"
        name="direction"
        value="up"
        size="sm"
        variant="outline"
        disabled={isPending || isFirst}
        aria-label={
          isFirst
            ? `${listName} is already first in your lists`
            : `Move ${listName} earlier in your lists`
        }
      >
        <ArrowUp className="size-4" aria-hidden="true" />
        Earlier
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
            ? `${listName} is already last in your lists`
            : `Move ${listName} later in your lists`
        }
      >
        <ArrowDown className="size-4" aria-hidden="true" />
        Later
      </Button>
      {state.message ? (
        <p
          className={`col-span-2 text-xs ${
            state.status === "error" ? "text-destructive" : "sr-only"
          }`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
