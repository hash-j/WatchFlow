import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

function source(relativePath: string) {
  return readFileSync(resolve(repositoryRoot, relativePath), "utf8");
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }

    return /\.(?:ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts")
      ? [path]
      : [];
  });
}

describe("Part 13 route and private navigation contracts", () => {
  it("keeps both list routes and their loading/not-found boundaries", () => {
    for (const relativePath of [
      "app/(app)/lists/page.tsx",
      "app/(app)/lists/loading.tsx",
      "app/(app)/lists/[listId]/page.tsx",
      "app/(app)/lists/[listId]/loading.tsx",
      "app/(app)/lists/[listId]/not-found.tsx",
    ]) {
      expect(
        existsSync(resolve(repositoryRoot, relativePath)),
        relativePath,
      ).toBe(true);
    }

    expect(source("app/(app)/lists/page.tsx")).toContain(
      "getCustomListSummaries()",
    );
    expect(source("app/(app)/lists/[listId]/page.tsx")).toContain(
      "listUuidSchema.safeParse(rawListId)",
    );
    expect(source("app/(app)/lists/[listId]/page.tsx")).toContain(
      "notFound()",
    );
  });

  it("adds canonical Lists navigation and proxy protection", () => {
    const navigation = source("components/app-navigation.tsx");
    const proxy = source("lib/supabase/proxy.ts");
    const authRoutes = source("lib/auth/routes.test.ts");

    expect(navigation).toContain(
      '{ href: "/lists", label: "Lists", icon: ListPlus }',
    );
    expect(proxy).toContain('"/lists"');
    expect(authRoutes).toContain('"/lists"');
    expect(authRoutes).toContain(
      '"/lists/11111111-1111-4111-8111-111111111111"',
    );
  });

  it("shows private state, counts, descriptions, and useful empty examples", () => {
    const page = source("app/(app)/lists/page.tsx");
    const detail = source("app/(app)/lists/[listId]/page.tsx");
    const card = source("components/lists/list-card.tsx");

    expect(page).toContain('title="Lists"');
    expect(page).toContain("custom collections");
    expect(page).toContain("lists.length");
    expect(page).toContain(
      "You have not created any Lists yet.",
    );
    for (const example of [
      "Weekend Movies",
      "Best Thrillers",
      "Family Favourites",
    ]) {
      expect(page).toContain(example);
    }

    expect(card).toContain("Private");
    expect(card).toContain("{list.movieCount}");
    expect(card).toContain("Last updated");
    expect(card).toContain("ListPosterCollage");
    expect(card).toContain("ListSummaryOrderControls");
    expect(page).toContain("isFirst={index === 0}");
    expect(page).toContain("isLast={index === lists.length - 1}");
    expect(detail).toContain("Private");
    expect(detail).toContain("data.movies.length");
    expect(detail).toContain("This list is empty");
    expect(detail).toContain("A movie can");
    expect(detail).toContain("belong to");
    expect(detail).toContain("several Lists.");
  });
});

describe("Part 13 dialog accessibility and destructive-copy contracts", () => {
  it("uses labelled native modal dialogs and restores focus to each trigger", () => {
    const sharedDialog = source("components/ui/responsive-dialog.tsx");

    expect(sharedDialog).toContain("<dialog");
    expect(sharedDialog).toContain("100svh");
    for (const relativePath of [
      "components/lists/create-list-dialog.tsx",
      "components/lists/edit-list-dialog.tsx",
      "components/lists/delete-list-dialog.tsx",
      "components/lists/add-movies-dialog.tsx",
      "components/lists/remove-list-movie-dialog.tsx",
    ]) {
      const contents = source(relativePath);

      expect(contents, relativePath).toContain("<ResponsiveDialog");
      expect(contents, relativePath).toContain("aria-labelledby=");
      expect(contents, relativePath).toContain("aria-describedby=");
      expect(contents, relativePath).toContain("showModal()");
      expect(contents, relativePath).toContain(
        "useRef<HTMLButtonElement>(null)",
      );
      expect(contents, relativePath).toContain(
        "triggerRef.current?.focus()",
      );
    }
  });

  it("requires named list confirmation and promises membership-only deletion", () => {
    const listDelete = source("components/lists/delete-list-dialog.tsx");
    const movieRemove = source(
      "components/lists/remove-list-movie-dialog.tsx",
    );

    expect(listDelete).toContain('name="confirmation"');
    expect(listDelete).toContain("{list.name}");
    expect(listDelete).toContain(
      "Deleting this list will not remove movies from your library.",
    );
    expect(listDelete).toContain('name="listId"');
    expect(listDelete).not.toContain('name="user_id"');

    expect(movieRemove).toContain(
      "This removes only the membership",
    );
    for (const retainedState of [
      "rating",
      "review",
      "status",
      "queue position",
      "schedule",
      "personal library",
    ]) {
      expect(movieRemove).toContain(retainedState);
    }
    expect(movieRemove).toContain('name="listMovieId"');
    expect(movieRemove).not.toContain('name="userMovieId"');
  });
});

