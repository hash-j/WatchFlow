import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/sign-up-form", async () => {
  const { createElement: element } = await import("react");
  return {
    SignUpForm: () =>
      element("form", { "data-auth-form": "sign-up" }, "Sign up"),
  };
});
vi.mock("@/components/login-form", async () => {
  const { createElement: element } = await import("react");
  return {
    LoginForm: () =>
      element("form", { "data-auth-form": "login" }, "Login"),
  };
});
vi.mock("@/components/forgot-password-form", async () => {
  const { createElement: element } = await import("react");
  return {
    ForgotPasswordForm: () =>
      element(
        "form",
        { "data-auth-form": "forgot-password" },
        "Reset password",
      ),
  };
});

import ForgotPasswordPage from "../../app/auth/forgot-password/page";
import LoginPage from "../../app/auth/login/page";
import SignUpPage from "../../app/auth/sign-up/page";
import { isProtectedRoute } from "../supabase/proxy";

const repositoryRoot = process.cwd();

function source(relativePath: string) {
  return readFileSync(join(repositoryRoot, relativePath), "utf8");
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : /\.(?:ts|tsx)$/.test(entry)
        ? [path]
        : [];
  });
}

describe("critical authentication route contracts", () => {
  it("keeps the canonical sign-up page and renders the existing form", () => {
    const path = join(repositoryRoot, "app/auth/sign-up/page.tsx");
    expect(existsSync(path)).toBe(true);
    expect(renderToStaticMarkup(createElement(SignUpPage))).toContain(
      'data-auth-form="sign-up"',
    );
    expect(source("app/auth/sign-up/page.tsx")).not.toContain("notFound(");
  });

  it("keeps login and forgot-password pages renderable", () => {
    expect(renderToStaticMarkup(createElement(LoginPage))).toContain(
      'data-auth-form="login"',
    );
    expect(renderToStaticMarkup(createElement(ForgotPasswordPage))).toContain(
      'data-auth-form="forgot-password"',
    );
  });

  it("keeps reset-password, dashboard, and both callback route options", () => {
    for (const relativePath of [
      "app/auth/reset-password/page.tsx",
      "app/auth/callback/route.ts",
      "app/auth/confirm/route.ts",
      "app/(app)/dashboard/page.tsx",
    ]) {
      expect(existsSync(join(repositoryRoot, relativePath)), relativePath).toBe(
        true,
      );
    }
  });

  it("keeps public auth routes outside proxy protection and /import inside it", () => {
    for (const route of [
      "/auth/login",
      "/auth/sign-up",
      "/auth/forgot-password",
      "/auth/reset-password",
      "/auth/callback",
      "/auth/confirm",
    ]) {
      expect(isProtectedRoute(route), route).toBe(false);
    }
    expect(isProtectedRoute("/import")).toBe(true);
    expect(isProtectedRoute("/settings")).toBe(true);
    expect(isProtectedRoute("/settings/profile")).toBe(true);
  });

  it("uses the existing Supabase signup callback", () => {
    const form = source("components/sign-up-form.tsx");
    expect(form).toContain("supabase.auth.signUp(");
    expect(form).toContain("/auth/callback?next=/dashboard");
    expect(existsSync(join(repositoryRoot, "app/auth/callback/route.ts"))).toBe(
      true,
    );
  });

  it("uses only /auth/sign-up as the signup URL", () => {
    const files = ["app", "components", "lib"]
      .flatMap((directory) => sourceFiles(join(repositoryRoot, directory)))
      .filter((path) => !path.endsWith("routes.test.ts"));
    const combined = files.map((path) => readFileSync(path, "utf8")).join("\n");

    for (const forbidden of [
      '"/auth/signup',
      '"/signup',
      '"/auth/register',
      '"/register',
    ]) {
      expect(combined).not.toContain(forbidden);
    }
    expect(combined).toContain('"/auth/sign-up"');
  });
});
