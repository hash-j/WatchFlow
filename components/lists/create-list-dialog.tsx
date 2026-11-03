"use client";

import { useEffect, useRef, useState } from "react";
import { ListPlus } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";

import { ListDetailsForm } from "./list-details-form";

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
  const [formVersion, setFormVersion] = useState(0);
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
    setFormVersion(value => value + 1);
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

      <ResponsiveDialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClose={handleClose}
        className="max-w-xl"
      >
        <ListDetailsForm key={formVersion} idPrefix={idPrefix} onCancel={closeDialog} />
      </ResponsiveDialog>
    </>
  );
}
