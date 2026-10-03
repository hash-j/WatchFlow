import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8");

describe("Part 18J-C executor and security contracts", () => {
  it("keeps transport, executor, and privileged client server-only", () => {
    for (const file of [
      "lib/calendar/google-calendar-transport.ts",
      "lib/calendar/calendar-sync-executor.ts",
      "lib/supabase/background.ts",
    ]) {
      expect(source(file)).toContain('import "server-only"');
    }
  });

  it("uses only the narrowly approved calendar service-role RPCs", () => {
    const executor = source("lib/calendar/calendar-sync-executor.ts");
    const rpcNames = [
      ...executor.matchAll(/client\.rpc\(\s*"([^"]+)"/g),
    ].map((match) => match[1]);
    expect(new Set(rpcNames)).toEqual(
      new Set([
        "watchflow_claim_calendar_sync_jobs",
        "watchflow_finalize_calendar_sync_job",
        "watchflow_replace_google_calendar_credential",
        "watchflow_is_final_calendar_cleanup",
      ]),
    );
    expect(executor).not.toContain('.from("');
  });

  it("protects the bounded internal endpoint with the existing strong scheduler secret", () => {
    const route = source("app/api/internal/calendar/sync/route.ts");
    expect(route).toContain("isAuthorizedSchedulerRequest");
    expect(route).toContain("executeCalendarSync()");
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(route).not.toContain("SUPABASE_SECRET_KEY");
    expect(route).not.toContain("GOOGLE_CALENDAR_CLIENT_SECRET");
  });

  it("does not expose access or refresh credentials through browser modules", () => {
    const executor = source("lib/calendar/calendar-sync-executor.ts");
    const route = source("app/api/internal/calendar/sync/route.ts");
    expect(route).not.toMatch(/accessToken|refreshToken|ciphertext/);
    expect(executor).not.toMatch(/console\.(log|error|warn)/);
  });
});
