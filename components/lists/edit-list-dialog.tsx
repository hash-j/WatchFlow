"use client";

import { useCallback, useRef, useState } from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { CustomList } from "@/lib/lists/types";

import { ListDetailsForm } from "./list-details-form";

export function EditListDialog({
  list,
  compact = false,
}: {
  list: CustomList;
  compact?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const idPrefix = `edit-list-${list.id}`;
  const titleId = `${idPrefix}-title`;
  const descriptionId = `${idPrefix}-dialog-description`;

  const handleSaved = useCallback((message: string) => {
    setAnnouncement(message);
    dialogRef.current?.close();
  }, []);

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
      {announcement ? (
        <p className="text-xs text-muted-foreground" role="status">
          {announcement}
        </p>
      ) : null}

      <ResponsiveDialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClose={() => { setFormVersion(value => value + 1); triggerRef.current?.focus(); }}
        className="max-w-xl"
      >
        <ListDetailsForm key={formVersion} list={list} idPrefix={idPrefix}
          onCancel={() => dialogRef.current?.close()} onSaved={handleSaved} />
      </ResponsiveDialog>
    </>
  );
}
