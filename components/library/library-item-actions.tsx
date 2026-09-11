"use client";

import { FavouriteToggleForm } from "@/components/movies/favourite-toggle-form";
import { RemoveFromLibraryForm } from "@/components/movies/remove-from-library-form";

import {
  LibrarySelectionCheckbox,
  useLibrarySelection,
} from "./library-selection-workspace";

export function LibraryItemActions({
  userMovieId,
  movieId,
  title,
  favourite,
}: {
  userMovieId: string;
  movieId: string;
  title: string;
  favourite: boolean;
}) {
  const { isSelecting } = useLibrarySelection();

  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-2 [&_button]:min-h-11 [&_button]:w-full [&_form]:min-w-0 [&_form]:w-full">
      <LibrarySelectionCheckbox libraryId={userMovieId} title={title} />
      <FavouriteToggleForm
        libraryId={userMovieId}
        movieId={movieId}
        title={title}
        favourite={favourite}
        compact
      />
      {!isSelecting ? (
        <RemoveFromLibraryForm
          userMovieId={userMovieId}
          movieId={movieId}
          movieTitle={title}
          compact
        />
      ) : null}
    </div>
  );
}