describe("Part 13 personal-library picker contracts", () => {
  it("supports capped private-library search, status/favourite filters, and ordered multiselect", () => {
    const picker = source("components/lists/add-movies-dialog.tsx");
    const adapter = source("lib/lists/supabase-lists.ts");

    expect(picker).toContain('role="search"');
    expect(picker).toContain('name="listQuery"');
    expect(picker).toContain('name="listStatus"');
    expect(picker).toContain('name="listFavourite"');
    expect(picker).toContain(
      'placeholder="Title, director, cast, or genre"',
    );
    expect(picker).toContain("Search results are capped at 50.");
    expect(adapter).toContain(".range(0, 49)");
    expect(adapter).toContain('"watchflow_library_rows"');

    expect(picker).toContain("useState<Set<string>>(new Set())");
    expect(picker).toContain("orderedSelectedIds");
    expect(picker).toContain("candidate.userMovieId");
    expect(picker).toContain('name="userMovieIds"');
    expect(picker).toContain("Add Selected Movies");
    expect(picker).toContain("selected");
    expect(picker).not.toContain('name="movieIds"');
    expect(picker).not.toContain('name="user_id"');
  });

  it("labels and disables already-added personal movies without submitting duplicates", () => {
    const picker = source("components/lists/add-movies-dialog.tsx");

    expect(picker).toContain("candidate.alreadyAdded");
    expect(picker).toContain("disabled={candidate.alreadyAdded}");
    expect(picker).toContain("Already in list");
    expect(picker).toContain(
      "Every displayed movie already belongs to this list.",
    );
    expect(picker).toContain(
      ".filter((candidate) => !candidate.alreadyAdded)",
    );
    expect(picker).toContain("MovieStatusBadge");
    expect(picker).toContain("candidate.favourite");
    expect(picker).toContain("Favourite");
  });
});

describe("Part 13 ordered list-item and movie-detail contracts", () => {
  it("keeps saved list-card ordering distinct from existing movie ordering", () => {
    const card = source("components/lists/list-card.tsx");
    const controls = source("components/lists/list-summary-order-controls.tsx");

    expect(card).toContain("ListSummaryOrderControls");
    expect(controls).toContain('name="listId"');
    expect(controls).toContain('name="direction"');
    expect(controls).toContain("already first in your lists");
    expect(controls).toContain("already last in your lists");
    expect(controls).toContain("disabled={isPending || isFirst}");
    expect(controls).toContain("disabled={isPending || isLast}");
  });

  it("shows text positions, status, personal rating, favourite, and accessible boundary controls", () => {
    const row = source("components/lists/list-movie-row.tsx");
    const controls = source("components/lists/list-order-controls.tsx");

    expect(row).toContain("Position {displayPosition}");
    expect(row).toContain("MovieStatusBadge");
    expect(row).toContain("Your rating: {item.personalRating}/10");
    expect(row).toContain("Not rated");
    expect(row).toContain("item.favourite");
    expect(row).toContain("Favourite");
    expect(row).toContain("isFirst={isFirst}");
    expect(row).toContain("isLast={isLast}");

    expect(controls).toContain("disabled={disabled || isPending || isFirst}");
    expect(controls).toContain("disabled={disabled || isPending || isLast}");
    expect(controls).toContain("already first in this list");
    expect(controls).toContain("already last in this list");
    expect(controls).toContain('name="listMovieId"');
    expect(controls).toContain('name="direction"');
  });

  it("uses user_movies.id for movie-detail memberships and allows multi-list removal", () => {
    const detail = source("app/(app)/library/[movieId]/page.tsx");
    const memberships = source(
      "components/lists/movie-list-memberships-form.tsx",
    );

    expect(detail).toContain(
      "getMovieListMemberships(userMovieId)",
    );
    expect(detail).toContain("userMovieId={item.libraryId}");
    expect(detail).not.toContain(
      "userMovieId={movie.id}",
    );
    expect(detail).toContain("Custom Lists");

    expect(memberships).toContain('name="userMovieId"');
    expect(memberships).toContain("value={userMovieId}");
    expect(memberships).toContain('name="listIds"');
    expect(memberships).toContain("selectedIds");
    expect(memberships).toContain("type=\"checkbox\"");
    expect(memberships).toContain(
      "Add or remove this movie from any of your private collections.",
    );
    expect(memberships).toContain("Existing list order is preserved.");
    expect(memberships).toContain('href="/lists?create=1"');
  });
});

describe("Part 13 private-data and cross-feature regression contracts", () => {
  it("keeps list code free of admin clients, browser persistence, and public metadata", () => {
    const files = [
      ...sourceFiles(resolve(repositoryRoot, "app/(app)/lists")),
      ...sourceFiles(resolve(repositoryRoot, "components/lists")),
      ...sourceFiles(resolve(repositoryRoot, "lib/lists")),
    ];
    const combined = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    for (const forbidden of [
      "createAdminClient",
      "service_role",
      "localStorage",
      "sessionStorage",
      "generateMetadata",
      "export const metadata",
      'visibility: "public"',
      "tmdb-provider",
    ]) {
      expect(combined).not.toContain(forbidden);
    }

    expect(source("lib/lists/supabase-lists.ts")).toContain(
      'import "server-only"',
    );
  });

  it("revalidates lists after existing library, management, and data-deletion mutations", () => {
    const libraryActions = source("app/(app)/actions/library.ts");
    const managementActions = source("app/(app)/actions/management.ts");
    const settingsActions = source("app/(app)/settings/actions.ts");
    const revalidation = source("lib/revalidation/private-data.ts");

    expect(libraryActions).toContain("revalidateLibraryDerivedViews");
    expect(managementActions).toContain("revalidateLibraryDerivedViews");
    expect(settingsActions).toContain("revalidateLibraryDerivedViews");
    expect(revalidation).toContain('revalidatePath("/lists")');
    expect(revalidation).toContain('["/lists/[listId]", "page"]');
  });
});
