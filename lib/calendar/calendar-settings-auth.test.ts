import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/auth", () => ({
  getAuthContext: mocks.getAuthContext,
}));
vi.mock("@/components/settings/calendar-settings", () => ({
  CalendarSettings: ({ connection }: { connection: unknown }) =>
    createElement(
      "div",
      { "data-calendar-settings": connection ? "connected" : "empty" },
      "Calendar settings",
    ),
}));

import CalendarSettingsPage from "@/app/(app)/settings/calendar/page";

const root = resolve(import.meta.dirname, "../..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

function authenticatedContext(connection: Record<string, unknown> | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: connection, error: null });
  const secondEq = vi.fn(() => ({ maybeSingle }));
  const firstEq = vi.fn(() => ({ eq: secondEq }));
  const select = vi.fn(() => ({ eq: firstEq }));
  const from = vi.fn(() => ({ select }));

  return {
    context: {
      user: { id: "11111111-1111-4111-8111-111111111111", email: "qa@example.invalid" },
      profile: null,
      profileLoadFailed: false,
      profileName: null,
      client: { from },
    },
    from,
    select,
    firstEq,
    secondEq,
  };
}

describe("calendar settings authentication boundary", () => {
  beforeEach(() => {
    mocks.getAuthContext.mockReset();
  });

  it("renders for the authenticated request-scoped context", async () => {
    const query = authenticatedContext({
      display_email: "calendar@example.invalid",
      sync_enabled: true,
      status: "connected",
    });
    mocks.getAuthContext.mockResolvedValue(query.context);

    const page = await CalendarSettingsPage({
      searchParams: Promise.resolve({}),
    });
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain("Manage the Google account WatchFlow");
    expect(markup).toContain('data-calendar-settings="connected"');
    expect(mocks.getAuthContext).toHaveBeenCalledOnce();
    expect(query.from).toHaveBeenCalledWith("calendar_connections");
    expect(query.firstEq).toHaveBeenCalledWith(
      "user_id",
      query.context.user.id,
    );
    expect(query.secondEq).toHaveBeenCalledWith("provider", "google");
  });

  it("propagates the authenticated context's login redirect for anonymous requests", async () => {
    const redirectError = new Error("NEXT_REDIRECT:/auth/login");
    mocks.getAuthContext.mockRejectedValue(redirectError);

    await expect(
      CalendarSettingsPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toBe(redirectError);
  });

  it("cannot re-enter the public login gate after authenticated layout access", () => {
    const page = source("app/(app)/settings/calendar/page.tsx");
    const layout = source("app/(app)/layout.tsx");
    const settingsLayout = source("app/(app)/settings/layout.tsx");
    const publicGate = source("lib/auth/server.ts");

    expect(page).toContain("await getAuthContext()");
    expect(layout).toContain("await getAuthContext()");
    expect(settingsLayout).toContain("await getAuthContext()");
    expect(page).not.toContain("authenticateSettings");
    expect(page).not.toContain('redirect("/auth/login")');
    expect(publicGate).toContain('if (authenticated) redirect("/dashboard")');
  });

  it("retains fresh user validation on sensitive calendar boundaries", () => {
    const actions = source("app/(app)/settings/calendar/actions.ts");
    const oauthStart = source("app/api/calendar/google/start/route.ts");
    const oauthCallback = source("app/api/calendar/google/callback/route.ts");
    const settingsAuth = source("lib/settings/supabase-settings.ts");

    expect(actions).toContain("authenticateSettings()");
    expect(actions).toContain("deleteGoogleCalendarConnection(session.user.id)");
    expect(oauthStart).toContain("supabase.auth.getUser()");
    expect(oauthCallback).toContain("supabase.auth.getUser()");
    expect(settingsAuth).toContain("client.auth.getUser()");
  });
});
