import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  createOwnedCustomList: vi.fn(),
  updateOwnedCustomList: vi.fn(),
  deleteOwnedCustomList: vi.fn(),
  addOwnedMoviesToList: vi.fn(),
  moveOwnedCustomList: vi.fn(),
  moveOwnedListItem: vi.fn(),
  removeOwnedListMovie: vi.fn(),
  setOwnedMovieListMemberships: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/server", () => ({ after: (callback: () => void) => callback() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/lists/supabase-lists", () => ({
  createOwnedCustomList: mocks.createOwnedCustomList,
  updateOwnedCustomList: mocks.updateOwnedCustomList,
  deleteOwnedCustomList: mocks.deleteOwnedCustomList,
  addOwnedMoviesToList: mocks.addOwnedMoviesToList,
  moveOwnedCustomList: mocks.moveOwnedCustomList,
  moveOwnedListItem: mocks.moveOwnedListItem,
  removeOwnedListMovie: mocks.removeOwnedListMovie,
  setOwnedMovieListMemberships: mocks.setOwnedMovieListMemberships,
}));

import {
  addMoviesToListAction,
  createListAction,
  deleteListAction,
  moveListItemAction,
  moveCustomListAction,
  removeMovieFromListAction,
  setMovieListMembershipsAction,
  updateListAction,
} from "../../app/(app)/actions/lists";
import {
  ListsAuthenticationError,
  ListsConflictError,
  ListsMissingRpcError,
} from "./errors";
import { initialListActionState } from "./types";

const listId = "11111111-1111-4111-8111-111111111111";
const listMovieId = "22222222-2222-4222-8222-222222222222";
const userMovieId = "33333333-3333-4333-8333-333333333333";
const secondUserMovieId = "44444444-4444-4444-8444-444444444444";

const list = {
  id: listId,
  name: "Weekend Movies",
  description: null,
  visibility: "private" as const,
  createdAt: "2026-07-29T10:00:00.000Z",
  updatedAt: "2026-07-29T10:00:00.000Z",
};

function mutationResult(
  overrides: Record<string, unknown> = {},
) {
  return {
    success: true,
    reason: null,
    listId,
    moved: true,
    removed: true,
    finalPosition: 2,
    requested: 1,
    matched: 1,
    added: 1,
    removedCount: 0,
    skipped: 0,
    unchanged: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createOwnedCustomList.mockResolvedValue(list);
  mocks.updateOwnedCustomList.mockResolvedValue(list);
  mocks.deleteOwnedCustomList.mockResolvedValue(true);
  mocks.addOwnedMoviesToList.mockResolvedValue(mutationResult());
  mocks.moveOwnedCustomList.mockResolvedValue(mutationResult());
  mocks.moveOwnedListItem.mockResolvedValue(mutationResult());
  mocks.removeOwnedListMovie.mockResolvedValue(mutationResult());
  mocks.setOwnedMovieListMemberships.mockResolvedValue(mutationResult());
  mocks.redirect.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
});

