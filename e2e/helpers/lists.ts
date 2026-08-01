import { expect, type Page } from "@playwright/test";

import { clickAndWaitForMutation } from "./assertions";

export async function createQaList(
  page: Page,
  name: string,
  description = "Controlled Playwright QA data",
) {
  await page.goto("/lists");
  await page
    .getByRole("button", { name: "Create a custom movie list" })
    .first()
    .click();

  const dialog = page.getByRole("dialog", {
    name: "Create a custom list",
  });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("List name").fill(name);
  await dialog.getByLabel("Description").fill(description);

  await clickAndWaitForMutation(
    page,
    dialog.getByRole("button", { name: "Create List" }),
    {
      url: /\/lists\/[0-9a-f-]+\?created=1$/i,
      visible: page.getByRole("heading", { level: 1, name }),
    },
  );

  const listId = new URL(page.url()).pathname.split("/").at(-1);
  if (!listId) {
    throw new Error("The controlled QA list was created without a route ID.");
  }

  return { id: listId, name };
}

export async function deleteQaList(
  page: Page,
  list: { id: string; name: string },
) {
  await page.goto(`/lists/${list.id}`);
  await page
    .getByRole("button", { name: `Delete ${list.name}` })
    .click();

  const dialog = page.getByRole("dialog", {
    name: new RegExp(`^Delete .*${escapeRegExp(list.name)}`, "i"),
  });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/Type .* to confirm/i).fill(list.name);

  await clickAndWaitForMutation(
    page,
    dialog.getByRole("button", { name: "Delete List" }),
    {
      url: /\/lists\?deleted=1$/,
      success: /List deleted/,
    },
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
