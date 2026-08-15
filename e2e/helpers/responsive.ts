import { expect, type Locator, type Page } from "@playwright/test";

export type ViewportSize = { width: number; height: number };

type BoundaryViolation = {
  descriptor: string;
  left: number;
  right: number;
  width: number;
};

export async function expectNoPageOverflow(page: Page) {
  const measurement = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(
    measurement.scrollWidth,
    `Document overflowed by ${measurement.scrollWidth - measurement.clientWidth}px`,
  ).toBeLessThanOrEqual(measurement.clientWidth);
}

export async function findViewportBoundaryViolations(page: Page) {
  return page.evaluate(() => {
    const tolerance = 1;
    const viewportWidth = document.documentElement.clientWidth;

    function descriptor(element: Element) {
      const htmlElement = element as HTMLElement;
      const label =
        htmlElement.getAttribute("aria-label") ||
        htmlElement.getAttribute("title") ||
        htmlElement.getAttribute("data-testid");
      const id = htmlElement.id ? `#${CSS.escape(htmlElement.id)}` : "";
      const classes = Array.from(htmlElement.classList)
        .filter((name) => !name.includes("[") && !name.includes(":"))
        .slice(0, 2)
        .map((name) => `.${CSS.escape(name)}`)
        .join("");

      return label
        ? `${htmlElement.tagName.toLowerCase()}[${label.slice(0, 80)}]`
        : `${htmlElement.tagName.toLowerCase()}${id}${classes}`;
    }

    return Array.from(document.body.querySelectorAll("*"))
      .filter((element) => {
        if (element.closest('[data-horizontal-scroll="approved"]')) {
          return false;
        }

        const htmlElement = element as HTMLElement;
        const style = getComputedStyle(htmlElement);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          Number(style.opacity) === 0 ||
          htmlElement.hidden
        ) {
          return false;
        }

        const rect = htmlElement.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        return rect.left < -tolerance || rect.right > viewportWidth + tolerance;
      })
      .slice(0, 20)
      .map((element): BoundaryViolation => {
        const rect = (element as HTMLElement).getBoundingClientRect();
        return {
          descriptor: descriptor(element),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      });
  });
}

export async function expectElementsWithinViewport(page: Page) {
  const violations = await findViewportBoundaryViolations(page);
  expect(
    violations,
    "Visible elements extended beyond the viewport outside an approved data-scroll region",
  ).toEqual([]);
}

export async function expectResponsivePage(page: Page) {
  await expectNoPageOverflow(page);
  await expectElementsWithinViewport(page);
}

export async function expectDialogFitsViewport(
  page: Page,
  dialog: Locator = page.getByRole("dialog"),
) {
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();

  expect(box, "Dialog must have a measurable visible box").not.toBeNull();
  expect(viewport, "Page must have a configured viewport").not.toBeNull();
  if (!box || !viewport) return;

  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

export async function expectFormsFitViewport(page: Page) {
  const fit = await page.locator("form").evaluateAll((forms) =>
    forms.every((form) => {
      const rect = form.getBoundingClientRect();
      return rect.left >= -1 && rect.right <= document.documentElement.clientWidth + 1;
    }),
  );
  expect(fit, "Every visible form should fit the document viewport").toBe(true);
}
