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
    <div className="grid min-w-0 grid-cols-1 gap-2 min-[520px]:flex min-[520px]:flex-wrap min-[520px]:items-start [&_form]:min-w-0 [&_form]:w-full min-[520px]:[&_form]:w-auto [&_button]:w-full min-[520px]:[&_button]:w-auto">
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
        />
      ) : null}
    </div>
  );
}
