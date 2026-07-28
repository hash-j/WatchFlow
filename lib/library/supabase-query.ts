import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { LibraryMovieSummary } from "@/lib/movies/types";
import { readUserPreferences } from "@/lib/settings/supabase-settings";
import { logSupabaseError } from "@/lib/supabase/error-logging";
import { createClient } from "@/lib/supabase/server";

import {
  AuthenticationRequiredError,
  LibraryAuthorizationError,
  LibraryPersistenceError,
  LibrarySchemaError,
} from "./errors";
import {
  getLibraryPagination,
  LIBRARY_SORT_ORDERS,
  parseLibrarySearchParams,
  type LibraryFacets,
  type LibraryPagination,
  type LibraryQueryState,
  type RawLibrarySearchParams,
} from "./query";
import { mapLibraryFacets, mapLibraryQueryRows } from "./query-mapping";

type SupabaseQueryError = {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
};

export type LibraryPageData = {
  items: LibraryMovieSummary[];
  totalItems: number;
  pagination: LibraryPagination;
  state: LibraryQueryState;
  warnings: string[];
  facets: LibraryFacets;
};

function throwLibraryQueryError(
  operation: string,
  error: SupabaseQueryError,
): never {
  logSupabaseError(operation, error);

  if (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    error.code === "42703"
  ) {
    throw new LibrarySchemaError(
      "Library improvements are not configured yet. Apply the Part 12 migration.",
    );
  }

  if (error.code === "42501") {
    throw new LibraryAuthorizationError();
  }

  throw new LibraryPersistenceError(
    "Your library could not be loaded. Please try again.",
  );
}

function watchedArgument(state: LibraryQueryState) {
  if (state.watched === "watched") return true;
  if (state.watched === "unwatched") return false;
  return null;
}

function favouriteArgument(state: LibraryQueryState) {
  if (state.favourite === "favourites") return true;
  if (state.favourite === "not-favourites") return false;
  return null;
}

export async function queryOwnedLibraryPage(
  client: SupabaseClient,
  state: LibraryQueryState,
) {
  let request = client.rpc(
    "watchflow_library_rows",
    {
      p_query: state.q || null,
      p_status: state.status === "all" ? null : state.status,
      p_watched: watchedArgument(state),
      p_favourite: favouriteArgument(state),
      p_genre: state.genre,
      p_director: state.director,
      p_year: state.year,
      p_year_from: state.yearFrom,
      p_year_to: state.yearTo,
      p_rating_min: state.ratingMin,
      p_rating_max: state.ratingMax,
    },
    { count: "exact" },
  );

  for (const order of LIBRARY_SORT_ORDERS[state.sort]) {
    request = request.order(order.column, {
      ascending: order.ascending,
      nullsFirst: order.nullsFirst,
    });
  }

  const from = (state.page - 1) * state.perPage;
  const to = from + state.perPage - 1;
  const { data, count, error } = await request.range(from, to);

  if (error) {
    throwLibraryQueryError("private library page query failed", error);
  }

  return {
    items: mapLibraryQueryRows(data),
    totalItems: count ?? 0,
  };
}

export async function readOwnedLibraryFacets(client: SupabaseClient) {
  const { data, error } = await client.rpc(
    "watchflow_library_filter_options",
  );

  if (error) {
    throwLibraryQueryError("private library filter options query failed", error);
  }

  return mapLibraryFacets(data);
}

export async function getLibraryPageData(
  rawSearchParams: RawLibrarySearchParams,
): Promise<LibraryPageData> {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    throw new AuthenticationRequiredError();
  }

  const preferences = await readUserPreferences(client, user.id);
  const parsed = parseLibrarySearchParams(rawSearchParams, {
    defaultLibraryView: preferences.defaultLibraryView,
    moviesPerPage: preferences.moviesPerPage,
  });
  const [page, facets] = await Promise.all([
    queryOwnedLibraryPage(client, parsed.state),
    readOwnedLibraryFacets(client),
  ]);

  return {
    ...page,
    pagination: getLibraryPagination(
      page.totalItems,
      parsed.state.page,
      parsed.state.perPage,
    ),
    state: parsed.state,
    warnings: parsed.warnings,
    facets,
  };
}

