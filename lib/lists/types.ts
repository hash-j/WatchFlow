import type { LibraryMovieStatus } from "@/lib/movies/types";

export const PART_13_MIGRATION =
  "supabase/migrations/202607290001_part_13_private_custom_lists.sql";
export const PART_18B_MIGRATION =
  "supabase/migrations/202609240001_part_18b_priority_and_list_ordering.sql";

export type CustomList = {
  id: string;
  name: string;
  description: string | null;
  visibility: "private";
  createdAt: string;
  updatedAt: string;
  thumbnailPath?: string | null;
};

export type CustomListSummary = CustomList & {
  sortPosition: number;
  movieCount: number;
  posterPaths: string[];
};

export type CustomListMovie = {
  listMovieId: string;
  listId: string;
  userMovieId: string;
  position: number;
  status: LibraryMovieStatus;
  personalRating: number | null;
  favourite: boolean;
  movie: {
    id: string;
    title: string;
    originalTitle: string | null;
    posterPath: string | null;
    releaseDate: string | null;
    releaseYear: number | null;
  };
};

export type ListMovieCandidate = {
  userMovieId: string;
  movieId: string;
  title: string;
  originalTitle: string | null;
  posterPath: string | null;
  releaseDate: string | null;
  releaseYear: number | null;
  status: LibraryMovieStatus;
  personalRating: number | null;
  favourite: boolean;
  alreadyAdded: boolean;
};

export type ListMembership = {
  listId: string;
  listMovieId: string | null;
  name: string;
  description: string | null;
  selected: boolean;
};

export type CreateListInput = {
  name: string;
  description: string | null;
};

export type UpdateListInput = CreateListInput & {
  listId: string;
};

export type AddMoviesToListInput = {
  listId: string;
  userMovieIds: string[];
};

export type ListPickerState = {
  query: string;
  status: LibraryMovieStatus | "all";
  favourite: "all" | "favourites";
};

export type ListDetailData = {
  list: CustomList;
  movies: CustomListMovie[];
  candidates: ListMovieCandidate[];
  candidateTotal: number;
  picker: ListPickerState;
};

export type ListMutationResult = {
  success: boolean;
  reason: string | null;
  listId: string | null;
  moved: boolean | null;
  removed: boolean | null;
  finalPosition: number | null;
  requested: number;
  matched: number;
  added: number;
  removedCount: number;
  skipped: number;
  unchanged: number;
};

export type ListActionState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors: Record<string, string[]>;
  requestId: number;
};

export const initialListActionState: ListActionState = {
  status: "idle",
  message: "",
  fieldErrors: {},
  requestId: 0,
};
