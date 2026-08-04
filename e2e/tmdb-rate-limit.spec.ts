import type { Page, Request, TestInfo } from "@playwright/test";

import { test, expect } from "./fixtures/qa";
import {
  expectNoUnexpectedBrowserFailures,
} from "./helpers/diagnostics";
import { authenticatedQaGuard } from "./helpers/environment";

// These searches intentionally consume a real disposable development bucket.
// Real passwords must never be retained in a trace or video.
test.use({ trace: "off", video: "off" });

const UNIQUE_SEARCHES = [
  "Inception",
  "Arrival",
  "Alien",
  "Aliens",
  "Titanic",
  "Avatar",
  "Jaws",
  "Heat",
  "Memento",
  "Gladiator",
  "Amelie",
  "Parasite",
  "Whiplash",
  "Moonlight",
  "Casablanca",
  "Psycho",
  "Vertigo",
  "Goodfellas",
  "Chinatown",
  "Rocky",
  "Fargo",
  "Her",
  "Coco",
  "Up",
  "Soul",
  "Dune",
  "Barbie",
  "Oppenheimer",
  "Interstellar",
  "Tenet",
  "The Matrix",
] as const;

type SubmitMode = "click" | "double-click" | "enter";

function rateLimitE2eGuard() {
  if (!authenticatedQaGuard.enabled) return authenticatedQaGuard;
  if (process.env.RUN_TMDB_RATE_LIMIT_E2E !== "true") {
    return {
      enabled: false,
      reason: "set RUN_TMDB_RATE_LIMIT_E2E=true to authorize real searches",
    };
  }
  if (process.env.E2E_RATE_LIMIT_UI_BUCKETS_ARE_FRESH !== "true") {
    return {
      enabled: false,
      reason:
        "set E2E_RATE_LIMIT_UI_BUCKETS_ARE_FRESH=true after confirming fresh QA buckets",
    };
  }
  return { enabled: true, reason: "live rate-limit E2E guard satisfied" };
}

function matchesSearchRequest(request: Request, query: string) {
  const url = new URL(request.url());
  return (
    request.method() === "GET" &&
    url.pathname === "/search" &&
    url.searchParams.get("q") === query &&
    (request.resourceType() === "document" ||
      request.resourceType() === "fetch")
  );
}

function successfulSearchResult(page: Page) {
  return page
    .locator("article")
    .first()
    .or(page.getByText(/^No movies matched /));
}

function denialMessage(page: Page) {
  return page.getByText(
    /Too many movie requests\. (?:Try again in \d+ seconds\.|Wait a moment, then try again\.)/,
  );
}

function assertResponseContainsNoServerSecret(payload: string) {
  for (const name of [
    "SUPABASE_SECRET_KEY",
    "TMDB_READ_ACCESS_TOKEN",
    "E2E_USER_A_EMAIL",
    "E2E_USER_A_PASSWORD",
    "E2E_USER_B_EMAIL",
    "E2E_USER_B_PASSWORD",
  ]) {
    const value = process.env[name]?.trim();
    if (value && payload.includes(value)) {
      throw new Error("Search response exposed a configured server secret.");
    }
  }
}

async function stubPosterOptimization(page: Page) {
  const transparentPixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  await page.route("**/_next/image?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: transparentPixel,
    });
  });
}

async function submitSearch(
  page: Page,
  query: string,
  mode: SubmitMode,
) {
  const input = page.getByPlaceholder("Search by movie title");
  const button = page.getByRole("button", { name: "Search" });
  await input.fill(query);

  let matchingRequests = 0;
  let browserUserIdSent = false;
  const onRequest = (request: Request) => {
    if (!matchesSearchRequest(request, query)) return;

    matchingRequests += 1;
    const parameters = new URL(request.url()).searchParams;
    browserUserIdSent =
      browserUserIdSent ||
      parameters.has("user_id") ||
      parameters.has("userId");
  };
  page.on("request", onRequest);

  try {
    const responsePromise = page.waitForResponse((response) =>
      matchesSearchRequest(response.request(), query),
    );

    if (mode === "enter") {
      await input.press("Enter");
    } else if (mode === "double-click") {
      await button.dblclick();
    } else {
      await button.click();
    }

    const response = await responsePromise;
    await expect(page).toHaveURL((url) => {
      return url.pathname === "/search" && url.searchParams.get("q") === query;
    });
    await successfulSearchResult(page)
      .or(denialMessage(page))
      .first()
      .waitFor({ state: "visible" });
    await page.waitForTimeout(300);

    const payload = await response.text();
    assertResponseContainsNoServerSecret(payload);
    expect(matchingRequests).toBe(1);
    expect(browserUserIdSent).toBe(false);

    return response;
  } finally {
    page.off("request", onRequest);
  }
}

