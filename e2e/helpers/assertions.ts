import {
  expect,
  type Locator,
  type Page,
  type Response,
} from "@playwright/test";

type TextExpectation = string | RegExp;

type MutationOutcome = {
  success?: TextExpectation;
  error?: TextExpectation;
  url?: string | RegExp;
  visible?: Locator;
};

export async function expectSuccessState(
  page: Page,
  message: TextExpectation,
) {
  const status = page.getByRole("status").filter({ hasText: message });
  await expect(status).toBeVisible({ timeout: 30_000 });
  return status;
}

export async function expectErrorState(
  page: Page,
  message: TextExpectation,
) {
  const alert = page.getByRole("alert").filter({ hasText: message });
  await expect(alert).toBeVisible({ timeout: 30_000 });
  return alert;
}

function isExpectedServerActionResponse(targetUrl: URL, response: Response) {
  if (response.request().method() !== "POST") return false;
  if (!response.request().headers()["next-action"]) return false;

  try {
    const responseUrl = new URL(response.url());
    return (
      responseUrl.origin === targetUrl.origin &&
      responseUrl.pathname === targetUrl.pathname
    );
  } catch {
    return false;
  }
}

export async function clickAndWaitForMutation(
  page: Page,
  trigger: Locator,
  outcome: MutationOutcome,
) {
  const targetUrl = new URL(page.url());
  const responsePromise = page.waitForResponse((response) =>
    isExpectedServerActionResponse(targetUrl, response),
  );

  await trigger.click();
  const response = await responsePromise;
  expect(response.status()).toBeLessThan(500);

  if (outcome.url) {
    await page.waitForURL(outcome.url);
  }
  if (outcome.success) {
    await expectSuccessState(page, outcome.success);
  }
  if (outcome.error) {
    await expectErrorState(page, outcome.error);
  }
  if (outcome.visible) {
    await expect(outcome.visible).toBeVisible({ timeout: 30_000 });
  }

  return response;
}
