"use client";

import {
  createContext,
  type ReactNode,
  useActionState,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CheckSquare2, ListChecks, Trash2, X } from "lucide-react";

import {
  bulkRemoveMoviesAction,
  bulkUpdateStatusAction,
} from "@/app/(app)/actions/library";
import { Button } from "@/components/ui/button";
import {
  DialogBody,
  DialogCloseButton,
  DialogFooter,
  DialogHeader,
  ResponsiveDialog,
} from "@/components/ui/responsive-dialog";
import { MobileToolbar } from "@/components/ui/responsive-layout";
import {
  initialBulkLibraryActionState,
  type BulkLibraryActionState,
} from "@/lib/library/action-state";
import {
  BULK_LIBRARY_STATUSES,
  type BulkLibraryStatus,
} from "@/lib/library/mutations";
import {
  getPageSelectionState,
  orderedSelectedLibraryIds,
  selectVisibleLibraryIds,
  toggleLibrarySelection,
} from "@/lib/library/selection";
import { LIBRARY_MOVIE_STATUS_LABELS } from "@/lib/movies/types";

type VisibleLibraryItem = {
  libraryId: string;
  title: string;
};

type SelectionContextValue = {
  isSelecting: boolean;
  selectedIds: ReadonlySet<string>;
  toggle: (libraryId: string) => void;
};

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function useLibrarySelection() {
  const context = useContext(SelectionContext);
  if (!context) {
    throw new Error("Library selection controls require a selection workspace.");
  }

  return context;
}

export function LibrarySelectionCheckbox({
  libraryId,
  title,
}: VisibleLibraryItem) {
  const { isSelecting, selectedIds, toggle } = useLibrarySelection();

  if (!isSelecting) {
    return null;
  }

  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium focus-within:ring-2 focus-within:ring-ring">
      <input
        type="checkbox"
        checked={selectedIds.has(libraryId)}
        onChange={() => toggle(libraryId)}
        className="size-4 rounded border-input accent-foreground"
        aria-label={`Select ${title}`}
      />
      Select
    </label>
  );
}

type ConfirmationDialogProps = {
  triggerLabel: string;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  state: BulkLibraryActionState;
  isPending: boolean;
  action: (payload: FormData) => void;
  selectedIds: string[];
  status?: BulkLibraryStatus;
};

