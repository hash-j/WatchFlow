import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import { logSupabaseError } from "@/lib/supabase/error-logging";
import { getAuthContext } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

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
): Promise<CustomList | null> {
  const { data, error } = await client
    .from("lists")
    .select("id, name, description, visibility, created_at, updated_at")
    .eq("id", listId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throwListsError(
      "owned custom list query failed",
      error,
      "This custom list could not be loaded. Please try again.",
    );
  }

  return data ? mapCustomList(data) : null;
}

export async function getCustomListSummaries() {
  const { client } = await authenticateListsRequest();
  const { data, error } = await client.rpc("watchflow_list_summaries");

  if (error) {
    throwListsError(
      "custom list summaries query failed",
      error,
      "Your custom lists could not be loaded. Please try again.",
    );
  }

  return mapCustomListSummaries(data);
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
  const list = await readOwnedList(client, user.id, listId);

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
  const { client } = await authenticateLists();
  const { data, error } = await client.rpc(rpcName, parameters);

  if (error) {
    throwListsError(operation, error);
  }

  return mapListMutationResult(data);
}

export function addOwnedMoviesToList(input: AddMoviesToListInput) {
  return callListRpc(
    "custom list batch append failed",
    "watchflow_add_movies_to_list",
    {
      p_list_id: input.listId,
      p_user_movie_ids: input.userMovieIds,
    },
  );
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

export function removeOwnedListMovie(listMovieId: string) {
  return callListRpc(
    "custom list movie removal failed",
    "watchflow_remove_movie_from_list",
    { p_list_movie_id: listMovieId },
  );
}

export function setOwnedMovieListMemberships(
  userMovieId: string,
  listIds: string[],
) {
  return callListRpc(
    "movie custom-list membership update failed",
    "watchflow_set_movie_list_memberships",
    {
      p_user_movie_id: userMovieId,
      p_list_ids: listIds,
    },
  );
}
