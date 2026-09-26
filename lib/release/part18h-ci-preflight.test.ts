import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  PART18H_COLUMNS,
  Part18hPreflightError,
  validatePart18hEnvironment,
  verifyPart18hCiTarget,
} from "../../scripts/verify-part18h-ci-target.mjs";

function environment(
  overrides: Record<string, string> = {},
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    E2E_TARGET_ENV: "development",
    E2E_EXPECTED_SUPABASE_PROJECT_REF: "developmentref",
    NEXT_PUBLIC_SUPABASE_URL: "https://developmentref.supabase.co",
    E2E_EXPECTED_SUPABASE_URL: "https://developmentref.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-value",
    SUPABASE_SECRET_KEY: "server-secret-value",
    TMDB_READ_ACCESS_TOKEN: "tmdb-server-value",
    E2E_USER_A_EMAIL: "qa-a@example.test",
    E2E_USER_A_PASSWORD: "qa-a-password",
    E2E_USER_B_EMAIL: "qa-b@example.test",
    E2E_USER_B_PASSWORD: "qa-b-password",
    ...overrides,
  };
}

describe("Part 18H CI target preflight", () => {
  it("maps every GitHub Environment secret to the variable consumed by CI", () => {
    const workflow = readFileSync(
      join(process.cwd(), ".github/workflows/part18h-live-acceptance.yml"),
      "utf8",
    );

    expect(workflow).toContain(
      "NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.WATCHFLOW_DEV_SUPABASE_URL }}",
    );
    expect(workflow).toContain(
      "E2E_EXPECTED_SUPABASE_URL: ${{ secrets.WATCHFLOW_DEV_SUPABASE_URL }}",
    );
    expect(workflow).toContain(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.WATCHFLOW_DEV_SUPABASE_PUBLISHABLE_KEY }}",
    );
    expect(workflow).toContain(
      "SUPABASE_SECRET_KEY: ${{ secrets.WATCHFLOW_DEV_SUPABASE_SECRET_KEY }}",
    );
    expect(workflow).toContain(
      "TMDB_READ_ACCESS_TOKEN: ${{ secrets.WATCHFLOW_DEV_TMDB_READ_ACCESS_TOKEN }}",
    );
    expect(workflow).toContain(
      "E2E_USER_A_EMAIL: ${{ secrets.WATCHFLOW_DEV_QA_USER_A_EMAIL }}",
    );
    expect(workflow).toContain(
      "E2E_USER_A_PASSWORD: ${{ secrets.WATCHFLOW_DEV_QA_USER_A_PASSWORD }}",
    );
    expect(workflow).toContain(
      "E2E_USER_B_EMAIL: ${{ secrets.WATCHFLOW_DEV_QA_USER_B_EMAIL }}",
    );
    expect(workflow).toContain(
      "E2E_USER_B_PASSWORD: ${{ secrets.WATCHFLOW_DEV_QA_USER_B_PASSWORD }}",
    );
    expect(workflow).toContain("E2E_TARGET_ENV: development");
    expect(workflow).toContain(
      "E2E_EXPECTED_SUPABASE_PROJECT_REF: ckwadpmvxieekjlsfcks",
    );
  });

  it("fails before a request when a required variable is missing", () => {
    expect(() =>
      validatePart18hEnvironment(environment({ SUPABASE_SECRET_KEY: "" })),
    ).toThrowError(
      "Part 18H CI preflight failed: missing environment variable SUPABASE_SECRET_KEY.",
    );
  });

  it("fails before a request when the project is not the pinned development project", () => {
    expect(() =>
      validatePart18hEnvironment(
        environment({ NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" }),
      ),
    ).toThrowError(/wrong Supabase project/);
  });

  it("uses only the development server secret for zero-row column probes", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response("[]", { status: 200 }),
    );

    await verifyPart18hCiTarget({
      environment: environment(),
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(PART18H_COLUMNS.length);
    for (const [index, column] of PART18H_COLUMNS.entries()) {
      const [url, init] = fetchImpl.mock.calls[index]!;
      const parsed = new URL(String(url));
      expect(parsed.hostname).toBe("developmentref.supabase.co");
      expect(parsed.pathname).toBe("/rest/v1/user_preferences");
      expect(parsed.searchParams.get("select")).toBe(column);
      expect(parsed.searchParams.get("limit")).toBe("0");
      expect(init?.headers).toEqual({
        Accept: "application/json",
        apikey: "server-secret-value",
      });
      expect(init?.headers).not.toHaveProperty("Authorization");
    }
  });

  it.each([
    [401, "authentication failure"],
    [403, "permission failure"],
    [400, `missing Part 18H column ${PART18H_COLUMNS[0]}`],
    [404, "user_preferences is unavailable"],
    [503, "REST service returned a server failure"],
  ])("reports HTTP %i without response bodies or credential values", async (status, reason) => {
    const fetchImpl = vi.fn(async () =>
      new Response("sensitive provider response", { status }),
    );

    const result = verifyPart18hCiTarget({
      environment: environment(),
      fetchImpl,
    });
    await expect(result).rejects.toThrowError(reason);
    await expect(result).rejects.not.toThrowError(
      /sensitive provider response|server-secret-value/,
    );
  });

  it("reports a sanitized network failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("getaddrinfo included private request details");
    });

    await expect(
      verifyPart18hCiTarget({ environment: environment(), fetchImpl }),
    ).rejects.toEqual(
      new Part18hPreflightError(
        "network failure while contacting the pinned watchflow-dev project.",
      ),
    );
  });
});
