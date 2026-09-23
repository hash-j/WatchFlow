import type { Page } from "@playwright/test";

import { test, expect } from "./fixtures/qa";
import { clickAndWaitForMutation } from "./helpers/assertions";
import { expectNoUnexpectedBrowserFailures } from "./helpers/diagnostics";
import {
  authenticatedQaGuard,
  getOnboardingMovieQueries,
} from "./helpers/environment";
import { createQaList, deleteQaList } from "./helpers/lists";
import {
  addControlledMovie,
  removeControlledMovie,
  type ControlledMovie,
} from "./helpers/movies";

test.use({ trace: "off", video: "off" });

type QueueSnapshot = Array<{ title: string; position: number }>;

async function queueSnapshot(page: Page): Promise<QueueSnapshot> {
  const rows = page.locator("ol > li");
  const items: QueueSnapshot = [];

  for (let index = 0; index < (await rows.count()); index += 1) {
    const row = rows.nth(index);
    const title = (
      await row.locator("a[href^='/library/']").first().innerText()
    ).trim();
    const match = (await row.innerText()).match(/Position\s+(\d+)/);
    if (!match) throw new Error(`Queue position is missing for ${title}.`);
    items.push({ title, position: Number(match[1]) });
  }

  return items;
}

function expectContiguousQueue(queue: QueueSnapshot) {
  const positions = queue.map((item) => item.position);
  expect(new Set(positions).size).toBe(positions.length);
  expect(positions).toEqual(
    Array.from({ length: positions.length }, (_, index) => index + 1),
  );
}

async function expectRelativeQueueOrder(
  page: Page,
  earlierTitle: string,
  laterTitle: string,
) {
  await expect
    .poll(async () => {
      const queue = await queueSnapshot(page);
      const earlierIndex = queue.findIndex(
        (item) => item.title === earlierTitle,
      );
      const laterIndex = queue.findIndex((item) => item.title === laterTitle);
      return (
        earlierIndex >= 0 && laterIndex >= 0 && earlierIndex < laterIndex
      );
    })
    .toBe(true);
}

async function setMovieStatus(
  page: Page,
  movie: ControlledMovie,
  status: "watch_next" | "want_to_watch",
) {
  await page.goto(`/library?q=${encodeURIComponent(movie.title)}`);
  const item = page.locator(`article[data-tmdb-id="${movie.tmdbId}"]`);
  await expect(item).toBeVisible();
  await item.getByRole("link").first().click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: movie.title,
      exact: true,
    }),
  ).toBeVisible();
  await page.locator('select[name="status"]:visible').selectOption(status);
  await clickAndWaitForMutation(
    page,
    page.getByRole("button", { name: "Save changes" }),
    { success: "Movie details saved." },
  );
}

async function setQueuePriority(
  page: Page,
  title: string,
  priority: number,
) {
  const row = page
    .locator("ol > li")
    .filter({ has: page.getByRole("link", { name: title, exact: true }) });
  await row.locator('select[name="priority"]').selectOption(String(priority));
  await clickAndWaitForMutation(
    page,
    row.getByRole("button", { name: "Save priority" }),
    {
      visible: row
        .getByRole("status")
        .filter({ hasText: /Priority set to .* Queue reordered\./ }),
    },
  );
}

function queueRow(page: Page, title: string) {
  return page
    .locator("ol > li")
    .filter({ has: page.getByRole("link", { name: title, exact: true }) });
}

function listCard(page: Page, name: string) {
  return page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
}

async function expectRelativeListOrder(page: Page, expectedNames: string[]) {
  await expect
    .poll(() =>
      page.locator("article").evaluateAll(
        (cards, names) =>
          cards.flatMap((card) => {
            const heading = card.querySelector("h2")?.textContent?.trim();
            return heading && names.includes(heading) ? [heading] : [];
          }),
        expectedNames,
      ),
    )
    .toEqual(expectedNames);
}