function ConfirmationDialog({
  triggerLabel,
  title,
  description,
  confirmLabel,
  destructive = false,
  state,
  isPending,
  action,
  selectedIds,
  status,
}: ConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = `${destructive ? "remove" : "status"}-dialog-title`;
  const descriptionId = `${destructive ? "remove" : "status"}-dialog-description`;

  function closeDialog() {
    dialogRef.current?.close();
  }

  useEffect(() => {
    if (state.requestId > 0 && state.status === "success") {
      closeDialog();
    }
  }, [state.requestId, state.status]);

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant={destructive ? "destructive" : "default"}
        onClick={() => dialogRef.current?.showModal()}
      >
        {destructive ? (
          <Trash2 className="size-4" aria-hidden="true" />
        ) : (
          <ListChecks className="size-4" aria-hidden="true" />
        )}
        {triggerLabel}
      </Button>
      <ResponsiveDialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClose={() => triggerRef.current?.focus()}
        className="max-w-lg"
      >
        <form action={action} className="relative">
          <DialogCloseButton onClick={closeDialog} />
          {selectedIds.map((libraryId) => (
            <input
              key={libraryId}
              type="hidden"
              name="libraryIds"
              value={libraryId}
            />
          ))}
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <DialogHeader>
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <div
              id={descriptionId}
              className="mt-2 space-y-2 text-sm text-muted-foreground"
            >
              {description}
            </div>
          </DialogHeader>
          <DialogBody>
            {state.status === "error" && state.message ? (
              <p className="text-sm text-destructive" role="alert">
                {state.message}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={closeDialog}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={isPending}
            >
              {isPending ? "Working…" : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </ResponsiveDialog>
    </>
  );
}

function statusConsequence(status: BulkLibraryStatus) {
  if (status === "watch_next") {
    return "New Watch Next movies will be appended in the order shown. Existing queue positions remain ahead of them.";
  }

  if (status === "watched") {
    return "This changes status only. WatchFlow will not invent or replace a watched date.";
  }

  return "Movies leaving Watch Next will be removed from the queue, and remaining queue positions will be compacted.";
}

function BulkActions({
  selectedIds,
  onResult,
}: {
  selectedIds: string[];
  onResult: (state: BulkLibraryActionState) => void;
}) {
  const [targetStatus, setTargetStatus] =
    useState<BulkLibraryStatus>("want_to_watch");
  const [statusState, statusAction, statusPending] = useActionState(
    bulkUpdateStatusAction,
    initialBulkLibraryActionState,
  );
  const [removeState, removeAction, removePending] = useActionState(
    bulkRemoveMoviesAction,
    initialBulkLibraryActionState,
  );

  useEffect(() => {
    if (statusState.requestId > 0) {
      onResult(statusState);
    }
  }, [onResult, statusState]);

  useEffect(() => {
    if (removeState.requestId > 0) {
      onResult(removeState);
    }
  }, [onResult, removeState]);

  return (
    <MobileToolbar className="grid gap-3 sm:rounded-lg sm:border sm:bg-muted/30 sm:p-3 lg:grid-cols-[minmax(12rem,1fr)_auto_auto] lg:items-end">
      <label className="space-y-1 text-sm font-medium">
        Change status
        <select
          value={targetStatus}
          onChange={(event) =>
            setTargetStatus(event.target.value as BulkLibraryStatus)
          }
          className="flex min-h-11 min-w-0 w-full max-w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {BULK_LIBRARY_STATUSES.map((status) => (
            <option key={status} value={status}>
              {LIBRARY_MOVIE_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <span className="block text-xs font-normal text-muted-foreground">
          Scheduled is unavailable in bulk because every schedule needs a date
          and time.
        </span>
      </label>
      <ConfirmationDialog
        triggerLabel="Review status change"
        title={`Change status for ${selectedIds.length} ${
          selectedIds.length === 1 ? "movie" : "movies"
        }?`}
        description={<p>{statusConsequence(targetStatus)}</p>}
        confirmLabel="Change status"
        state={statusState}
        isPending={statusPending}
        action={statusAction}
        selectedIds={selectedIds}
        status={targetStatus}
      />
      <ConfirmationDialog
        triggerLabel="Remove from library"
        title={`Remove ${selectedIds.length} ${
          selectedIds.length === 1 ? "movie" : "movies"
        } from your library?`}
        description={
          <>
            <p>
              Personal ratings, reviews, queue positions, and schedules for
              these selections will be removed.
            </p>
            <p>The movie can still appear in Search for other WatchFlow members.</p>
          </>
        }
        confirmLabel="Remove selected movies"
        destructive
        state={removeState}
        isPending={removePending}
        action={removeAction}
        selectedIds={selectedIds}
      />
    </MobileToolbar>
  );
}

export function LibrarySelectionWorkspace({
  items,
  scopeKey,
  children,
}: {
  items: VisibleLibraryItem[];
  scopeKey: string;
  children: ReactNode;
}) {
  return (
    <LibrarySelectionWorkspaceState key={scopeKey} items={items}>
      {children}
    </LibrarySelectionWorkspaceState>
  );
}

function LibrarySelectionWorkspaceState({
  items,
  children,
}: {
  items: VisibleLibraryItem[];
  children: ReactNode;
}) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<BulkLibraryActionState | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const visibleIds = useMemo(
    () => items.map((item) => item.libraryId),
    [items],
  );

  const orderedSelectedIds = useMemo(
    () => orderedSelectedLibraryIds(visibleIds, selectedIds),
    [selectedIds, visibleIds],
  );
  const pageSelection = getPageSelectionState(visibleIds, selectedIds);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = pageSelection.indeterminate;
    }
  }, [pageSelection.indeterminate]);

  const context = useMemo<SelectionContextValue>(
    () => ({
      isSelecting,
      selectedIds,
      toggle(libraryId) {
        setSelectedIds((current) =>
          toggleLibrarySelection(current, libraryId),
        );
      },
    }),
    [isSelecting, selectedIds],
  );

  const handleResult = useCallback((state: BulkLibraryActionState) => {
    setFeedback(state);
    if (state.status === "success") {
      setSelectedIds(new Set());
      setIsSelecting(false);
    }
  }, []);

  return (
    <SelectionContext.Provider value={context}>
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {!isSelecting ? (
            <Button type="button" variant="outline" onClick={() => setIsSelecting(true)}>
              <CheckSquare2 className="size-4" aria-hidden="true" />
              Select movies
            </Button>
          ) : (
            <>
              <p className="w-full text-sm font-semibold sm:w-auto" role="status">
                Selection mode
              </p>
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium focus-within:ring-2 focus-within:ring-ring">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={pageSelection.checked}
                  onChange={() =>
                    setSelectedIds(
                      pageSelection.checked
                        ? new Set()
                        : selectVisibleLibraryIds(visibleIds),
                    )
                  }
                  className="size-4 rounded border-input accent-foreground"
                  aria-label="Select all movies on this page"
                />
                Select page
              </label>
              <p className="text-sm font-medium" role="status" aria-live="polite">
                {orderedSelectedIds.length} selected on this page
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={orderedSelectedIds.length === 0}
                onClick={() => setSelectedIds(new Set())}
              >
                Clear selection
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelectedIds(new Set());
                  setIsSelecting(false);
                }}
              >
                <X className="size-4" aria-hidden="true" />
                Exit selection
              </Button>
            </>
          )}
        </div>
        {isSelecting && orderedSelectedIds.length > 0 ? (
          <BulkActions
            selectedIds={orderedSelectedIds}
            onResult={handleResult}
          />
        ) : null}
        {feedback?.message ? (
          <p
            className={
              feedback.status === "error"
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
            role={feedback.status === "error" ? "alert" : "status"}
          >
            {feedback.message}
          </p>
        ) : null}
      </div>
      {children}
    </SelectionContext.Provider>
  );
}
