"use client";

import Link from "next/link";
import { ListPlus } from "lucide-react";
import { useActionState } from "react";

import { bulkUpdateStatusAction } from "@/app/(app)/actions/library";
import { Button, buttonVariants } from "@/components/ui/button";
import { initialBulkLibraryActionState } from "@/lib/library/action-state";
import type { LibraryMovieStatus } from "@/lib/movies/types";
import { cn } from "@/lib/utils";

type WatchNextActionProps = {
  userMovieId: string;
  movieTitle: string;
  status: LibraryMovieStatus;
};

export function WatchNextAction({
  userMovieId,
  movieTitle,
  status,
}: WatchNextActionProps) {
  const [state, action, isPending] = useActionState(
    bulkUpdateStatusAction,
    initialBulkLibraryActionState,
  );
  const isQueued = status === "watch_next" || state.status === "success";

  if (isQueued) {
    return (
      <Link
        href="/watch-next"
        className={buttonVariants({
          variant: "secondary",
          size: "sm",
          className: "min-h-11",
        })}
      >
        <ListPlus aria-hidden="true" />
        In Watch Next
      </Link>
    );
  }

  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="libraryIds" value={userMovieId} />
      <input type="hidden" name="status" value="watch_next" />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={isPending}
        aria-label={`Add ${movieTitle} to Watch Next`}
        className="min-h-11"
      >
        <ListPlus aria-hidden="true" />
        {isPending ? "Adding..." : "Add to Watch Next"}
      </Button>
      {state.message ? (
        <p
          className={cn(
            "max-w-xs text-xs",
            state.status === "error"
              ? "text-destructive"
              : "text-muted-foreground",
          )}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
