import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Part 16F-B Batch 4 Settings and export contracts", () => {
  it("removes the Settings-only TMDB language control", () => {
    const preferences = source("components/settings/preferences-form.tsx");
    const onboarding = source("components/onboarding/personalize-form.tsx");

    expect(preferences).not.toContain("preferred-language");
    expect(preferences).not.toContain('name="preferredLanguage"');
    expect(onboarding).toContain('name="preferredLanguage"');
  });

  it("keeps exports as direct private attachment route handlers", () => {
    const controls = source("components/settings/data-controls.tsx");
    const csv = source("app/(app)/settings/data/export/csv/route.ts");
    const json = source("app/(app)/settings/data/export/json/route.ts");

    expect(controls).toContain('href="/settings/data/export/csv" download');
    expect(controls).toContain('href="/settings/data/export/json" download');
    for (const route of [csv, json]) {
      expect(route).toContain("export async function GET()");
      expect(route).toContain("Content-Disposition");
      expect(route).toContain("private, no-store, max-age=0");
      expect(route).toContain("authenticateSettings()");
    }
  });
});