describe("custom-list create, edit, and delete actions", () => {
  it("creates a trimmed list, revalidates private views, and redirects to it", async () => {
    const formData = new FormData();
    formData.set("name", "  Weekend   Movies ");
    formData.set("description", "  Friday night choices. ");
    formData.set("user_id", "browser-supplied-user");

    await expect(
      createListAction(initialListActionState, formData),
    ).rejects.toThrow(`NEXT_REDIRECT:/lists/${listId}?created=1`);

    expect(mocks.createOwnedCustomList).toHaveBeenCalledWith({
      name: "Weekend Movies",
      description: "Friday night choices.",
    });
    expect(mocks.createOwnedCustomList.mock.calls[0]?.[0]).not.toHaveProperty(
      "user_id",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/lists");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/lists/[listId]", "page");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/library/[movieId]", "page");
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(3);
  });

  it("returns field errors for a blank name without writing", async () => {
    const formData = new FormData();
    formData.set("name", "   ");
    formData.set("description", "");

    const result = await createListAction(initialListActionState, formData);

    expect(result).toMatchObject({
      status: "error",
      message: "Check the list details and try again.",
      requestId: 1,
    });
    expect(result.fieldErrors.name?.[0]).toBe("Enter a list name.");
    expect(mocks.createOwnedCustomList).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("maps a case-insensitive database name conflict to the name field", async () => {
    mocks.createOwnedCustomList.mockRejectedValue(new ListsConflictError());
    const formData = new FormData();
    formData.set("name", "weekend movies");
    formData.set("description", "");

    const result = await createListAction(initialListActionState, formData);

    expect(result.status).toBe("error");
    expect(result.message).toBe(
      "You already have a list with that name.",
    );
    expect(result.fieldErrors.name).toEqual([
      "You already have a list with that name.",
    ]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("updates only validated list fields and revalidates list memberships", async () => {
    const formData = new FormData();
    formData.set("listId", listId);
    formData.set("name", "  Best Thrillers ");
    formData.set("description", "  Tense favourites ");
    formData.set("visibility", "public");
    formData.set("user_id", "browser-supplied-user");

    const result = await updateListAction(initialListActionState, formData);

    expect(result).toMatchObject({
      status: "success",
      message: "List details saved.",
    });
    expect(mocks.updateOwnedCustomList).toHaveBeenCalledWith({
      listId,
      name: "Best Thrillers",
      description: "Tense favourites",
    });
    expect(mocks.updateOwnedCustomList.mock.calls[0]?.[0]).not.toHaveProperty(
      "visibility",
    );
    expect(mocks.updateOwnedCustomList.mock.calls[0]?.[0]).not.toHaveProperty(
      "user_id",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/lists");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/lists/[listId]", "page");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/library/[movieId]", "page");
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(3);
  });

  it("reports a stale or foreign list without claiming an update", async () => {
    mocks.updateOwnedCustomList.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("listId", listId);
    formData.set("name", "Weekend Movies");
    formData.set("description", "");

    const result = await updateListAction(initialListActionState, formData);

    expect(result).toMatchObject({
      status: "error",
      message: "This list is no longer available.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("maps a duplicate rename to the list-name field", async () => {
    mocks.updateOwnedCustomList.mockRejectedValue(new ListsConflictError());
    const formData = new FormData();
    formData.set("listId", listId);
    formData.set("name", "weekend movies");
    formData.set("description", "");

    const result = await updateListAction(initialListActionState, formData);

    expect(result.status).toBe("error");
    expect(result.message).toBe(
      "You already have a list with that name.",
    );
    expect(result.fieldErrors.name).toEqual([
      "You already have a list with that name.",
    ]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("requires the exact list name before deleting only that list", async () => {
    const invalid = new FormData();
    invalid.set("listId", listId);
    invalid.set("confirmation", "");

    const invalidResult = await deleteListAction(
      initialListActionState,
      invalid,
    );
    expect(invalidResult.status).toBe("error");
    expect(mocks.deleteOwnedCustomList).not.toHaveBeenCalled();

    const valid = new FormData();
    valid.set("listId", listId);
    valid.set("confirmation", "Weekend Movies");
    valid.set("user_id", "browser-supplied-user");

    await expect(
      deleteListAction(initialListActionState, valid),
    ).rejects.toThrow("NEXT_REDIRECT:/lists?deleted=1");

    expect(mocks.deleteOwnedCustomList).toHaveBeenCalledWith(
      listId,
      "Weekend Movies",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/lists");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/lists/[listId]", "page");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/library/[movieId]", "page");
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(3);
  });
});

describe("custom-list membership actions", () => {
  it("moves only a validated list-card identifier and revalidates list views", async () => {
    const formData = new FormData();
    formData.set("listId", listId);
    formData.set("direction", "up");
    formData.set("user_id", "browser-supplied-user");

    const result = await moveCustomListAction(
      initialListActionState,
      formData,
    );

    expect(mocks.moveOwnedCustomList).toHaveBeenCalledWith(listId, "up");
    expect(mocks.moveOwnedCustomList.mock.calls[0]).not.toContain(
      "browser-supplied-user",
    );
    expect(result).toMatchObject({
      status: "success",
      message: "List order saved.",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/lists");
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(1);
  });

  it("reports list-card order boundaries without treating them as failures", async () => {
    mocks.moveOwnedCustomList.mockResolvedValue(
      mutationResult({ moved: false, finalPosition: 1 }),
    );
    const formData = new FormData();
    formData.set("listId", listId);
    formData.set("direction", "up");

    const result = await moveCustomListAction(
      initialListActionState,
      formData,
    );

    expect(result).toMatchObject({
      status: "success",
      message: "This list is already first.",
    });
  });

  it("passes ordered user_movies IDs to one batch append and reports skips", async () => {
    mocks.addOwnedMoviesToList.mockResolvedValue(
      mutationResult({ requested: 2, matched: 2, added: 1, skipped: 1 }),
    );
    const formData = new FormData();
    formData.set("listId", listId);
    formData.append("userMovieIds", secondUserMovieId);
    formData.append("userMovieIds", userMovieId);
    formData.set("user_id", "browser-supplied-user");

    const result = await addMoviesToListAction(
      initialListActionState,
      formData,
    );

    expect(mocks.addOwnedMoviesToList).toHaveBeenCalledWith({
      listId,
      userMovieIds: [secondUserMovieId, userMovieId],
    });
    expect(result).toMatchObject({
      status: "success",
      message: "1 movie added. 1 already belongs to this list.",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/lists");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/lists/[listId]", "page");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/library/[movieId]", "page");
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(3);
  });

  it("keeps stale multi-add selections atomic and honest", async () => {
    mocks.addOwnedMoviesToList.mockResolvedValue(
      mutationResult({
        success: false,
        reason: "selection_changed",
        added: 0,
      }),
    );
    const formData = new FormData();
    formData.set("listId", listId);
    formData.append("userMovieIds", userMovieId);

    const result = await addMoviesToListAction(
      initialListActionState,
      formData,
    );

    expect(result).toMatchObject({
      status: "error",
      message:
        "Some selected movies are no longer in your library. No movies were added.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("reports first/last reorder no-ops without treating them as failures", async () => {
    mocks.moveOwnedListItem.mockResolvedValue(
      mutationResult({ moved: false, finalPosition: 1 }),
    );
    const formData = new FormData();
    formData.set("listMovieId", listMovieId);
    formData.set("direction", "up");

    const result = await moveListItemAction(
      initialListActionState,
      formData,
    );

    expect(mocks.moveOwnedListItem).toHaveBeenCalledWith(listMovieId, "up");
    expect(result).toMatchObject({
      status: "success",
      message: "This movie is already first.",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/lists");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/lists/[listId]", "page");
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(2);
  });

  it("removes only a list membership and states that the library movie remains", async () => {
    const formData = new FormData();
    formData.set("listMovieId", listMovieId);
    formData.set("movie_id", "975");
    formData.set("user_id", "browser-supplied-user");

    const result = await removeMovieFromListAction(
      initialListActionState,
      formData,
    );

    expect(mocks.removeOwnedListMovie).toHaveBeenCalledWith(listMovieId);
    expect(result).toMatchObject({
      status: "success",
      message: "Removed from this list. The movie remains in your library.",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/lists");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/lists/[listId]", "page");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/library/[movieId]", "page");
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(3);
  });

  it("supports removing all movie-detail memberships with an empty list selection", async () => {
    mocks.setOwnedMovieListMemberships.mockResolvedValue(
      mutationResult({ added: 0, removedCount: 2 }),
    );
    const formData = new FormData();
    formData.set("userMovieId", userMovieId);
    formData.set("movieId", "975");
    formData.set("user_id", "browser-supplied-user");

    const result = await setMovieListMembershipsAction(
      initialListActionState,
      formData,
    );

    expect(mocks.setOwnedMovieListMemberships).toHaveBeenCalledWith(
      userMovieId,
      [],
    );
    expect(result).toMatchObject({
      status: "success",
      message: "List memberships saved: 0 added, 2 removed.",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/lists");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/lists/[listId]", "page");
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(2);
  });
});

describe("custom-list action error safety", () => {
  it("shows an expired-session message without revalidating", async () => {
    mocks.addOwnedMoviesToList.mockRejectedValue(
      new ListsAuthenticationError(),
    );
    const formData = new FormData();
    formData.set("listId", listId);
    formData.append("userMovieIds", userMovieId);

    const result = await addMoviesToListAction(
      initialListActionState,
      formData,
    );

    expect(result).toMatchObject({
      status: "error",
      message: "Please sign in again.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("distinguishes a missing ordering RPC from an unknown database failure", async () => {
    const formData = new FormData();
    formData.set("listMovieId", listMovieId);
    formData.set("direction", "down");

    mocks.moveOwnedListItem.mockRejectedValueOnce(
      new ListsMissingRpcError(),
    );
    const missing = await moveListItemAction(
      initialListActionState,
      formData,
    );
    expect(missing.message).toContain(
      "202609240001_part_18b_priority_and_list_ordering.sql",
    );

    mocks.moveOwnedListItem.mockRejectedValueOnce(
      new Error("raw private database payload"),
    );
    const unknown = await moveListItemAction(
      initialListActionState,
      formData,
    );
    expect(unknown.message).toBe(
      "The custom list could not be updated. Please try again.",
    );
    expect(unknown.message).not.toContain("raw private");
  });
});
