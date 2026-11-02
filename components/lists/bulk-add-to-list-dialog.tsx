"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { ListPlus } from "lucide-react";
import { addMoviesToListAction, getBulkListChoicesAction } from "@/app/(app)/actions/lists";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DialogBody, DialogCloseButton, DialogFooter, DialogHeader, ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { BulkLibraryActionState } from "@/lib/library/action-state";
import { initialListActionState } from "@/lib/lists/types";

export function BulkAddToListDialog({ selectedIds, onResult }: {
  selectedIds: string[]; onResult: (state: BulkLibraryActionState) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const submittedListName = useRef("");
  const [choices, setChoices] = useState<{ id: string; name: string }[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [state, action, pending] = useActionState(addMoviesToListAction, initialListActionState);
  useEffect(() => {
    if (!state.requestId) return;
    onResult({ ...state, message: state.status === "success" && submittedListName.current ? `${state.message} List: ${submittedListName.current}.` : state.message, affected: 0, skipped: 0 });
    if (state.status === "success") dialog.current?.close();
  }, [state, onResult]);

  async function open() {
    dialog.current?.showModal(); setLoading(true); setLoadError(null); setChoices([]);
    try {
      const result = await getBulkListChoicesAction(); setChoices(result.lists); setLoadError(result.error);
    } catch { setLoadError("Your lists could not be loaded. Close this dialog and try again."); }
    finally { setLoading(false); }
  }
  return <>
    <Button ref={trigger} type="button" variant="outline" disabled={!selectedIds.length || pending || loading} onClick={open} className="w-full xl:w-auto">
      <ListPlus className="size-4" aria-hidden="true" />Add to list
    </Button>
    <ResponsiveDialog ref={dialog} aria-labelledby="bulk-list-title" aria-describedby="bulk-list-description" onClose={() => trigger.current?.focus()}
      onCancel={event => { if (pending) event.preventDefault(); }} onClick={event => { if (pending) event.preventDefault(); }} className="max-w-lg">
      <form action={action} aria-busy={pending} onSubmit={event => {
        const id = new FormData(event.currentTarget).get("listId");
        submittedListName.current = choices.find(list => list.id === id)?.name ?? "";
      }}>
        <DialogCloseButton onClick={() => { if (!pending) dialog.current?.close(); }} />
        <DialogHeader><h2 id="bulk-list-title" className="text-lg font-semibold">Add {selectedIds.length} selected movies to a list</h2></DialogHeader>
        <DialogBody>
          {selectedIds.map(id => <input key={id} type="hidden" name="userMovieIds" value={id} />)}
          {loading ? <p role="status">Loading your lists…</p> : loadError ? <p role="alert" className="text-sm text-destructive">{loadError}</p> : choices.length ?
            <label className="block space-y-2 text-sm font-medium">Custom list
              <Select name="listId" required disabled={pending} defaultValue="">
                <option value="" disabled>Choose a list</option>
                {choices.map(list => <option key={list.id} value={list.id}>{list.name}</option>)}
              </Select>
            </label> : <p className="text-sm text-muted-foreground">You have no custom lists yet. <Link className="underline" href="/lists">Create a list</Link> first.</p>}
          <p id="bulk-list-description" className="mt-3 text-sm text-muted-foreground">New movies are appended oldest year first. Existing members and manual positions are kept.</p>
          {state.status === "error" && <p role="alert" className="mt-3 text-sm text-destructive">{state.message}</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => dialog.current?.close()}>Cancel</Button>
          <Button type="submit" disabled={pending || loading || !choices.length || !selectedIds.length || !!loadError}>{pending ? "Adding…" : "Add selected movies"}</Button>
        </DialogFooter>
      </form>
    </ResponsiveDialog>
  </>;
}
