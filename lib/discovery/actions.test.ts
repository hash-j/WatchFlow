import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPickerDataset: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./supabase-discovery", () => ({
  getPickerDataset: mocks.getPickerDataset,
}));

import { pickMovieAction } from "../../app/(app)/actions/discovery";
import { initialPickerActionState } from "./action-state";
import {
  DiscoveryAuthenticationError,
  DiscoveryAuthorizationError,
  DiscoveryPersistenceError,
  DiscoveryRelationshipError,
  DiscoverySchemaError,
} from "./errors";
import type { DiscoveryMovie } from "./types";

const userMovieId = "11111111-1111-4111-8111-111111111111";

function movie(
  overrides: Partial<DiscoveryMovie> = {},
): DiscoveryMovie {
  return {
    userMovieId,
    movieId: "42",
    status: "want_to_watch",
    favourite: false,
    personalRating: null,
    title: "Private Candidate",
    originalTitle: null,
    posterPath: null,
    releaseYear: 2020,
    runtimeMinutes: 100,
    genres: ["Thriller"],
    director: "A Director",
    publicRating: 8.1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPickerDataset.mockResolvedValue({
    movies: [movie()],
    totalCount: 1,
    truncated: false,
  });
});

describe("Part 14 picker Server Action", () => {
  it("selects from the freshly authenticated private dataset without accepting a browser user_id", async () => {
    const formData = new FormData();
    formData.set("watched", "unwatched");
    formData.set("user_id", "browser-supplied-user");

    const result = await pickMovieAction(
      initialPickerActionState,
      formData,
    );

    expect(result).toMatchObject({
      status: "success",
      requestId: 1,
      message: "Picked from 1 matching movie.",
      result: {
        eligibleCount: 1,
        movie: { userMovieId, title: "Private Candidate" },
      },
    });
    expect(mocks.getPickerDataset).toHaveBeenCalledWith();
    expect(mocks.getPickerDataset).toHaveBeenCalledTimes(1);
    expect(result.result?.movie).not.toHaveProperty("personalRating");
  });

  it("applies combined public-rating, runtime, genre, mood, and favourite filters", async () => {
    mocks.getPickerDataset.mockResolvedValue({
      movies: [
        movie({ favourite: true }),
        movie({
          userMovieId: "22222222-2222-4222-8222-222222222222",
          movieId: "43",
          title: "Low Public Rating",
          favourite: true,
          publicRating: 5.5,
        }),
      ],
      totalCount: 2,
      truncated: false,
    });
    const formData = new FormData();
    formData.set("genre", "Thriller");
    formData.set("maxRuntime", "120");
    formData.set("minRating", "8");
    formData.set("mood", "intense");
    formData.set("period", "2020s");
    formData.set("watched", "unwatched");
    formData.set("favourite", "1");

    const result = await pickMovieAction(
      initialPickerActionState,
      formData,
    );

    expect(result.status).toBe("success");
    expect(result.result?.eligibleCount).toBe(1);
    expect(result.result?.movie?.title).toBe("Private Candidate");
    expect(result.result?.reasons.join(" ")).toContain("public rating");
  });

  it("returns an honest empty state without relaxing active filters", async () => {
    const formData = new FormData();
    formData.set("minRating", "9");

    const result = await pickMovieAction(
      initialPickerActionState,
      formData,
    );

    expect(result).toMatchObject({
      status: "empty",
      message: "No movies in your library match these filters.",
      result: { movie: null, eligibleCount: 0 },
    });
  });

  it("rejects malformed or excessive browser exclusion history safely", async () => {
    const invalid = new FormData();
    invalid.append("excludedUserMovieIds", "not-a-uuid");

    const invalidResult = await pickMovieAction(
      initialPickerActionState,
      invalid,
    );
    expect(invalidResult).toMatchObject({
      status: "error",
      message:
        "The recent picker history was invalid. Clear it and try again.",
    });
    expect(invalidResult.message).not.toContain("uuid");

    const excessive = new FormData();
    for (let index = 0; index < 51; index += 1) {
      excessive.append(
        "excludedUserMovieIds",
        `${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`,
      );
    }
    const excessiveResult = await pickMovieAction(
      initialPickerActionState,
      excessive,
    );
    expect(excessiveResult.status).toBe("error");
  });

  it("reports the bounded-data limitation when the private adapter is truncated", async () => {
    mocks.getPickerDataset.mockResolvedValue({
      movies: [movie()],
      totalCount: 1_200,
      truncated: true,
    });

    const result = await pickMovieAction(
      initialPickerActionState,
      new FormData(),
    );

    expect(result.status).toBe("success");
    expect(result.libraryTruncated).toBe(true);
  });

  it.each([
    [new DiscoveryAuthenticationError(), "Please sign in again."],
    [
      new DiscoverySchemaError(),
      "The Movie Picker can’t use part of your Library right now. Try again later.",
    ],
    [
      new DiscoveryRelationshipError(),
      "WatchFlow couldn’t connect some movie details to your Library. Try again.",
    ],
    [
      new DiscoveryAuthorizationError(),
      "Your private library could not be accessed. Please sign in again.",
    ],
    [
      new DiscoveryPersistenceError(),
      "Your movie library could not be loaded. Please try again.",
    ],
  ])("maps private-query failures to specific safe copy", async (error, message) => {
    mocks.getPickerDataset.mockRejectedValue(error);

    const result = await pickMovieAction(
      initialPickerActionState,
      new FormData(),
    );

    expect(result).toMatchObject({ status: "error", message });
  });
});
