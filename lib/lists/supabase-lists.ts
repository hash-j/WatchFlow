import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import { logSupabaseError } from "@/lib/supabase/error-logging";
import { getAuthContext } from "@/lib/supabase/auth";
import { createCustomListMovieAddedNotification, createCustomListMoviesAddedNotifications } from "@/lib/notifications/supabase-notifications";
import { createClient } from "@/lib/supabase/server";
import { compareListMovies } from "./sorting";
import { addMoviesToListSchema } from "./validation";

import {
  ListsAuthenticationError,
  ListsAuthorizationError,
  ListsConflictError,
  ListsMissingColumnError,
  ListsMissingRpcError,
  ListsMissingTableError,
  ListsNotFoundError,
  ListsPersistenceError,
  ListsSchemaCacheError,
  ListsValidationError,
} from "./errors";
import {
  mapCustomList,
  mapCustomListMovies,
  mapCustomListSummaries,
  mapListMovieCandidates,
  mapListMutationResult,
} from "./mapping";
import type {
  AddMoviesToListInput,
  CreateListInput,
  CustomList,
  ListDetailData,
  ListMembership,
  ListMutationResult,
  ListPickerState,
  UpdateListInput,
} from "./types";

type SupabaseListError = {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
};

type AuthenticatedListsSession = {
  client: SupabaseClient;
  user: User;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value : null;
}

function throwListsError(
  operation: string,
  error: SupabaseListError,
  fallbackMessage = "Custom lists could not be updated. Please try again.",
  duplicateListName = false,
): never {
  logSupabaseError(operation, error);

  if (error.code === "42P01" || error.code === "PGRST205") {
    throw new ListsMissingTableError();
  }

  if (error.code === "42703") {
    throw new ListsMissingColumnError();
  }

  if (error.code === "PGRST204") {
    throw new ListsSchemaCacheError();
  }

  if (error.code === "42883" || error.code === "PGRST202") {
    throw new ListsMissingRpcError();
  }

  if (error.code === "42501") {
    throw new ListsAuthorizationError();
  }

  if (error.code === "22023" || error.code === "22P02") {
    throw new ListsValidationError();
  }

  if (error.code === "23505" && duplicateListName) {
    throw new ListsConflictError();
  }

  if (error.code === "23503") {
    throw new ListsNotFoundError(
      "A selected movie or list is no longer available.",
    );
  }

  throw new ListsPersistenceError(fallbackMessage);
}

export async function authenticateLists(): Promise<AuthenticatedListsSession> {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    if (error) {
      logSupabaseError("custom lists authentication failed", error);
    }

    throw new ListsAuthenticationError();
  }

  return { client, user };
}

async function authenticateListsRequest() {
  const { client, user } = await getAuthContext();
  return { client, user };
}

async function readOwnedList(
  client: SupabaseClient,
  userId: string,
  listId: string,
  includeArtwork = false,
): Promise<CustomList | null> {
  const { data, error } = await client
    .from("lists")
    .select(includeArtwork ? "id, name, description, visibility, created_at, updated_at, thumbnail_path" : "id, name, description, visibility, created_at, updated_at")
    .eq("id", listId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (includeArtwork && ["42703", "PGRST204"].includes(error.code ?? "")) return readOwnedList(client, userId, listId, false);
    throwListsError(
      "owned custom list query failed",
      error,
      "This custom list could not be loaded. Please try again.",
    );
  }

  if (!data) return null;
  const list = mapCustomList(data);
  return includeArtwork ? { ...list, thumbnailPath: text((data as unknown as UnknownRecord).thumbnail_path) } : list;
}

