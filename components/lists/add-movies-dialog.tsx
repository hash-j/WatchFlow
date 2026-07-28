"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CheckSquare2, Plus, Search, Star } from "lucide-react";
import { useRouter } from "next/navigation";

import { addMoviesToListAction } from "@/app/(app)/actions/lists";
import { MoviePoster } from "@/components/movies/movie-poster";
import { MovieStatusBadge } from "@/components/movies/movie-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  initialListActionState,
  type ListMovieCandidate,
  type ListPickerState,
} from "@/lib/lists/types";
import {
  LIBRARY_MOVIE_STATUSES,
  LIBRARY_MOVIE_STATUS_LABELS,
} from "@/lib/movies/types";

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function AddMoviesDialog({
  listId,
  listName,
  candidates,
  candidateTotal,
  picker,
  open,
}: {
  listId: string;
  listName: string;
  candidates: ListMovieCandidate[];
  candidateTotal: number;
  picker: ListPickerState;
  open: boolean;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [state, action, isPending] = useActionState(
    addMoviesToListAction,
    initialListActionState,
  );
  const basePath = `/lists/${listId}`;
  const titleId = `add-movies-${listId}-title`;
  const descriptionId = `add-movies-${listId}-description`;
  const availableIds = useMemo(
    () =>
      candidates
        .filter((candidate) => !candidate.alreadyAdded)
        .map((candidate) => candidate.userMovieId),
    [candidates],
  );
  const orderedSelectedIds = useMemo(
    () =>
      candidates
        .filter((candidate) => selectedIds.has(candidate.userMovieId))
        .map((candidate) => candidate.userMovieId),
    [candidates, selectedIds],
  );
  const allVisibleAlreadyAdded =
    candidates.length > 0 &&
    candidates.every((candidate) => candidate.alreadyAdded);

  useEffect(() => {
    if (open && !dialogRef.current?.open) {
      dialogRef.current?.showModal();
    }
  }, [open]);

  useEffect(() => {
    const available = new Set(availableIds);
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => available.has(id)));
      const unchanged =
        next.size === current.size &&
        [...next].every((id) => current.has(id));
      return unchanged ? current : next;
    });
  }, [availableIds]);

  useEffect(() => {
    if (state.requestId > 0 && state.status === "success") {
      setSelectedIds(new Set());
      router.refresh();
    }
  }, [router, state.requestId, state.status]);

  function closeDialog() {
    dialogRef.current?.close();
  }

  function handleClose() {
    triggerRef.current?.focus();
    router.replace(basePath);
  }

  function toggleCandidate(userMovieId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(userMovieId)) {
        next.delete(userMovieId);
      } else {
        next.add(userMovieId);
      }
      return next;
    });
  }

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        onClick={() => router.push(`${basePath}?add=1`)}
        aria-label={`Add movies to ${listName}`}
      >
        <Plus className="size-4" aria-hidden="true" />
        Add Movies
      </Button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClose={handleClose}
        className="max-h-[min(52rem,calc(100svh-2rem))] w-[min(58rem,calc(100%-1rem))] overflow-y-auto rounded-xl border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/60 sm:w-[min(58rem,calc(100%-2rem))]"
      >
        <div className="space-y-5 p-4 sm:p-6">
          <div>
            <h2 id={titleId} className="text-xl font-semibold">
              Add movies to “{listName}”
            </h2>
            <p
              id={descriptionId}
              className="mt-2 text-sm text-muted-foreground"
            >
              Choose from movies already in your private WatchFlow library.
              Search results are capped at 50.
            </p>
          </div>

          <form
            method="get"
            action={basePath}
            role="search"
            className="grid gap-3 rounded-xl border bg-muted/30 p-3 md:grid-cols-[minmax(12rem,1fr)_12rem_11rem_auto]"
          >
            <input type="hidden" name="add" value="1" />
            <div className="space-y-1">
              <Label htmlFor={`list-picker-query-${listId}`}>
                Search your library
              </Label>
              <Input
                id={`list-picker-query-${listId}`}
                name="listQuery"
                type="search"
                maxLength={100}
                defaultValue={picker.query}
                placeholder="Title, director, cast, or genre"
                className="min-h-10"
              />
            </div>
            <label className="space-y-1 text-sm font-medium">
              Status
              <select
                name="listStatus"
                defaultValue={picker.status}
                className={selectClassName}
              >
                <option value="all">All statuses</option>
                {LIBRARY_MOVIE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {LIBRARY_MOVIE_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium">
              Favourite
              <select
                name="listFavourite"
                defaultValue={picker.favourite}
                className={selectClassName}
              >
                <option value="all">All movies</option>
                <option value="favourites">Favourites only</option>
              </select>
            </label>
            <Button type="submit" className="min-h-10 self-end">
              <Search className="size-4" aria-hidden="true" />
              Search
            </Button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {candidateTotal === 0
                ? "No matching library movies"
                : `${candidateTotal} matching ${
                    candidateTotal === 1 ? "movie" : "movies"
                  }`}
              {candidateTotal > candidates.length
                ? ` · showing first ${candidates.length}`
                : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-10"
                disabled={availableIds.length === 0}
                onClick={() => setSelectedIds(new Set(availableIds))}
              >
                <CheckSquare2 className="size-4" aria-hidden="true" />
                Select available
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="min-h-10"
                disabled={selectedIds.size === 0}
                onClick={() => setSelectedIds(new Set())}
              >
                Clear selection
              </Button>
            </div>
          </div>

          {candidates.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <p className="font-medium">
                {picker.query ||
                picker.status !== "all" ||
                picker.favourite !== "all"
                  ? "No library movies match these filters."
                  : "Your personal library has no movies to add yet."}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Try another search or add a movie to your library first.
              </p>
              {picker.query ||
              picker.status !== "all" ||
              picker.favourite !== "all" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4"
                  onClick={() => router.push(`${basePath}?add=1`)}
                >
                  Clear picker filters
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              {allVisibleAlreadyAdded ? (
                <p
                  className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground"
                  role="status"
                >
                  Every displayed movie already belongs to this list.
                </p>
              ) : null}
              <ul className="grid gap-3 md:grid-cols-2">
                {candidates.map((candidate) => {
                  const checked =
                    candidate.alreadyAdded ||
                    selectedIds.has(candidate.userMovieId);
                  const year =
                    candidate.releaseYear ??
                    candidate.releaseDate?.slice(0, 4) ??
                    null;

                  return (
                    <li
                      key={candidate.userMovieId}
                      className="min-w-0 rounded-xl border bg-card p-3"
                    >
                      <label
                        className={`grid min-h-20 gap-3 ${
                          candidate.alreadyAdded
                            ? "cursor-not-allowed opacity-70"
                            : "cursor-pointer"
                        } grid-cols-[1rem_4rem_minmax(0,1fr)] focus-within:ring-2 focus-within:ring-ring`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={candidate.alreadyAdded}
                          onChange={() =>
                            toggleCandidate(candidate.userMovieId)
                          }
                          className="mt-1 size-4 rounded border-input accent-foreground"
                          aria-label={
                            candidate.alreadyAdded
                              ? `${candidate.title} is already in ${listName}`
                              : `Add ${candidate.title} to ${listName}`
                          }
                        />
                        <div className="w-16">
                          <MoviePoster
                            path={candidate.posterPath}
                            title={candidate.title}
                            sizes="64px"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold">
                            {candidate.title}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {year ?? "Release date unavailable"}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <MovieStatusBadge status={candidate.status} />
                            {candidate.favourite ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium">
                                <Star
                                  className="size-3 fill-current"
                                  aria-hidden="true"
                                />
                                Favourite
                              </span>
                            ) : null}
                          </div>
                          {candidate.alreadyAdded ? (
                            <p className="mt-2 text-xs font-semibold">
                              Already in list
                            </p>
                          ) : null}
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <form action={action} className="space-y-3 border-t pt-4">
            <input type="hidden" name="listId" value={listId} />
            {orderedSelectedIds.map((userMovieId) => (
              <input
                key={userMovieId}
                type="hidden"
                name="userMovieIds"
                value={userMovieId}
              />
            ))}
            <p className="text-sm font-medium" role="status" aria-live="polite">
              {orderedSelectedIds.length} selected
            </p>
            {state.message ? (
              <p
                className={
                  state.status === "error"
                    ? "text-sm text-destructive"
                    : "text-sm text-emerald-700 dark:text-emerald-300"
                }
                role={state.status === "error" ? "alert" : "status"}
              >
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
                {state.status === "success" ? "Done" : "Cancel"}
              </Button>
              <Button
                type="submit"
                disabled={isPending || orderedSelectedIds.length === 0}
              >
                {isPending
                  ? "Adding movies..."
                  : `Add Selected Movies (${orderedSelectedIds.length})`}
              </Button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