async function waitForReportedRetry(seconds: number) {
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 60) {
    throw new Error("The UI did not provide a safe limiter retry duration.");
  }

  const deadline = Date.now() + seconds * 1_000 + 1_500;
  while (Date.now() < deadline) {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(deadline - Date.now(), 5_000)),
    );
  }
}

async function attachSafeSummary(
  testInfo: TestInfo,
  summary: Record<string, number | string | boolean>,
) {
  await testInfo.attach("tmdb-rate-limit-summary", {
    body: Buffer.from(JSON.stringify(summary, null, 2), "utf8"),
    contentType: "application/json",
  });
}

function declareRateLimitE2eSuite() {
  test.describe.serial("development TMDB search rate limiting", () => {
    test.setTimeout(300_000);

    test(
      "blocks request 31, isolates QA User B, prevents duplicate submits, and recovers after expiry",
      async ({
        qaUserAPage,
        qaUserAAudit,
        qaUserBPage,
        qaUserBAudit,
      }, testInfo) => {
        await Promise.all([
          stubPosterOptimization(qaUserAPage),
          stubPosterOptimization(qaUserBPage),
        ]);
        await qaUserAPage.goto("/search");

        const modes: SubmitMode[] = [
          "click",
          "double-click",
          "enter",
          ...Array.from({ length: 27 }, () => "click" as const),
        ];

        for (let index = 0; index < 30; index += 1) {
          const response = await submitSearch(
            qaUserAPage,
            UNIQUE_SEARCHES[index],
            modes[index],
          );
          expect(response.status()).toBe(200);
          await expect(successfulSearchResult(qaUserAPage)).toBeVisible();
        }

        const blockedResponse = await submitSearch(
          qaUserAPage,
          UNIQUE_SEARCHES[30],
          "click",
        );
        expect(blockedResponse.status()).toBe(200);
        const message = denialMessage(qaUserAPage);
        await expect(message).toBeVisible();

        const visiblePage = await qaUserAPage.locator("body").innerText();
        const exposedInternalValue =
          /watchflow_take_tmdb_rate_limit|postgres(?:ql)?|sqlstate|bearer\s+[a-z0-9._-]+|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(
            visiblePage,
          );
        if (exposedInternalValue) {
          throw new Error("Blocked search UI exposed an internal value.");
        }

        await qaUserBPage.goto("/search");
        const userBResponse = await submitSearch(
          qaUserBPage,
          "Blade Runner",
          "click",
        );
        expect(userBResponse.status()).toBe(200);
        await expect(successfulSearchResult(qaUserBPage)).toBeVisible();

        const beforeEditOnly = qaUserAPage.url();
        let editOnlyRequests = 0;
        const onEditOnlyRequest = (request: Request) => {
          const url = new URL(request.url());
          if (
            request.method() === "GET" &&
            url.pathname === "/search" &&
            url.searchParams.has("q")
          ) {
            editOnlyRequests += 1;
          }
        };
        qaUserAPage.on("request", onEditOnlyRequest);
        const queryInput = qaUserAPage.getByPlaceholder(
          "Search by movie title",
        );
        try {
          await queryInput.fill("A query edit without submission");
          await queryInput.fill("A second query edit without submission");
          await qaUserAPage.waitForTimeout(300);
          expect(qaUserAPage.url()).toBe(beforeEditOnly);
          expect(editOnlyRequests).toBe(0);
        } finally {
          qaUserAPage.off("request", onEditOnlyRequest);
        }

        const denialText = await message.innerText();
        const retryMatch = denialText.match(/(\d+) seconds/);
        expect(retryMatch).not.toBeNull();
        const retryAfterSeconds = Number(retryMatch?.[1]);
        await waitForReportedRetry(retryAfterSeconds);

        const recoveredResponse = await submitSearch(
          qaUserAPage,
          "Blade Runner 2049",
          "click",
        );
        expect(recoveredResponse.status()).toBe(200);
        await expect(successfulSearchResult(qaUserAPage)).toBeVisible();

        const expectedDevelopmentDiagnostics = {
          allowedCategories: ["development-cache-diagnostics"],
        } as const;
        expectNoUnexpectedBrowserFailures(
          qaUserAAudit,
          expectedDevelopmentDiagnostics,
        );
        expectNoUnexpectedBrowserFailures(
          qaUserBAudit,
          expectedDevelopmentDiagnostics,
        );
        await attachSafeSummary(testInfo, {
          allowed_searches_before_denial: 30,
          first_denied_request: 31,
          denial_application_status: blockedResponse.status(),
          duplicate_requests_per_submit: 1,
          qa_user_b_search_allowed: true,
          retry_after_seconds: retryAfterSeconds,
          search_after_expiry_allowed: true,
        });
      },
    );
  });
}

const guard = rateLimitE2eGuard();
if (guard.enabled) {
  declareRateLimitE2eSuite();
} else {
  test.describe.skip(
    `development TMDB search rate limiting [guarded: ${guard.reason}]`,
    declareRateLimitE2eSuite,
  );
}