export async function getCustomListSummaries() {
  const { client, user } = await authenticateListsRequest();
  const { data, error } = await client.rpc("watchflow_list_summaries");

  if (error) {
    throwListsError(
      "custom list summaries query failed",
      error,
      "Your custom lists could not be loaded. Please try again.",
    );
  }

  const lists = mapCustomListSummaries(data);
  if (!lists.length) return lists;
  // One metadata query for the gallery, not one database/signed-URL request per card.
  const { data: artwork, error: artworkError } = await client.from("lists").select("id, thumbnail_path")
    .eq("user_id", user.id).order("sort_position", { ascending: true }).order("id", { ascending: true }).range(0, lists.length - 1);
  if (artworkError && !["42703", "PGRST204"].includes(artworkError.code)) throwListsError("list thumbnails query failed", artworkError);
  const paths = new Map((artwork ?? []).map(row => [row.id, row.thumbnail_path]));
  return lists.map(list => ({ ...list, thumbnailPath: typeof paths.get(list.id) === "string" ? paths.get(list.id) as string : null }));
}

export async function getOwnedListChoices() {
  const { client, user } = await authenticateLists();
  const { data, error } = await client.from("lists").select("id, name")
    .eq("user_id", user.id).order("name", { ascending: true }).limit(500);
  if (error) throwListsError("custom list choices query failed", error);
  return (data ?? []).map(row => ({ id: String(row.id), name: String(row.name) }));
}

async function readOwnedListMovies(
  client: SupabaseClient,
  userId: string,
  listId: string,
) {
  const { data, error } = await client
    .from("list_movies")
    .select(
      "id, list_id, user_movie_id, position, user_movies!inner(id, user_id, movie_id, status, personal_rating, favourite, movies!inner(id, title, original_title, poster_path, release_date, release_year))",
    )
    .eq("list_id", listId)
    .eq("user_movies.user_id", userId)
    .order("position", { ascending: true });

  if (error) {
    throwListsError(
      "owned custom list movies query failed",
      error,
      "The movies in this list could not be loaded. Please try again.",
    );
  }

  return mapCustomListMovies(data);
}

async function readListMovieCandidates(
  client: SupabaseClient,
  listId: string,
  picker: ListPickerState,
) {
  const request = client
    .rpc(
      "watchflow_library_rows",
      {
        p_query: picker.query || null,
        p_status: picker.status === "all" ? null : picker.status,
        p_watched: null,
        p_favourite: picker.favourite === "favourites" ? true : null,
        p_genre: null,
        p_director: null,
        p_year: null,
        p_year_from: null,
        p_year_to: null,
        p_rating_min: null,
        p_rating_max: null,
      },
      { count: "exact" },
    )
    .order("title", { ascending: true, nullsFirst: false })
    .order("user_movie_id", { ascending: true })
    .range(0, 49);

  const { data, count, error } = await request;

  if (error) {
    throwListsError(
      "custom list movie picker query failed",
      error,
      "Your library choices could not be loaded. Please try again.",
    );
  }

  const candidateIds = Array.isArray(data)
    ? data
        .map((row) => (isRecord(row) ? text(row.user_movie_id) : null))
        .filter((value): value is string => Boolean(value))
    : [];

  let alreadyAddedIds = new Set<string>();
  if (candidateIds.length > 0) {
    const { data: membershipData, error: membershipError } = await client
      .from("list_movies")
      .select("user_movie_id")
      .eq("list_id", listId)
      .in("user_movie_id", candidateIds);

    if (membershipError) {
      throwListsError(
        "custom list picker memberships query failed",
        membershipError,
        "Your library choices could not be loaded. Please try again.",
      );
    }

    alreadyAddedIds = new Set(
      (membershipData ?? [])
        .map((row) => text(row.user_movie_id))
        .filter((value): value is string => Boolean(value)),
    );
  }

  return {
    candidates: mapListMovieCandidates(data, alreadyAddedIds),
    candidateTotal: count ?? candidateIds.length,
  };
}

export async function getCustomListDetail(
  listId: string,
  picker: ListPickerState,
  includeCandidates: boolean,
): Promise<ListDetailData | null> {
  const { client, user } = await authenticateListsRequest();
  const list = await readOwnedList(client, user.id, listId, true);

  if (!list) {
    return null;
  }

  const [movies, pickerData] = await Promise.all([
    readOwnedListMovies(client, user.id, listId),
    includeCandidates
      ? readListMovieCandidates(client, listId, picker)
      : Promise.resolve({ candidates: [], candidateTotal: 0 }),
  ]);

  return {
    list,
    movies,
    candidates: pickerData.candidates,
    candidateTotal: pickerData.candidateTotal,
    picker,
  };
}

