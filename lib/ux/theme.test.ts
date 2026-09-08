import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

function source(relativePath: string) {
  return readFileSync(join(repositoryRoot, relativePath), "utf8");
}

describe("Part 16F-A cinema theme foundation", () => {
  it("defines the requested light and dark palettes through shared tokens", () => {
    const css = source("app/globals.css");

    expect(css).toContain("--background: 0 0% 98.039216%");
    expect(css).toContain("--foreground: 220.909091 39.285714% 10.980392%");
    expect(css).toContain("--card: 0 0% 100%");
    expect(css).toContain("--border: 220 13.043478% 90.980392%");
    expect(css).toContain("--primary: 0 0% 7.843137%");
    expect(css).toContain("--sidebar: 0 0% 7.843137%");
    expect(css).toContain("--rating: 46.968326 91.701245% 52.745098%");

    const darkTheme = css.slice(css.indexOf(".dark {"));
    expect(darkTheme).toContain("--background: 0 0% 7.058824%");
    expect(darkTheme).toContain("--foreground: 0 0% 96.078431%");
    expect(darkTheme).toContain("--card: 0 0% 11.764706%");
    expect(darkTheme).toContain("--border: 0 0% 17.254902%");
    expect(darkTheme).toContain(
      "--primary: 46.968326 91.701245% 52.745098%",
    );
    expect(darkTheme).toContain("--sidebar: 0 0% 0%");
  });

  it("exposes surface, sidebar, and rating tokens through Tailwind", () => {
    const config = source("tailwind.config.ts");

    for (const token of [
      "--surface",
      "--surface-elevated",
      "--sidebar",
      "--sidebar-foreground",
      "--sidebar-muted",
      "--sidebar-active",
      "--rating",
      "--rating-foreground",
    ]) {
      expect(config, token).toContain(token);
    }
  });

  it("uses a restrained active sidebar indicator instead of a large block", () => {
    const navigation = source("components/app-navigation.tsx");
    const shell = source("components/app-shell.tsx");
    const mobile = source("components/mobile-app-navigation.tsx");

    expect(navigation).toContain("border-l-2 border-transparent");
    expect(navigation).toContain("border-sidebar-active");
    expect(navigation).toContain("text-sidebar-active");
    expect(navigation).not.toContain(
      'current && "bg-accent text-accent-foreground"',
    );
    expect(shell).toContain("bg-sidebar text-sidebar-foreground");
    expect(mobile).toContain("bg-sidebar");
  });

  it("keeps rating, empty-state, and semantic status treatments distinct", () => {
    const rating = source("components/movies/movie-rating.tsx");
    const emptyState = source("components/ui/responsive-layout.tsx");
    const statuses = source("lib/library/status-visuals.ts");

    expect(rating).toContain("bg-rating");
    expect(rating).toContain("text-rating-foreground");
    expect(rating).toContain("fill-current");
    expect(rating).not.toContain("amber");
    expect(emptyState).toContain("Clapperboard");
    expect(emptyState).toContain("bg-rating text-rating-foreground");

    expect(statuses).toContain("bg-emerald-50");
    expect(statuses).toContain("bg-amber-50");
    expect(statuses).toContain("bg-red-50");
  });

  it("preserves hydration-safe system, light, and dark theme switching", () => {
    const layout = source("app/layout.tsx");
    const switcher = source("components/theme-switcher.tsx");

    expect(layout).toContain("suppressHydrationWarning");
    expect(layout).toContain('attribute="class"');
    expect(layout).toContain('defaultTheme="system"');
    expect(layout).toContain("disableTransitionOnChange");
    expect(switcher).toContain("useSyncExternalStore");
    expect(switcher).toContain('value="light"');
    expect(switcher).toContain('value="dark"');
    expect(switcher).toContain('value="system"');
  });
});
