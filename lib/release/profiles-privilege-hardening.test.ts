import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608290001_profiles_privilege_hardening.sql",
  ),
  "utf8",
)
  .toLowerCase()
  .replaceAll("\r\n", "\n");

const readinessAudit = readFileSync(
  resolve(
    process.cwd(),
    "supabase/verification/development_readiness.sql",
  ),
  "utf8",
).toLowerCase();

const securityAudit = readFileSync(
  resolve(
    process.cwd(),
    "supabase/verification/production_security_audit.sql",
  ),
  "utf8",
).toLowerCase();

describe("profiles privilege-hardening migration", () => {
  it("revokes every unintended authenticated table privilege", () => {
    expect(migration).toMatch(
      /revoke\s+insert,\s*update,\s*delete,\s*truncate,\s*references,\s*trigger\s+on table public\.profiles\s+from authenticated;/,
    );
  });

  it("leaves public and anon with no profile table or column privilege", () => {
    expect(migration).toMatch(
      /revoke\s+select,\s*insert,\s*update,\s*delete,\s*truncate,\s*references,\s*trigger\s+on table public\.profiles\s+from public, anon;/,
    );
  });

  it("restores only authenticated SELECT and the six required UPDATE columns", () => {
    expect(migration).toMatch(
      /grant\s+select\s+on table public\.profiles\s+to authenticated;/,
    );

    const updateGrant = migration.match(
      /grant update\s*\(([^)]+)\)\s+on table public\.profiles\s+to authenticated;/,
    );
    expect(updateGrant).not.toBeNull();
    expect(
      updateGrant?.[1]
        .split(",")
        .map((column) => column.trim())
        .sort(),
    ).toEqual([
      "avatar_url",
      "country",
      "full_name",
      "onboarding_completed_at",
      "timezone",
      "updated_at",
    ]);

    expect(migration).not.toMatch(
      /grant\s+(?:insert|delete|truncate|references|trigger|all)/,
    );
  });

  it("does not change RLS, policies, functions, defaults, or service access", () => {
    expect(migration).not.toMatch(
      /(?:create|alter|drop)\s+(?:policy|function|table)/,
    );
    expect(migration).not.toContain("row level security");
    expect(migration).not.toContain("default privileges");
    expect(migration).not.toContain("service_role");
  });
});

describe("profiles privilege audit coverage", () => {
  it("checks all seven table privileges for authenticated and anon", () => {
    for (const privilege of [
      "select",
      "insert",
      "update",
      "delete",
      "truncate",
      "references",
      "trigger",
    ]) {
      expect(readinessAudit).toContain(
        `('authenticated', '${privilege}', ${privilege === "select"})`,
      );
      expect(readinessAudit).toContain(
        `('anon', '${privilege}', false)`,
      );
    }
  });

  it("makes structural privilege and broad UPDATE drift production findings", () => {
    for (const privilege of ["truncate", "references", "trigger"]) {
      expect(
        securityAudit.match(
          new RegExp(`\\('profiles', '${privilege}', false\\)`, "g"),
        )?.length ?? 0,
      ).toBeGreaterThanOrEqual(2);
    }

    expect(securityAudit).toContain(
      "authenticated role has unintended table-level update privilege",
    );
    expect(securityAudit).toContain(
      "authenticated role has an unintended profile column privilege",
    );
    expect(securityAudit).toContain(
      "anonymous role has an unintended profile column privilege",
    );
  });
});
