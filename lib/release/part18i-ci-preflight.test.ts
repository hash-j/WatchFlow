import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  PART18I_SCHEMA_PROBES,
  Part18iPreflightError,
  validatePart18iEnvironment,
  verifyPart18iCiTarget,
} from "../../scripts/verify-part18i-ci-target.mjs";

function environment(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
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
    WATCHFLOW_SCHEDULER_SECRET: "s".repeat(32),
    ...overrides,
  };
}

describe("Part 18I CI target preflight", () => {
  it("maps the guarded development secrets to the variables consumed by CI", () => {
    const workflow = readFileSync(
      join(process.cwd(), ".github/workflows/part18i-live-acceptance.yml"),
      "utf8",
    );
    expect(workflow).toContain("environment: watchflow-dev");
    expect(workflow).toContain("E2E_TARGET_ENV: development");
    expect(workflow).toContain(
      "E2E_EXPECTED_SUPABASE_PROJECT_REF: ckwadpmvxieekjlsfcks",
    );
    expect(workflow).toContain(
      "NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.WATCHFLOW_DEV_SUPABASE_URL }}",
    );
    expect(workflow).toContain(
      "SUPABASE_SECRET_KEY: ${{ secrets.WATCHFLOW_DEV_SUPABASE_SECRET_KEY }}",
    );
    expect(workflow).toContain(
      "WATCHFLOW_SCHEDULER_SECRET: ${{ secrets.WATCHFLOW_DEV_SCHEDULER_SECRET }}",
    );
    expect(workflow).toContain(
      "E2E_USER_A_EMAIL: ${{ secrets.WATCHFLOW_DEV_QA_USER_A_EMAIL }}",
    );
    expect(workflow).toContain(
      "E2E_USER_B_EMAIL: ${{ secrets.WATCHFLOW_DEV_QA_USER_B_EMAIL }}",
    );
  });

  it("fails closed for missing or weak scheduler authentication", () => {
    expect(() =>
      validatePart18iEnvironment(environment({ WATCHFLOW_SCHEDULER_SECRET: "" })),
    ).toThrowError(/missing environment variable WATCHFLOW_SCHEDULER_SECRET/);
    expect(() =>
      validatePart18iEnvironment(environment({ WATCHFLOW_SCHEDULER_SECRET: "short" })),
    ).toThrowError(/at least 32 characters/);
  });

  it("fails before a request when the target is not pinned development", () => {
    expect(() =>
      validatePart18iEnvironment(
        environment({ NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" }),
      ),
    ).toThrowError(/wrong Supabase project/);
  });

  it("probes exact Part 18I relations and RPCs with only the server credential", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/rest/v1/") {
        return Response.json({
          paths: {
            "/rpc/watchflow_claim_scheduled_reminders": {},
            "/rpc/watchflow_finalize_scheduled_reminder": {},
          },
        });
      }
      return new Response("[]", { status: 200 });
    });
    await verifyPart18iCiTarget({ environment: environment(), fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(PART18I_SCHEMA_PROBES.length + 1);
    for (const [index, [relation, columns]] of PART18I_SCHEMA_PROBES.entries()) {
      const [url, init] = fetchImpl.mock.calls[index]!;
      const parsed = new URL(String(url));
      expect(parsed.hostname).toBe("developmentref.supabase.co");
      expect(parsed.pathname).toBe(`/rest/v1/${relation}`);
      expect(parsed.searchParams.get("select")).toBe(columns);
      expect(parsed.searchParams.get("limit")).toBe("0");
      expect(init?.headers).toEqual({ Accept: "application/json", apikey: "server-secret-value" });
      expect(init?.headers).not.toHaveProperty("Authorization");
    }
    const [openApiUrl, openApiInit] =
      fetchImpl.mock.calls[PART18I_SCHEMA_PROBES.length]!;
    expect(new URL(String(openApiUrl)).pathname).toBe("/rest/v1/");
    expect(openApiInit?.headers).toEqual({
      Accept: "application/openapi+json",
      apikey: "server-secret-value",
    });
  });

  it("fails when an exact claim/finalize RPC is absent from the schema", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      return url.pathname === "/rest/v1/"
        ? Response.json({ paths: {} })
        : new Response("[]", { status: 200 });
    });
    await expect(
      verifyPart18iCiTarget({ environment: environment(), fetchImpl }),
    ).rejects.toThrowError(/required Part 18I RPC/);
  });

  it.each([
    [401, "authentication failure"],
    [403, "permission failure"],
    [400, "missing Part 18I column"],
    [404, "is unavailable"],
    [503, "REST service returned a server failure"],
  ])("reports HTTP %i without response bodies or credential values", async (status, reason) => {
    const fetchImpl = vi.fn(async () =>
      new Response("sensitive provider response", { status }),
    );
    const result = verifyPart18iCiTarget({ environment: environment(), fetchImpl });
    await expect(result).rejects.toThrowError(reason);
    await expect(result).rejects.not.toThrowError(
      /sensitive provider response|server-secret-value/,
    );
  });

  it("reports a sanitized network failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("private request details");
    });
    await expect(
      verifyPart18iCiTarget({ environment: environment(), fetchImpl }),
    ).rejects.toEqual(
      new Part18iPreflightError(
        "network failure while contacting the pinned watchflow-dev project.",
      ),
    );
  });
});
