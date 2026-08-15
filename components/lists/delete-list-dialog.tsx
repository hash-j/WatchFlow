"use client";

import { useActionState, useRef } from "react";
import { Trash2 } from "lucide-react";

import { deleteListAction } from "@/app/(app)/actions/lists";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogCloseButton, ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  initialListActionState,
  type CustomList,
} from "@/lib/lists/types";

export function DeleteListDialog({
  list,
  movieCount,
  compact = false,
}: {
  list: CustomList;
  movieCount: number;
  compact?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [state, action, isPending] = useActionState(
    deleteListAction,
    initialListActionState,
  );
  const idPrefix = `delete-list-${list.id}`;
  const titleId = `${idPrefix}-title`;
  const descriptionId = `${idPrefix}-description`;
  const confirmationId = `${idPrefix}-confirmation`;
  const confirmationError = state.fieldErrors.confirmation?.[0];
  const confirmationErrorId = `${confirmationId}-error`;

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        size={compact ? "sm" : "default"}
        variant="destructive"
        onClick={() => dialogRef.current?.showModal()}
        aria-label={`Delete ${list.name}`}
      >
        <Trash2 className="size-4" aria-hidden="true" />
        Delete
      </Button>

      <ResponsiveDialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClose={() => triggerRef.current?.focus()}
        className="max-w-xl"
      >
        <form action={action} className="relative space-y-5 p-4 pt-16 sm:p-6 sm:pt-16">
          <DialogCloseButton onClick={() => dialogRef.current?.close()} />
          <input type="hidden" name="listId" value={list.id} />
          <div>
            <h2 id={titleId} className="text-xl font-semibold">
              Delete “{list.name}”?
            </h2>
            <div
              id={descriptionId}
              className="mt-2 space-y-2 text-sm text-muted-foreground"
            >
              <p>
                This removes the list and its {movieCount}{" "}
                {movieCount === 1 ? "membership" : "memberships"}.
              </p>
              <p className="font-medium text-foreground">
                Deleting this list will not remove movies from your library.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={confirmationId}>
              Type <span className="font-semibold">{list.name}</span> to
              confirm
            </Label>
            <Input
              id={confirmationId}
              name="confirmation"
              required
              autoComplete="off"
              aria-invalid={Boolean(confirmationError)}
              aria-describedby={
                confirmationError ? confirmationErrorId : descriptionId
              }
            />
            {confirmationError ? (
              <p
                id={confirmationErrorId}
                className="text-xs text-destructive"
                role="alert"
              >
                {confirmationError}
              </p>
            ) : null}
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
              {isPending ? "Deleting..." : "Delete List"}
            </Button>
          </div>
        </form>
      </ResponsiveDialog>
    </>
  );
}
