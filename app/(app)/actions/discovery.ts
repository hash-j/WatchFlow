"use server";

import "server-only";

import type { PickerActionState } from "@/lib/discovery/action-state";
import {
  DiscoveryAuthenticationError,
  DiscoveryAuthorizationError,
  DiscoveryPersistenceError,
  DiscoveryRelationshipError,
  DiscoverySchemaError,
} from "@/lib/discovery/errors";
import {
  getAvailableGenres,
  PickerInputError,
  pickRandomMovie,
  parsePickerSearchParams,
} from "@/lib/discovery/picker";
import { getPickerDataset } from "@/lib/discovery/supabase-discovery";
import type { RawPickerSearchParams } from "@/lib/discovery/types";

function stringValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

function pickerFormParams(formData: FormData): RawPickerSearchParams {
  return {
    genre: stringValue(formData, "genre"),
    maxRuntime: stringValue(formData, "maxRuntime"),
    minRating: stringValue(formData, "minRating"),
    mood: stringValue(formData, "mood"),
    period: stringValue(formData, "period"),
    watched: stringValue(formData, "watched"),
    watchNext: stringValue(formData, "watchNext"),
    favourite: stringValue(formData, "favourite"),
  };
}

function errorMessage(error: unknown) {
  if (error instanceof DiscoveryAuthenticationError) {
    return "Please sign in again.";
  }

  if (error instanceof PickerInputError) {
    return "The recent picker history was invalid. Clear it and try again.";
  }

  if (error instanceof DiscoverySchemaError) {
    return "The Movie Picker can’t use part of your Library right now. Try again later.";
  }

  if (error instanceof DiscoveryRelationshipError) {
    return "WatchFlow couldn’t connect some movie details to your Library. Try again.";
  }

  if (error instanceof DiscoveryAuthorizationError) {
    return "Your private library could not be accessed. Please sign in again.";
  }

  if (error instanceof DiscoveryPersistenceError) {
    return "Your movie library could not be loaded. Please try again.";
  }

  return "A movie could not be picked. Please try again.";
}

export async function pickMovieAction(
  previousState: PickerActionState,
  formData: FormData,
): Promise<PickerActionState> {
  const requestId = previousState.requestId + 1;

  try {
    const dataset = await getPickerDataset();
    const genres = getAvailableGenres(dataset.movies);
    const { filters, warnings } = parsePickerSearchParams(
      pickerFormParams(formData),
      genres,
    );
    const result = pickRandomMovie(
      dataset.movies,
      filters,
      formData.getAll("excludedUserMovieIds"),
    );

    if (!result.movie) {
      return {
        status: "empty",
        message: "No movies in your library match these filters.",
        requestId,
        result,
        warnings,
        libraryTruncated: dataset.truncated,
      };
    }

    return {
      status: "success",
      message:
        result.eligibleCount === 1
          ? "Picked from 1 matching movie."
          : `Picked from ${result.eligibleCount} matching movies.`,
      requestId,
      result,
      warnings,
      libraryTruncated: dataset.truncated,
    };
  } catch (error) {
    return {
      status: "error",
      message: errorMessage(error),
      requestId,
      result: null,
      warnings: [],
      libraryTruncated: false,
    };
  }
}
