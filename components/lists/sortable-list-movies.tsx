"use client";

import { useMemo, useState } from "react";
import { Select } from "@/components/ui/select";
import { LIST_SORT_OPTIONS, sortListMovies, type ListSortMode } from "@/lib/lists/sorting";
import type { CustomListMovie } from "@/lib/lists/types";
import { ListMovieRow } from "./list-movie-row";

export function SortableListMovies({ movies, listName }: { movies: CustomListMovie[]; listName: string }) {
  const [mode, setMode] = useState<ListSortMode>("manual");
  const sorted = useMemo(() => sortListMovies(movies, mode), [movies, mode]);
  return (
    <div className="mt-4 space-y-3">
      <label className="block max-w-xs space-y-1 text-sm font-medium">
        Sort
        <Select value={mode} onChange={event => setMode(event.target.value as ListSortMode)}>
          {LIST_SORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </label>
      {mode !== "manual" && <p className="text-sm text-muted-foreground" role="status">Viewing a sorted list. Select Manual order to move movies; your saved order is unchanged.</p>}
      <ol className="space-y-3">
        {sorted.map((item, index) => <ListMovieRow key={item.listMovieId} item={item} listName={listName}
          displayPosition={index + 1} manualOrder={mode === "manual"} isFirst={index === 0} isLast={index === sorted.length - 1} />)}
      </ol>
    </div>
  );
}