export async function getMovieListMemberships(
  userMovieId: string,
): Promise<ListMembership[] | null> {
  const { client, user } = await authenticateListsRequest();
  const { data: ownedMovie, error: ownedMovieError } = await client
    .from("user_movies")
    .select("id")
    .eq("id", userMovieId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (ownedMovieError) {
    throwListsError(
      "movie list membership ownership query failed",
      ownedMovieError,
      "Custom-list memberships could not be loaded. Please try again.",
    );
  }

  if (!ownedMovie) {
    return null;
  }

  const [listsResult, membershipsResult] = await Promise.all([
    client
      .from("lists")
      .select("id, name, description")
      .eq("user_id", user.id)
      .order("name", { ascending: true })
      .limit(500),
    client
      .from("list_movies")
      .select("id, list_id")
      .eq("user_movie_id", userMovieId),
  ]);

  if (listsResult.error) {
    throwListsError(
      "movie available lists query failed",
      listsResult.error,
      "Custom-list memberships could not be loaded. Please try again.",
    );
  }

  if (membershipsResult.error) {
    throwListsError(
      "movie current memberships query failed",
      membershipsResult.error,
      "Custom-list memberships could not be loaded. Please try again.",
    );
  }

  const membershipByListId = new Map<string, string>();
  for (const rawMembership of membershipsResult.data ?? []) {
    const listId = text(rawMembership.list_id);
    const membershipId = text(rawMembership.id);
    if (listId && membershipId) {
      membershipByListId.set(listId, membershipId);
    }
  }

  return (listsResult.data ?? []).flatMap((rawList) => {
    const listId = text(rawList.id);
    const name = text(rawList.name);
    if (!listId || !name) {
      return [];
    }

    const listMovieId = membershipByListId.get(listId) ?? null;
    return [
      {
        listId,
        listMovieId,
        name,
        description: text(rawList.description),
        selected: listMovieId !== null,
      },
    ];
  });
}

export async function createOwnedCustomList(
  input: CreateListInput,
): Promise<CustomList> {
  const { client, user } = await authenticateLists();
  const { data, error } = await client
    .from("lists")
    .insert({
      user_id: user.id,
      name: input.name,
      description: input.description,
    })
    .select("id, name, description, visibility, created_at, updated_at")
    .single();

  if (error) {
    throwListsError(
      "custom list creation failed",
      error,
      "Custom lists could not be updated. Please try again.",
      true,
    );
  }

  return mapCustomList(data);
}

export async function updateOwnedCustomList(
  input: UpdateListInput,
): Promise<CustomList | null> {
  const { client, user } = await authenticateLists();
  const { data, error } = await client
    .from("lists")
    .update({
      name: input.name,
      description: input.description,
    })
    .eq("id", input.listId)
    .eq("user_id", user.id)
    .select("id, name, description, visibility, created_at, updated_at")
    .maybeSingle();

  if (error) {
    throwListsError(
      "custom list update failed",
      error,
      "Custom lists could not be updated. Please try again.",
      true,
    );
  }

  return data ? mapCustomList(data) : null;
}

export async function deleteOwnedCustomList(
  listId: string,
  confirmation: string,
) {
  const { client, user } = await authenticateLists();
  const list = await readOwnedList(client, user.id, listId);

  if (!list) {
    return false;
  }

  if (confirmation.trim() !== list.name) {
    throw new ListsValidationError(
      "Type the list name exactly to confirm deletion.",
    );
  }

  const { data, error } = await client
    .from("lists")
    .delete()
    .eq("id", listId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    throwListsError("custom list deletion failed", error);
  }

  return Boolean(data);
}

async function callListRpc(
  operation: string,
  rpcName: string,
  parameters: Record<string, unknown>,
): Promise<ListMutationResult> {
  const session = await authenticateLists();
  return callAuthenticatedListRpc(session, operation, rpcName, parameters);
}

async function callAuthenticatedListRpc(
  session: AuthenticatedListsSession,
  operation: string,
  rpcName: string,
  parameters: Record<string, unknown>,
): Promise<ListMutationResult> {
  const { client } = session;
  const { data, error } = await client.rpc(rpcName, parameters);

  if (error) {
    throwListsError(operation, error);
  }

  return mapListMutationResult(data);
}

type ListAdditionCandidate = {
  listId: string;
  userMovieId: string;
  listName: string;
  movieTitle: string;
  moviePosterPath: string | null;
};

async function readNewListAdditionCandidates(
  session: AuthenticatedListsSession,
  listIds: string[],
  userMovieIds: string[],
): Promise<ListAdditionCandidate[]> {
  if (listIds.length === 0 || userMovieIds.length === 0) return [];
  const { client, user } = session;
  const [listsResult, moviesResult, membershipsResult] = await Promise.all([
    client
      .from("lists")
      .select("id, name")
      .eq("user_id", user.id)
      .in("id", listIds),
    client
      .from("user_movies")
      .select("id, movies!inner(title, poster_path)")
      .eq("user_id", user.id)
      .in("id", userMovieIds),
    client
      .from("list_movies")
      .select("list_id, user_movie_id")
      .in("list_id", listIds)
      .in("user_movie_id", userMovieIds),
  ]);

  const error = listsResult.error ?? moviesResult.error ?? membershipsResult.error;
  if (error) {
    logSupabaseError("custom list notification snapshot read failed", error);
    return [];
  }

  const listNames = new Map(
    (listsResult.data ?? []).flatMap((row) =>
      typeof row.id === "string" && typeof row.name === "string"
        ? [[row.id, row.name] as const]
        : [],
    ),
  );
  const movieDetails = new Map(
    (moviesResult.data ?? []).flatMap((row) => {
      const movie = Array.isArray(row.movies) ? row.movies[0] : row.movies;
      return typeof row.id === "string" && movie && typeof movie.title === "string"
        ? [[row.id, {
            title: movie.title,
            posterPath:
              typeof movie.poster_path === "string" ? movie.poster_path : null,
          }] as const]
        : [];
    }),
  );
  const existing = new Set(
    (membershipsResult.data ?? []).flatMap((row) =>
      typeof row.list_id === "string" && typeof row.user_movie_id === "string"
        ? [`${row.list_id}:${row.user_movie_id}`]
        : [],
    ),
  );

  return listIds.flatMap((listId) =>
    userMovieIds.flatMap((userMovieId) => {
      const listName = listNames.get(listId);
      const movie = movieDetails.get(userMovieId);
      return listName && movie && !existing.has(`${listId}:${userMovieId}`)
        ? [{
            listId,
            userMovieId,
            listName,
            movieTitle: movie.title,
            moviePosterPath: movie.posterPath,
          }]
        : [];
    }),
  );
}

async function produceListAdditionNotifications(
  session: AuthenticatedListsSession,
  candidates: ListAdditionCandidate[],
  batch = false,
) {
  if (candidates.length === 0) return;
  const { client, user } = session;
  const listIds = [...new Set(candidates.map(({ listId }) => listId))];
  const userMovieIds = [
    ...new Set(candidates.map(({ userMovieId }) => userMovieId)),
  ];
  const { data, error } = await client
    .from("list_movies")
    .select("id, list_id, user_movie_id")
    .in("list_id", listIds)
    .in("user_movie_id", userMovieIds);

  if (error) {
    logSupabaseError("custom list notification membership read failed", error);
    return;
  }

  const candidateByMembership = new Map(
    candidates.map((candidate) => [
      `${candidate.listId}:${candidate.userMovieId}`,
      candidate,
    ]),
  );
  const inputs =
    (data ?? []).flatMap((row) => {
      if (
        typeof row.id !== "string" ||
        typeof row.list_id !== "string" ||
        typeof row.user_movie_id !== "string"
      ) {
        return [];
      }
      const candidate = candidateByMembership.get(
        `${row.list_id}:${row.user_movie_id}`,
      );
      return candidate
        ? [
            {
              verifiedUserId: user.id,
              listId: candidate.listId,
              listMovieId: row.id,
              userMovieId: candidate.userMovieId,
              listName: candidate.listName,
              movieTitle: candidate.movieTitle,
              moviePosterPath: candidate.moviePosterPath,
            },
          ]
        : [];
    });
  if (batch && inputs.length > 1) await createCustomListMoviesAddedNotifications(inputs);
  else await Promise.allSettled(inputs.map(input => createCustomListMovieAddedNotification(input)));
}

export async function addOwnedMoviesToList(input: AddMoviesToListInput) {
  if (!addMoviesToListSchema.safeParse(input).success) throw new ListsValidationError();
  const session = await authenticateLists();
  const { data: movies, error: movieError } = await session.client.from("user_movies")
    .select("id, movies!inner(title, release_year, release_date)").eq("user_id", session.user.id).in("id", input.userMovieIds);
  if (movieError) throwListsError("custom list append ordering read failed", movieError);
  if (!movies || movies.length !== input.userMovieIds.length || new Set(movies.map(row => row.id)).size !== movies.length ||
    movies.some(row => !input.userMovieIds.includes(row.id))) {
    throw new ListsNotFoundError("Some selected movies are no longer in your library. No movies were added.");
  }
  const ordered = movies.map(row => {
    const movie = Array.isArray(row.movies) ? row.movies[0] : row.movies;
    if (!movie || typeof movie.title !== "string") throw new ListsPersistenceError();
    return { id: row.id, title: movie.title, releaseYear: typeof movie.release_year === "number" ? movie.release_year : null,
      releaseDate: typeof movie.release_date === "string" ? movie.release_date : null };
  }).sort((a, b) => compareListMovies(a, b));
  let candidates: ListAdditionCandidate[] = [];
  try {
    candidates = await readNewListAdditionCandidates(
      session,
      [input.listId],
      input.userMovieIds,
    );
  } catch {
    // Notification production is best-effort and must not block list membership.
  }
  const result = await callAuthenticatedListRpc(
    session,
    "custom list batch append failed",
    "watchflow_add_movies_to_list",
    {
      p_list_id: input.listId,
      p_user_movie_ids: ordered.map(movie => movie.id),
    },
  );
  if (result.success && result.added > 0) {
    try {
      await produceListAdditionNotifications(session, candidates, true);
    } catch {
      // The membership mutation succeeded; producer failures stay non-fatal.
    }
  }
  return result;
}

export function moveOwnedListItem(
  listMovieId: string,
  direction: "up" | "down",
) {
  return callListRpc(
    "custom list item movement failed",
    "watchflow_move_list_item",
    {
      p_list_movie_id: listMovieId,
      p_direction: direction,
    },
  );
}

export function moveOwnedCustomList(
  listId: string,
  direction: "up" | "down",
) {
  return callListRpc(
    "custom list card movement failed",
    "watchflow_move_custom_list",
    {
      p_list_id: listId,
      p_direction: direction,
    },
  );
}

export function removeOwnedListMovie(listMovieId: string) {
  return callListRpc(
    "custom list movie removal failed",
    "watchflow_remove_movie_from_list",
    { p_list_movie_id: listMovieId },
  );
}

export async function setOwnedMovieListMemberships(
  userMovieId: string,
  listIds: string[],
) {
  const session = await authenticateLists();
  let candidates: ListAdditionCandidate[] = [];
  try {
    candidates = await readNewListAdditionCandidates(
      session,
      listIds,
      [userMovieId],
    );
  } catch {
    // Notification production is best-effort and must not block list membership.
  }
  const result = await callAuthenticatedListRpc(
    session,
    "movie custom-list membership update failed",
    "watchflow_set_movie_list_memberships",
    {
      p_user_movie_id: userMovieId,
      p_list_ids: listIds,
    },
  );
  if (result.success && result.added > 0) {
    try {
      await produceListAdditionNotifications(session, candidates);
    } catch {
      // The membership mutation succeeded; producer failures stay non-fatal.
    }
  }
  return result;
}