async function moveListCard(
  page: Page,
  name: string,
  direction: "earlier" | "later",
) {
  const card = listCard(page, name);
  await clickAndWaitForMutation(
    page,
    card.getByRole("button", {
      name: `Move ${name} ${direction} in your lists`,
    }),
    {
      visible: card
        .getByRole("status")
        .filter({ hasText: "List order saved." }),
    },
  );
}

async function renameListCard(
  page: Page,
  list: { id: string; name: string },
  nextName: string,
) {
  const card = listCard(page, list.name);
  await card.getByRole("button", { name: `Edit ${list.name}` }).click();

  const dialog = page.getByRole("dialog", { name: "Edit list" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("List name").fill(nextName);
  await dialog
    .getByLabel("Description")
    .fill("Renamed during controlled Part 18B acceptance");
  await clickAndWaitForMutation(
    page,
    dialog.getByRole("button", { name: "Save changes" }),
    { success: "List details saved." },
  );

  list.name = nextName;
}

function declarePart18bQa() {
  test.describe("Part 18B priority and list-card ordering browser QA", () => {
    test("persists priority-aware queue order and saved custom-list card order", async ({
      qaUserAPage,
      qaUserAAudit,
      qaUserBPage,
      qaUserBAudit,
    }) => {
      test.setTimeout(240_000);
      const controlledMovies: ControlledMovie[] = [];
      const createdLists: Array<{ id: string; name: string }> = [];
      const nonce = Date.now();

      await qaUserAPage.goto("/watch-next");
      const otherUserQueueBefore = await queueSnapshot(qaUserAPage);

      try {
        for (const query of getOnboardingMovieQueries()) {
          const movie = await addControlledMovie(qaUserBPage, query);
          controlledMovies.push(movie);
          test.skip(
            !movie.addedByTest,
            `The controlled movie ${movie.title} already existed, so this QA run will not mutate it.`,
          );
          await setMovieStatus(qaUserBPage, movie, "watch_next");
        }

        const [firstMovie, secondMovie] = controlledMovies;
        await qaUserBPage.goto("/watch-next");
        await setQueuePriority(qaUserBPage, firstMovie.title, 5);
        await setQueuePriority(qaUserBPage, secondMovie.title, 4);

        let queue = await queueSnapshot(qaUserBPage);
        expectContiguousQueue(queue);
        await expectRelativeQueueOrder(
          qaUserBPage,
          firstMovie.title,
          secondMovie.title,
        );
        await expect(queueRow(qaUserBPage, firstMovie.title)).toContainText(
          "Must Watch priority",
        );
        await expect(queueRow(qaUserBPage, secondMovie.title)).toContainText(
          "High priority",
        );

        await setQueuePriority(qaUserBPage, secondMovie.title, 5);
        const secondRow = queueRow(qaUserBPage, secondMovie.title);
        await clickAndWaitForMutation(
          qaUserBPage,
          secondRow.getByRole("button", {
            name: "Move movie earlier in the queue",
          }),
          { success: "Queue order updated." },
        );

        queue = await queueSnapshot(qaUserBPage);
        expectContiguousQueue(queue);
        await expectRelativeQueueOrder(
          qaUserBPage,
          secondMovie.title,
          firstMovie.title,
        );

        await setQueuePriority(qaUserBPage, secondMovie.title, 4);
        queue = await queueSnapshot(qaUserBPage);
        expectContiguousQueue(queue);
        await expectRelativeQueueOrder(
          qaUserBPage,
          firstMovie.title,
          secondMovie.title,
        );

        await setQueuePriority(qaUserBPage, secondMovie.title, 5);
        await clickAndWaitForMutation(
          qaUserBPage,
          queueRow(qaUserBPage, secondMovie.title).getByRole("button", {
            name: "Move movie earlier in the queue",
          }),
          { success: "Queue order updated." },
        );

        await qaUserBPage.reload();
        queue = await queueSnapshot(qaUserBPage);
        expectContiguousQueue(queue);
        await expectRelativeQueueOrder(
          qaUserBPage,
          secondMovie.title,
          firstMovie.title,
        );

        await setMovieStatus(qaUserBPage, firstMovie, "want_to_watch");
        await qaUserBPage.goto("/watch-next");
        queue = await queueSnapshot(qaUserBPage);
        expectContiguousQueue(queue);
        await expect(
          qaUserBPage.getByRole("link", { name: firstMovie.title, exact: true }),
        ).toHaveCount(0);

        await removeControlledMovie(qaUserBPage, secondMovie);
        secondMovie.addedByTest = false;
        await qaUserBPage.goto("/watch-next");
        queue = await queueSnapshot(qaUserBPage);
        expectContiguousQueue(queue);
        await expect(
          qaUserBPage.getByRole("link", { name: secondMovie.title, exact: true }),
        ).toHaveCount(0);

        const firstList = await createQaList(
          qaUserBPage,
          `Part 18B first ${nonce}`,
        );
        createdLists.push(firstList);
        const secondList = await createQaList(
          qaUserBPage,
          `Part 18B second ${nonce}`,
        );
        createdLists.push(secondList);
        const thirdList = await createQaList(
          qaUserBPage,
          `Part 18B third ${nonce}`,
        );
        createdLists.push(thirdList);

        await qaUserBPage.goto("/lists");
        await expectRelativeListOrder(qaUserBPage, [
          firstList.name,
          secondList.name,
          thirdList.name,
        ]);

        await moveListCard(qaUserBPage, secondList.name, "earlier");
        await expectRelativeListOrder(qaUserBPage, [
          secondList.name,
          firstList.name,
          thirdList.name,
        ]);
        await moveListCard(qaUserBPage, secondList.name, "later");
        await moveListCard(qaUserBPage, thirdList.name, "earlier");

        await qaUserBPage.reload();
        await expectRelativeListOrder(qaUserBPage, [
          firstList.name,
          thirdList.name,
          secondList.name,
        ]);

        const renamedThirdList = `Part 18B renamed ${nonce}`;
        await renameListCard(qaUserBPage, thirdList, renamedThirdList);
        await qaUserBPage.reload();
        await expectRelativeListOrder(qaUserBPage, [
          firstList.name,
          thirdList.name,
          secondList.name,
        ]);

        await deleteQaList(qaUserBPage, thirdList);
        createdLists.splice(createdLists.indexOf(thirdList), 1);
        await expectRelativeListOrder(qaUserBPage, [
          firstList.name,
          secondList.name,
        ]);
        await moveListCard(qaUserBPage, secondList.name, "earlier");
        await qaUserBPage.reload();
        await expectRelativeListOrder(qaUserBPage, [
          secondList.name,
          firstList.name,
        ]);
        await moveListCard(qaUserBPage, secondList.name, "later");

        await qaUserAPage.reload();
        expect(await queueSnapshot(qaUserAPage)).toEqual(otherUserQueueBefore);
      } finally {
        for (const list of [...createdLists].reverse()) {
          await deleteQaList(qaUserBPage, list);
        }
        for (const movie of [...controlledMovies].reverse()) {
          await removeControlledMovie(qaUserBPage, movie);
        }
      }

      expectNoUnexpectedBrowserFailures(qaUserAAudit, {
        allowedCategories: ["aborted", "next-image-lcp-advice"],
      });
      expectNoUnexpectedBrowserFailures(qaUserBAudit, {
        allowedCategories: ["aborted", "next-image-lcp-advice"],
      });
    });
  });
}

if (authenticatedQaGuard.enabled) {
  declarePart18bQa();
} else {
  test.describe.skip(
    `Part 18B browser QA [guarded: ${authenticatedQaGuard.reason}]`,
    declarePart18bQa,
  );
}
