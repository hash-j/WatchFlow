"use client";

import { FavouriteToggleForm } from "@/components/movies/favourite-toggle-form";
import { RemoveFromLibraryForm } from "@/components/movies/remove-from-library-form";

import {
  LibrarySelectionCheckbox,
  useLibrarySelection,
} from "./library-selection-workspace";

export function LibraryItemActions({
  libraryId,
  movieId,
  title,
  favourite,
}: {
  libraryId: string;
  movieId: string;
  title: string;
  favourite: boolean;
}) {
  const { isSelecting } = useLibrarySelection();

  return (
    <div className="flex flex-wrap items-start gap-2">
      <LibrarySelectionCheckbox libraryId={libraryId} title={title} />
      <FavouriteToggleForm
        libraryId={libraryId}
        movieId={movieId}
        title={title}
        favourite={favourite}
        compact
      />
      {!isSelecting ? <RemoveFromLibraryForm libraryId={libraryId} /> : null}
    </div>
  );
}
