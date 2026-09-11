"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { ListPlus, Save } from "lucide-react";
import { useRouter } from "next/navigation";

import { setMovieListMembershipsAction } from "@/app/(app)/actions/lists";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  initialListActionState,
  type ListMembership,
} from "@/lib/lists/types";

type MovieListMembershipsFormProps = {
  userMovieId: string;
  movieId: string;
  movieTitle: string;
  memberships: ListMembership[];
};

export function MovieListMembershipsForm(
  props: MovieListMembershipsFormProps,
) {
  const selectionKey = props.memberships
    .map((membership) => `${membership.listId}:${membership.selected}`)
    .join(",");

  return <MovieListMembershipsFormState key={selectionKey} {...props} />;
}

function MovieListMembershipsFormState({
  userMovieId,
  movieId,
  movieTitle,
  memberships,
}: MovieListMembershipsFormProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () =>
      new Set(
        memberships
          .filter((membership) => membership.selected)
          .map((membership) => membership.listId),
      ),
  );
  const [state, action, isPending] = useActionState(
    setMovieListMembershipsAction,
    initialListActionState,
  );

  useEffect(() => {
    if (state.requestId > 0 && state.status === "success") {
      router.refresh();
    }
  }, [router, state.requestId, state.status]);

  function toggleList(listId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(listId)) {
        next.delete(listId);
      } else {
        next.add(listId);
      }
      return next;
    });
  }

  return (
    <section
      aria-labelledby="custom-lists-heading"
      className="mt-10 rounded-xl border bg-card p-5 shadow-sm sm:p-6"
    >
      <div className="flex min-w-0 flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <h2 id="custom-lists-heading" className="text-xl font-semibold">
            Custom Lists
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add or remove this movie from any of your private collections.
            Existing list order is preserved.
          </p>
        </div>
        <Link
          href="/lists?create=1"
          className={buttonVariants({
            variant: "outline",
            size: "sm",
            className: "w-full shrink-0 sm:w-auto",
          })}
        >
          <ListPlus className="size-4" aria-hidden="true" />
          Create New List
        </Link>
      </div>

      {memberships.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed p-5 text-center">
          <p className="font-medium">You have not created any custom lists.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a list such as Weekend Movies or Best Thrillers, then return
            here to add {movieTitle}.
          </p>
        </div>
      ) : (
        <form action={action} className="mt-5 space-y-4">
          <input type="hidden" name="userMovieId" value={userMovieId} />
          <input type="hidden" name="movieId" value={movieId} />
          {[...selectedIds].map((listId) => (
            <input key={listId} type="hidden" name="listIds" value={listId} />
          ))}

          <fieldset>
            <legend className="sr-only">
              Choose custom lists for {movieTitle}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {memberships.map((membership) => {
                const checked = selectedIds.has(membership.listId);

                return (
                  <label
                    key={membership.listId}
                    className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border p-3 focus-within:ring-2 focus-within:ring-ring"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleList(membership.listId)}
                      className="mt-0.5 size-4 shrink-0 rounded border-input accent-foreground"
                      aria-label={`${checked ? "Remove" : "Add"} ${movieTitle} ${
                        checked ? "from" : "to"
                      } ${membership.name}`}
                    />
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-medium">
                        {membership.name}
                      </span>
                      {membership.description ? (
                        <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">
                          {membership.description}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

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

          <Button type="submit" disabled={isPending}>
            <Save className="size-4" aria-hidden="true" />
            {isPending ? "Saving memberships..." : "Save List Memberships"}
          </Button>
        </form>
      )}
    </section>
  );
}
