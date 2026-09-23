import { describe, expect, it } from "vitest";

import { ListsPersistenceError } from "./errors";
import {
  mapCustomList,
  mapCustomListMovies,
  mapCustomListSummaries,
  mapListMovieCandidates,
  mapListMutationResult,
} from "./mapping";

const listId = "11111111-1111-4111-8111-111111111111";
const listMovieId = "22222222-2222-4222-8222-222222222222";
const userMovieId = "33333333-3333-4333-8333-333333333333";

const listRow = {
  id: listId,
  name: "Weekend Movies",
  description: "Friday night choices",
  visibility: "private",
  created_at: "2026-07-29T10:00:00.000Z",
  updated_at: "2026-07-29T11:00:00.000Z",
};

describe("custom-list response mapping", () => {
  it("maps private list and summary fields while filtering and capping posters", () => {
    expect(mapCustomList(listRow)).toEqual({
      id: listId,
      name: "Weekend Movies",
      description: "Friday night choices",
      visibility: "private",
      createdAt: "2026-07-29T10:00:00.000Z",
      updatedAt: "2026-07-29T11:00:00.000Z",
    });

    expect(
      mapCustomListSummaries([
        {
          ...listRow,
          sort_position: "2",
          movie_count: "6",
          poster_paths: [
            "/one.jpg",
            null,
            "/two.jpg",
            42,
            "/three.jpg",
            "/four.jpg",
            "/five.jpg",
          ],
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        id: listId,
        sortPosition: 2,
        movieCount: 6,
        posterPaths: [
          "/one.jpg",
          "/two.jpg",
          "/three.jpg",
          "/four.jpg",
        ],
      }),
    ]);
  });

  it("maps list membership IDs separately from shared movie IDs and preserves database order", () => {
    const rows = [
      {
        id: listMovieId,
        list_id: listId,
        user_movie_id: userMovieId,
        position: 1,
        user_movies: {
          id: userMovieId,
          movie_id: 975,
          status: "watch_next",
          personal_rating: "8.5",
          favourite: true,
          movies: {
            id: 975,
            title: "Inception",
            original_title: "Inception",
            poster_path: "/inception.jpg",
            release_date: "2010-07-16",
            release_year: 2010,
          },
        },
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        list_id: listId,
        user_movie_id: "55555555-5555-4555-8555-555555555555",
        position: 2,
        user_movies: [
          {
            movie_id: "976",
            status: "watched",
            personal_rating: null,
            favourite: false,
            movies: [
              {
                id: "976",
                title: "Memento",
                original_title: null,
                poster_path: null,
                release_date: null,
                release_year: null,
              },
            ],
          },
        ],
      },
    ];

    const mapped = mapCustomListMovies(rows);

    expect(mapped.map(({ position }) => position)).toEqual([1, 2]);
    expect(mapped[0]).toMatchObject({
      listMovieId,
      listId,
      userMovieId,
      position: 1,
      status: "watch_next",
      personalRating: 8.5,
      favourite: true,
      movie: {
        id: "975",
        title: "Inception",
        posterPath: "/inception.jpg",
        releaseYear: 2010,
      },
    });
    expect(mapped[1]).toMatchObject({
      position: 2,
      status: "watched",
      movie: { id: "976", title: "Memento", posterPath: null },
    });
  });

  it("maps picker user_movies IDs and marks only current-list memberships", () => {
    const otherUserMovieId = "66666666-6666-4666-8666-666666666666";
    const mapped = mapListMovieCandidates(
      [
        {
          user_movie_id: userMovieId,
          movie_id: 975,
          title: "Inception",
          original_title: "Inception",
          poster_path: "/inception.jpg",
          release_date: "2010-07-16",
          release_year: 2010,
          status: "want_to_watch",
          personal_rating: null,
          favourite: false,
        },
        {
          user_movie_id: otherUserMovieId,
          movie_id: "976",
          title: "Memento",
          original_title: null,
          poster_path: null,
          release_date: null,
          release_year: "2000",
          status: "watched",
          personal_rating: "9",
          favourite: true,
        },
      ],
      new Set([userMovieId]),
    );

    expect(mapped.map(({ userMovieId: id }) => id)).toEqual([
      userMovieId,
      otherUserMovieId,
    ]);
    expect(mapped[0]).toMatchObject({
      movieId: "975",
      alreadyAdded: true,
      status: "want_to_watch",
    });
    expect(mapped[1]).toMatchObject({
      movieId: "976",
      alreadyAdded: false,
      status: "watched",
      releaseYear: 2000,
      personalRating: 9,
    });
  });

  it("maps useful mutation results without trusting missing or negative counts", () => {
    expect(
      mapListMutationResult({
        success: true,
        reason: null,
        list_id: listId,
        moved: false,
        removed: true,
        final_position: "2",
        requested: "3",
        matched: 3,
        added_count: 2,
        removed_count: -1,
        skipped_count: "1",
        unchanged_count: "not-a-number",
      }),
    ).toEqual({
      success: true,
      reason: null,
      listId,
      moved: false,
      removed: true,
      finalPosition: 2,
      requested: 3,
      matched: 3,
      added: 2,
      removedCount: 0,
      skipped: 1,
      unchanged: 0,
    });
  });

  it("rejects malformed, non-private, invalid-status, and invalid-position responses safely", () => {
    const invalidResponses = [
      () => mapCustomList(null),
      () => mapCustomList({ ...listRow, visibility: "public" }),
      () =>
        mapCustomListSummaries([
          {
            ...listRow,
            sort_position: 0,
            movie_count: -1,
            poster_paths: [],
          },
        ]),
      () =>
        mapCustomListMovies([
          {
            id: listMovieId,
            list_id: listId,
            user_movie_id: userMovieId,
            position: 0,
            user_movies: {
              movie_id: 975,
              status: "not-a-status",
              movies: { id: 975, title: "Inception" },
            },
          },
        ]),
      () => mapListMovieCandidates({ private: "payload" }, new Set()),
      () => mapListMutationResult({ success: "yes", private: "payload" }),
    ];

    for (const map of invalidResponses) {
      expect(map).toThrow(ListsPersistenceError);
      expect(map).toThrow(/invalid|could not be updated/i);
    }
  });
});
