"use client";

import { useActionState, useEffect, useState } from "react";
import { createListAction, updateListAction } from "@/app/(app)/actions/lists";
import { Button } from "@/components/ui/button";
import { DialogCloseButton } from "@/components/ui/responsive-dialog";
import { initialListActionState, type CustomList } from "@/lib/lists/types";
import { ListCoverField, type ListCoverSelection } from "./list-cover-field";
import { ListFormFields } from "./list-form-fields";

export function ListDetailsForm({ list, idPrefix, onCancel, onSaved }: {
  list?: CustomList; idPrefix: string; onCancel: () => void; onSaved?: (message: string) => void;
}) {
  const [cover, setCover] = useState<ListCoverSelection>({ operation: "keep", file: null });
  const [coverError, setCoverError] = useState<string | null>(null);
  const [name, setName] = useState(list?.name ?? "");
  const [description, setDescription] = useState(list?.description ?? "");
  const [state, action, pending] = useActionState(async (previous: typeof initialListActionState, data: FormData) => {
    data.set("coverOperation", cover.operation);
    // React may reset native file inputs after a server validation response.
    // Keep the selected File in memory so its preview and a retry stay in sync.
    if (cover.operation === "upload" && cover.file) data.set("coverImage", cover.file);
    else data.delete("coverImage");
    return list ? updateListAction(previous, data) : createListAction(previous, data);
  }, initialListActionState);
  useEffect(() => {
    if (state.status === "success" && state.requestId > 0) onSaved?.(state.message);
  }, [state.status, state.requestId, state.message, onSaved]);

  return <form action={action} className="relative space-y-5 p-4 pb-0 sm:p-6 sm:pb-0" aria-busy={pending}>
    <DialogCloseButton onClick={() => { if (!pending) onCancel(); }} />
    {list && <input type="hidden" name="listId" value={list.id} />}
    <div className="pr-10">
      <h2 id={`${idPrefix}-title`} className="text-xl font-semibold">{list ? "Edit list" : "Create a custom list"}</h2>
      <p id={`${idPrefix}-dialog-description`} className="mt-2 text-sm text-muted-foreground">
        {list ? "Update your list details and cover. Movies and saved order stay the same." : "Name your private collection and make it yours with an optional cover."}
      </p>
    </div>
    <fieldset disabled={pending} className="min-w-0 space-y-5">
      <ListFormFields idPrefix={idPrefix} name={name} description={description} fieldErrors={state.fieldErrors}
        onNameChange={setName} onDescriptionChange={setDescription} />
      <ListCoverField idPrefix={idPrefix} listId={list?.id} currentPath={list?.thumbnailPath} value={cover}
        onChange={setCover} onError={setCoverError} disabled={pending} />
    </fieldset>
    {state.message ? <p className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
      role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
    <div className="sticky bottom-0 z-10 -mx-4 flex flex-col-reverse gap-2 border-t bg-surface-elevated/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:flex-row sm:justify-end sm:px-6">
      <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>Cancel</Button>
      <Button type="submit" disabled={pending || !!coverError}>
        {pending ? list ? "Saving…" : "Creating…" : list ? "Save changes" : "Create List"}
      </Button>
    </div>
  </form>;
}
