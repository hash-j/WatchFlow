import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { normalizeSourceNewlines } from "../testing/source-text";

const root = resolve(__dirname, "../..");
const source = (path: string) =>
  normalizeSourceNewlines(readFileSync(resolve(root, path), "utf8"));

const count = (text: string, needle: string) => text.split(needle).length - 1;

describe("v1 UI sweep: no duplicated layout content", () => {
  it("renders the public information footer once, from the root layout only", () => {
    const rootLayout = source("app/layout.tsx");
    const appLayout = source("app/(app)/layout.tsx");
    const settingsLayout = source("app/(app)/settings/layout.tsx");
    const publicLayout = source("app/(public)/layout.tsx");

    expect(count(rootLayout, "<PublicFooter />")).toBe(1);
    for (const layout of [appLayout, settingsLayout, publicLayout]) {
      expect(layout).not.toContain("PublicFooter");
      expect(layout).not.toContain("PublicInformationLinks");
    }
  });

  it("does not repeat the settings section links on the overview that lists them as cards", () => {
    const nav = source("components/settings/settings-nav.tsx");
    const layout = source("app/(app)/settings/layout.tsx");

    expect(nav).toContain('if (pathname === "/settings") return null;');
    // The two-column grid applies only when the section nav is rendered.
    expect(layout).toContain("lg:has-[>nav]:grid-cols-[14rem_minmax(0,1fr)]");
    expect(layout).not.toMatch(/lg:grid-cols-\[14rem/);
  });

  it("keeps settings section labels unbroken at tablet widths", () => {
    const nav = source("components/settings/settings-nav.tsx");

    expect(nav).toContain("sm:grid-cols-3 lg:grid-cols-1");
    expect(nav).not.toContain("sm:grid-cols-5");
  });

  it("shows the empty recommendations notice once, inside the empty state", () => {
    const page = source("app/(app)/recommendations/page.tsx");

    expect(page).toContain("{result.notice && result.sections.length > 0 ? (");
    expect(page).toContain("notice={result.notice}");
  });

  it("describes notification settings as live rather than future-only", () => {
    const overview = source("app/(app)/settings/page.tsx");

    expect(overview).not.toContain("future delivery");
    expect(overview).not.toContain("future notification choices");
  });
});

describe("v1 UI sweep: public header reflects the visitor's session", () => {
  it("streams a server-rendered header action instead of a fixed Log in link", () => {
    const layout = source("app/(public)/layout.tsx");
    const action = source("components/public-header-auth-action.tsx");

    expect(layout).toContain("<PublicHeaderAuthAction />");
    expect(layout).toContain("<Suspense fallback={<PublicHeaderSignInLink />}>");
    // The static shell must not hard-code the signed-out destination.
    expect(layout).not.toContain('href="/auth/login"');

    expect(action).toContain("hasAuthenticatedSession");
    expect(action).toContain('href="/auth/login"');
    expect(action).toContain("Log in");
    expect(action).toContain('href="/dashboard"');
    expect(action).toContain("Open WatchFlow");
    // Both states share one class string, so the swap cannot shift the header.
    expect(count(action, "className={linkClassName}")).toBe(2);
    expect(action).not.toContain('"use client"');
  });

  it("checks the session without redirecting or failing closed", () => {
    const helper = source("lib/auth/server.ts");

    expect(helper).toContain("export async function hasAuthenticatedSession()");
    expect(helper).toMatch(/hasAuthenticatedSession\(\)[\s\S]*?return false;\n  }\n}/);
  });
});

describe("v1 UI sweep: interactive controls look interactive", () => {
  it("styles the artwork file picker button like the CSV import picker", () => {
    const editor = source("components/artwork/artwork-editor.tsx");
    const importWizard = source("components/import/import-wizard.tsx");

    expect(importWizard).toContain("file:bg-muted");
    expect(editor).toContain("file:bg-muted");
    expect(editor).toContain("file:cursor-pointer");
  });
});
