"use client";

import { useActionState, useEffect, useRef } from "react";
import { ListPlus } from "lucide-react";
import { useRouter } from "next/navigation";

import { createListAction } from "@/app/(app)/actions/lists";
import { Button } from "@/components/ui/button";
import { initialListActionState } from "@/lib/lists/types";

import { ListFormFields } from "./list-form-fields";

export function CreateListDialog({
  idPrefix = "create-list",
  defaultOpen = false,
  triggerLabel = "Create List",
}: {
  idPrefix?: string;
  defaultOpen?: boolean;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [state, action, isPending] = useActionState(
    createListAction,
    initialListActionState,
  );
  const titleId = `${idPrefix}-title`;
  const descriptionId = `${idPrefix}-dialog-description`;

  useEffect(() => {
    if (defaultOpen && !dialogRef.current?.open) {
      dialogRef.current?.showModal();
    }
  }, [defaultOpen]);

  function closeDialog() {
    dialogRef.current?.close();
  }

  function handleClose() {
    triggerRef.current?.focus();
    if (defaultOpen) {
      router.replace("/lists");
    }
  }

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-label="Create a custom movie list"
      >
        <ListPlus className="size-4" aria-hidden="true" />
        {triggerLabel}
      </Button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClose={handleClose}
        className="w-[min(34rem,calc(100%-2rem))] rounded-xl border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/60"
      >
        <form action={action} className="space-y-5 p-5 sm:p-6">
          <div>
            <h2 id={titleId} className="text-xl font-semibold">
              Create a custom list
            </h2>
            <p
              id={descriptionId}
              className="mt-2 text-sm text-muted-foreground"
            >
              Give your private collection a clear name and an optional
              description.
            </p>
          </div>

          <ListFormFields
            idPrefix={idPrefix}
            fieldErrors={state.fieldErrors}
          />

          {state.message ? (
            <p className="text-sm text-destructive" role="alert">
              {state.message}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={closeDialog}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Create List"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
