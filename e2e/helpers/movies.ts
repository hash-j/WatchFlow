import { expect, type Page } from "@playwright/test";

import { clickAndWaitForMutation } from "./assertions";

export type ControlledMovie = {
  title: string;
  tmdbId: number;
  addedByTest: boolean;
};

export async function addControlledMovie(
  page: Page,
  query: string,
): Promise<ControlledMovie> {
  await page.goto("/search");
  await page.getByPlaceholder("Search by movie title").fill(query);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/search" && url.searchParams.has("q")),
    page.getByRole("button", { name: "Search" }).click(),
  ]);

  const result = page.locator("article").first();
  await expect(result).toBeVisible();
  const heading = result.getByRole("heading", { level: 2 });
  const title = (await heading.innerText()).trim();
  const rawTmdbId = await result.getAttribute("data-tmdb-id");
  const tmdbId = Number(rawTmdbId);
  if (!title) {
    throw new Error("TMDB returned a controlled QA result without a title.");
  }
  if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
    throw new Error("TMDB returned a controlled QA result without a valid ID.");
  }

  const addButton = result.getByRole("button", { name: "Add to Library" });
  if ((await addButton.count()) === 0) {
    await expect(
      result.getByRole("button", { name: "Already in your Library" }),
    ).toBeDisabled();
    return { title, tmdbId, addedByTest: false };
  }

  await clickAndWaitForMutation(page, addButton, {
    success: /(?:Added to your library|already in your library)/,
  });

  const message = await result.getByRole("status").innerText();
  return {
    title,
    tmdbId,
    addedByTest: message.includes("Added to your library."),
  };
}

export async function removeControlledMovie(
  page: Page,
  movie: ControlledMovie,
) {
  if (!movie.addedByTest) return;

  await page.goto(`/library?q=${encodeURIComponent(movie.title)}`);
  const item = page.locator(
    `article[data-tmdb-id="${movie.tmdbId}"]`,
  );
  await expect(item).toBeVisible();
  await item.getByRole("link").first().click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: movie.title,
      exact: true,
    }),
  ).toBeVisible();

  await page
    .getByRole("button", {
      name: `Remove ${movie.title} from your library`,
      exact: true,
    })
    .click();
  await clickAndWaitForMutation(
    page,
    page.getByRole("button", { name: "Yes, remove" }),
    {
      url: /\/library(?:\?.*)?$/,
      visible: page.getByRole("heading", { level: 1, name: "Library" }),
    },
  );
}
