import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadLocalTestEnvironment } from "./local-environment.mjs";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("local QA environment loading", () => {
  it("keeps application configuration authoritative and reads the final QA declaration", () => {
    const directory = mkdtempSync(join(tmpdir(), "watchflow-environment-"));
    temporaryDirectories.push(directory);

    writeFileSync(
      join(directory, ".env.local"),
      [
        "NEXT_PUBLIC_SUPABASE_URL=https://application.example.test",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=application-public-key",
      ].join("\n"),
    );
    writeFileSync(
      join(directory, ".env.test.local"),
      [
        "NEXT_PUBLIC_SUPABASE_URL=https://placeholder.example.test",
        "E2E_TARGET_ENV=",
        "E2E_TARGET_ENV=development",
        "E2E_EXPECTED_SUPABASE_URL=https://expected.example.test",
      ].join("\n"),
    );

    const environment: NodeJS.ProcessEnv = { NODE_ENV: "test" };
    loadLocalTestEnvironment(environment, directory);

    expect(environment).toMatchObject({
      NEXT_PUBLIC_SUPABASE_URL: "https://application.example.test",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "application-public-key",
      E2E_TARGET_ENV: "development",
      E2E_EXPECTED_SUPABASE_URL: "https://expected.example.test",
    });
  });

  it("does not override an explicit non-empty shell or CI value", () => {
    const directory = mkdtempSync(join(tmpdir(), "watchflow-environment-"));
    temporaryDirectories.push(directory);
    writeFileSync(
      join(directory, ".env.local"),
      "NEXT_PUBLIC_SUPABASE_URL=https://local.example.test\n",
    );

    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      NEXT_PUBLIC_SUPABASE_URL: "https://ci.example.test",
    };
    loadLocalTestEnvironment(environment, directory);

    expect(environment.NEXT_PUBLIC_SUPABASE_URL).toBe(
      "https://ci.example.test",
    );
  });
});
