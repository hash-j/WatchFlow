"use client";

import { useActionState, useEffect, useRef } from "react";
import { ListX } from "lucide-react";
import { useRouter } from "next/navigation";

import { removeMovieFromListAction } from "@/app/(app)/actions/lists";
import { Button } from "@/components/ui/button";
import { DialogCloseButton, ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { initialListActionState } from "@/lib/lists/types";

export function RemoveListMovieDialog({
  listMovieId,
  title,
  listName,
}: {
  listMovieId: string;
  title: string;
  listName: string;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [state, action, isPending] = useActionState(
    removeMovieFromListAction,
    initialListActionState,
  );
  const titleId = `remove-list-movie-${listMovieId}-title`;
  const descriptionId = `remove-list-movie-${listMovieId}-description`;

  useEffect(() => {
    if (state.requestId > 0 && state.status === "success") {
      dialogRef.current?.close();
      router.refresh();
      window.requestAnimationFrame(() => {
        document.getElementById("list-movies-heading")?.focus();
      });
    }
  }, [router, state.requestId, state.status]);

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        size="sm"
        variant="outline"
        className="min-h-11 w-full border-destructive/50 text-destructive hover:border-destructive hover:bg-destructive/10 hover:text-destructive lg:w-auto"
        onClick={() => dialogRef.current?.showModal()}
        aria-label={`Remove ${title} from ${listName}`}
      >
        <ListX className="size-4" aria-hidden="true" />
        Remove
      </Button>

      <ResponsiveDialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClose={() => triggerRef.current?.focus()}
        className="max-w-lg"
      >
        <form action={action} className="relative space-y-5 p-4 pt-16 sm:p-6 sm:pt-16">
          <DialogCloseButton onClick={() => dialogRef.current?.close()} />
          <input type="hidden" name="listMovieId" value={listMovieId} />
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              Remove “{title}” from this list?
            </h2>
            <p
              id={descriptionId}
              className="mt-2 text-sm text-muted-foreground"
            >
              This removes only the membership in “{listName}”. The movie,
              rating, review, status, queue position, and schedule remain in
              your personal library.
            </p>
          </div>

          {state.status === "error" && state.message ? (
            <p className="text-sm text-destructive" role="alert">
              {state.message}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? "Removing..." : "Remove from list"}
            </Button>
          </div>
        </form>
      </ResponsiveDialog>
    </>
  );
}
