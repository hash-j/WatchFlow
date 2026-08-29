import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/server", () => ({
  redirectAuthenticatedUser: vi.fn().mockResolvedValue(undefined),
}));
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
import { AuthShell } from "../../components/auth/auth-shell";
import { LoginForm } from "../../components/login-form";
import { SignUpForm } from "../../components/sign-up-form";
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
  it("keeps the canonical sign-up page and renders the existing form", async () => {
    const path = join(repositoryRoot, "app/auth/sign-up/page.tsx");
    expect(existsSync(path)).toBe(true);
    expect(SignUpPage()).toBeTruthy();
    expect(
      renderToStaticMarkup(
        createElement(AuthShell, null, createElement(SignUpForm)),
      ),
    ).toContain(
      'data-auth-form="sign-up"',
    );
    expect(source("app/auth/sign-up/page.tsx")).not.toContain("notFound(");
  });

  it("keeps login and forgot-password pages renderable", async () => {
    expect(LoginPage()).toBeTruthy();
    expect(
      renderToStaticMarkup(
        createElement(AuthShell, null, createElement(LoginForm)),
      ),
    ).toContain(
      'data-auth-form="login"',
    );
    expect(renderToStaticMarkup(createElement(ForgotPasswordPage))).toContain(
      'data-auth-form="forgot-password"',
    );
  });

  it("isolates public auth request data behind focused Suspense boundaries", () => {
    expect(source("next.config.ts")).toContain("cacheComponents: true");

    const gatedPages = {
      "app/auth/login/page.tsx": "LoginForm",
      "app/auth/sign-up/page.tsx": "SignUpForm",
      "app/auth/verify-email/page.tsx": "VerifyEmailContent",
    };

    for (const [relativePath, contentComponent] of Object.entries(gatedPages)) {
      const page = source(relativePath);
      expect(page, relativePath).toContain('import { Suspense } from "react"');
      expect(page, relativePath).toContain(
        "fallback={<AuthSessionFallback />}",
      );
      expect(page, relativePath).toMatch(
        new RegExp(
          `<Suspense[\\s\\S]*?<PublicAuthGate>[\\s\\S]*?<${contentComponent} \\/>[\\s\\S]*?<\\/PublicAuthGate>[\\s\\S]*?<\\/Suspense>`,
        ),
      );
      expect(page, relativePath).not.toContain(
        "await redirectAuthenticatedUser()",
      );
    }

    const gate = source("components/auth/public-auth-gate.tsx");
    expect(gate).toContain('import "server-only"');
    expect(gate).toContain("await redirectAuthenticatedUser()");

    const authServer = source("lib/auth/server.ts");
    const supabaseServer = source("lib/supabase/server.ts");
    expect(authServer).toContain("const supabase = await createClient()");
    expect(authServer).toContain("supabase.auth.getClaims()");
    expect(supabaseServer).toContain("const cookieStore = await cookies()");

    const updatePassword = source("app/auth/update-password/page.tsx");
    expect(updatePassword).toMatch(
      /<Suspense[\s\S]*?<UpdatePasswordContent \/>[\s\S]*?<\/Suspense>/,
    );

    const authError = source("app/auth/error/page.tsx");
    expect(authError).toMatch(
      /<Suspense[\s\S]*?<ErrorContent searchParams=\{searchParams\} \/>[\s\S]*?<\/Suspense>/,
    );

    const forgotPassword = source("app/auth/forgot-password/page.tsx");
    expect(forgotPassword).not.toMatch(
      /cookies\(|headers\(|searchParams|createClient|getClaims|getUser/,
    );
  });

  it("keeps server-only auth and request APIs out of Client Components", () => {
    const clientFiles = ["app", "components"]
      .flatMap((directory) => sourceFiles(join(repositoryRoot, directory)))
      .filter((path) => /^\s*["']use client["'];/.test(readFileSync(path, "utf8")));

    for (const path of clientFiles) {
      const content = readFileSync(path, "utf8");
      expect(content, path).not.toMatch(
        /(?:@\/lib\/(?:supabase\/(?:server|admin)|auth\/(?:server|pending-verification))|next\/headers|@\/components\/auth\/public-auth-gate)/,
      );
    }
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

  it("keeps public auth routes outside proxy protection and canonical app routes inside it", () => {
    for (const route of [
      "/auth/login",
      "/auth/sign-up",
      "/auth/verify-email",
      "/auth/forgot-password",
      "/auth/reset-password",
      "/auth/callback",
      "/auth/confirm",
    ]) {
      expect(isProtectedRoute(route), route).toBe(false);
    }
    for (const route of [
      "/dashboard",
      "/onboarding",
      "/search",
      "/library",
      "/library/42",
      "/lists",
      "/lists/11111111-1111-4111-8111-111111111111",
      "/picker",
      "/recommendations",
      "/statistics",
      "/watch-next",
      "/schedule",
      "/import",
      "/settings",
      "/settings/profile",
      "/settings/preferences",
      "/settings/notifications",
      "/settings/data",
    ]) {
      expect(isProtectedRoute(route), route).toBe(true);
    }
  });

  it("uses server-side signup and keeps legacy callback routes", () => {
    const form = source("components/sign-up-form.tsx");
    const actions = source("lib/auth/actions.ts");
    expect(form).toContain("signUpAction");
    expect(actions).toContain("supabase.auth.signUp(");
    expect(actions).toContain('redirect("/auth/verify-email")');
    expect(actions).toContain("supabase.auth.verifyOtp({");
    expect(actions).toContain('type: "email"');
    expect(existsSync(join(repositoryRoot, "app/auth/callback/route.ts"))).toBe(
      true,
    );
  });

  it("preserves password login and link-based password recovery", () => {
    expect(source("components/login-form.tsx")).toContain(
      "supabase.auth.signInWithPassword",
    );
    const forgotPassword = source("components/forgot-password-form.tsx");
    expect(forgotPassword).toContain("supabase.auth.resetPasswordForEmail");
    expect(forgotPassword).toContain(
      "/auth/callback?next=/auth/update-password",
    );
    expect(source("components/update-password-form.tsx")).toContain(
      "supabase.auth.updateUser",
    );
  });

  it("keeps authentication headings and mutation feedback accessible", () => {
    expect(source("components/ui/card.tsx")).toContain(
      'as?: "h1" | "h2" | "h3"',
    );

    for (const relativePath of [
      "components/login-form.tsx",
      "components/forgot-password-form.tsx",
      "components/update-password-form.tsx",
    ]) {
      const form = source(relativePath);
      expect(form, relativePath).toContain('as="h1"');
      expect(form, relativePath).toContain('role="alert"');
    }

    expect(source("components/forgot-password-form.tsx")).toContain(
      'role="status"',
    );
  });

  it("maps browser authentication failures to controlled copy", () => {
    for (const relativePath of [
      "components/login-form.tsx",
      "components/forgot-password-form.tsx",
      "components/update-password-form.tsx",
    ]) {
      const form = source(relativePath);
      expect(form, relativePath).toContain("getControlledAuthErrorMessage");
      expect(form, relativePath).not.toContain("error.message");
      expect(form.indexOf("try {"), relativePath).toBeLessThan(
        form.indexOf("createClient()"),
      );
    }

    const signUpAction = source("lib/auth/actions.ts");
    expect(signUpAction).toContain("getSignUpErrorMessage");
    expect(signUpAction).not.toContain("error.message");
  });

  it("keeps callback errors and invalid recovery sessions controlled", () => {
    for (const relativePath of [
      "app/auth/callback/route.ts",
      "app/auth/confirm/route.ts",
    ]) {
      const route = source(relativePath);
      expect(route, relativePath).toContain("parseEmailOtpType");
      expect(route, relativePath).toContain("authErrorPath");
      expect(route, relativePath).not.toContain("error.message");
      expect(route, relativePath).not.toContain("?error=");
    }

    const errorPage = source("app/auth/error/page.tsx");
    expect(errorPage).toContain("getAuthErrorReasonMessage");
    expect(errorPage).not.toContain("params.error");
    expect(errorPage).not.toContain("Code error:");

    const updatePage = source("app/auth/update-password/page.tsx");
    expect(updatePage).toContain('authErrorPath("recovery_session_required")');
    expect(updatePage).toContain('authErrorPath("service_unavailable")');
  });

  it("redirects the leftover protected tutorial without rendering claims", () => {
    const protectedPage = source("app/protected/page.tsx");
    expect(protectedPage).toContain('redirect("/dashboard")');
    expect(protectedPage).not.toContain("JSON.stringify");
    expect(protectedPage).not.toContain("data.claims");
  });

  it("keeps logout on the authenticated server boundary", () => {
    const action = source("app/auth/actions.ts");
    const button = source("components/logout-button.tsx");

    expect(action).toContain('import "server-only"');
    expect(action).toContain("client.auth.getUser()");
    expect(action).toContain('client.auth.signOut({ scope: "local" })');
    expect(action).toContain('redirect("/auth/login")');
    expect(button).toContain("useFormStatus");
    expect(button).toContain("disabled={pending}");
    expect(button).not.toContain("createClient");
    expect(button).not.toContain("@/lib/supabase/client");
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
