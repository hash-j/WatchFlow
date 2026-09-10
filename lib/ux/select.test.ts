import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { Select } from "@/components/ui/select";

const repositoryRoot = process.cwd();

function source(relativePath: string) {
  return readFileSync(join(repositoryRoot, relativePath), "utf8");
}

const migratedConsumers = [
  "components/discovery/movie-picker.tsx",
  "components/import/import-wizard.tsx",
  "components/library/library-controls.tsx",
  "components/library/library-selection-workspace.tsx",
  "components/lists/add-movies-dialog.tsx",
  "components/movies/movie-management-form.tsx",
  "components/movies/schedule-movie-form.tsx",
  "components/onboarding/personalize-form.tsx",
  "components/settings/notification-settings-form.tsx",
  "components/settings/preferences-form.tsx",
] as const;

describe("shared native Select", () => {
  it("renders native semantics and forwards consumer form props", () => {
    const onChange = vi.fn();
    const markup = renderToStaticMarkup(
      createElement(
        Select,
        {
          name: "status",
          defaultValue: "watched",
          disabled: true,
          "aria-invalid": true,
          onChange,
        },
        createElement("option", { value: "saved" }, "Saved"),
        createElement("option", { value: "watched" }, "Watched"),
      ),
    );

    expect(markup).toContain("<select");
    expect(markup).toContain('name="status"');
    expect(markup).toContain("disabled");
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('value="watched" selected=""');
    expect(markup).toContain('data-slot="select-chevron"');
    expect(markup).toContain('aria-hidden="true"');
  });

  it("reserves space for a pointer-safe, deliberately inset chevron", () => {
    const select = source("components/ui/select.tsx");

    expect(select).toContain("appearance-none");
    expect(select).toContain("pr-10");
    expect(select).toContain("right-3");
    expect(select).toContain("pointer-events-none");
    expect(select).toContain("top-1/2");
    expect(select).toContain("-translate-y-1/2");
  });

  it("keeps shared focus, disabled, invalid, and 44px touch states", () => {
    const select = source("components/ui/select.tsx");

    expect(select).toContain("min-h-11");
    expect(select).toContain("focus-visible:border-ring");
    expect(select).toContain("focus-visible:ring-4");
    expect(select).toContain("disabled:cursor-not-allowed");
    expect(select).toContain("peer-disabled:opacity-50");
    expect(select).toContain("aria-[invalid=true]:border-destructive");
  });

  it("is the only user-facing native select implementation", () => {
    for (const consumer of migratedConsumers) {
      const contents = source(consumer);
      expect(contents, consumer).toContain('from "@/components/ui/select"');
      expect(contents, consumer).not.toContain("<select");
      expect(contents, consumer).not.toContain("selectClassName");
    }

    const component = source("components/ui/select.tsx");
    expect(component.match(/<select/g)).toHaveLength(1);
  });

  it("uses semantic native option themes and preserves selected text color", () => {
    const css = source("app/globals.css");
    const selectionRule = css.slice(
      css.indexOf("::selection"),
      css.indexOf("select,", css.indexOf("::selection")),
    );

    expect(css).toContain("color-scheme: light");
    expect(css).toContain("color-scheme: dark");
    expect(css).toContain("background-color: hsl(var(--surface))");
    expect(css).toContain("color: hsl(var(--foreground))");
    expect(selectionRule).toContain("bg-primary/20");
    expect(selectionRule).not.toContain("text-foreground");
  });
});
