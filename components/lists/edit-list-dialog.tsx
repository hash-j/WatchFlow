"use client";

import { useActionState, useEffect, useRef } from "react";
import { Pencil } from "lucide-react";

import { updateListAction } from "@/app/(app)/actions/lists";
import { Button } from "@/components/ui/button";
import { DialogCloseButton, ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  initialListActionState,
  type CustomList,
} from "@/lib/lists/types";

import { ListFormFields } from "./list-form-fields";

export function EditListDialog({
  list,
  compact = false,
}: {
  list: CustomList;
  compact?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [state, action, isPending] = useActionState(
    updateListAction,
    initialListActionState,
  );
  const idPrefix = `edit-list-${list.id}`;
  const titleId = `${idPrefix}-title`;
  const descriptionId = `${idPrefix}-dialog-description`;

  useEffect(() => {
    if (state.requestId > 0 && state.status === "success") {
      dialogRef.current?.close();
    }
  }, [state.requestId, state.status]);

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        size={compact ? "sm" : "default"}
        variant="outline"
        onClick={() => dialogRef.current?.showModal()}
        aria-label={`Edit ${list.name}`}
      >
        <Pencil className="size-4" aria-hidden="true" />
        Edit
      </Button>
      {state.status === "success" && state.message ? (
        <p className="sr-only" role="status">
          {state.message}
        </p>
      ) : null}

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
              Edit list
            </h2>
            <p
              id={descriptionId}
              className="mt-2 text-sm text-muted-foreground"
            >
              Renaming this list does not change its movies or saved order.
            </p>
          </div>

          <ListFormFields
            idPrefix={idPrefix}
            name={list.name}
            description={list.description ?? ""}
            fieldErrors={state.fieldErrors}
          />

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
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </ResponsiveDialog>
    </>
  );
}
