import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { executeCalendarSync } from "./calendar-sync-executor";
import { GoogleCalendarTransportError } from "./google-calendar-transport";

const claim = (overrides: Record<string, unknown> = {}) => ({
  job_id: "11111111-1111-4111-8111-111111111111",
  connection_id: "22222222-2222-4222-8222-222222222222",
  owner_id: "33333333-3333-4333-8333-333333333333",
  source_key: "a".repeat(32),
  desired_operation: "upsert",
  source_version: "b".repeat(32),
  lease_token: "44444444-4444-4444-8444-444444444444",
  provider: "google",
  provider_calendar_id: "primary",
  provider_event_id: `a${"c".repeat(32)}`,
  user_movie_id: "55555555-5555-4555-8555-555555555555",
  movie_id: 42,
  movie_title: "Arrival",
  runtime_minutes: 116,
  scheduled_for: "2026-10-01T15:00:00.000Z",
  schedule_timezone: "Asia/Karachi",
  refresh_token_ciphertext: "\\x0102",
  refresh_token_nonce: `\\x${"03".repeat(12)}`,
  refresh_token_auth_tag: `\\x${"04".repeat(16)}`,
  encryption_key_version: 1,
  ...overrides,
});

function dependencies() {
  return {
    refreshAccessToken: vi.fn().mockResolvedValue({
      accessToken: "ephemeral-access",
      replacementRefreshToken: null,
    }),
    upsertEvent: vi.fn().mockResolvedValue({
      providerEventId: claim().provider_event_id,
      providerEtag: "etag",
      providerStatusCode: 200,
    }),
    deleteEvent: vi.fn().mockResolvedValue({
      providerEventId: claim().provider_event_id,
      providerEtag: null,
      providerStatusCode: 204,
    }),
    decryptRefreshToken: vi.fn().mockReturnValue("refresh-secret"),
    encryptRefreshToken: vi.fn().mockReturnValue({
      ciphertext: Buffer.from("rotated"),
      nonce: Buffer.alloc(12, 2),
      authTag: Buffer.alloc(16, 3),
      keyVersion: 2,
    }),
  };
}

function clientWithClaims(rows: unknown[], rotationResult: unknown = true) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "watchflow_claim_calendar_sync_jobs") {
      return { data: rows, error: null };
    }
    if (name === "watchflow_replace_google_calendar_credential") {
      return { data: rotationResult, error: null };
    }
    return { data: true, error: null };
  });
  return { rpc };
}

beforeEach(() => vi.clearAllMocks());

describe("Part 18J-C bounded calendar executor", () => {
  it("claims, decrypts, upserts, and exactly finalizes one deterministic event", async () => {
    const client = clientWithClaims([claim()]);
    const deps = dependencies();
    await expect(
      executeCalendarSync(7, client as never, deps),
    ).resolves.toEqual({
      claimed: 1,
      succeeded: 1,
      retryable: 0,
      failed: 0,
      authRequired: 0,
      staleFinalizations: 0,
    });
    expect(client.rpc).toHaveBeenNthCalledWith(
      1,
      "watchflow_claim_calendar_sync_jobs",
      { p_batch_size: 7, p_lease_seconds: 120 },
    );
    expect(deps.decryptRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({ keyVersion: 1 }),
      claim().owner_id,
    );
    expect(deps.upsertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: "primary",
        accessToken: "ephemeral-access",
        payload: expect.objectContaining({ id: claim().provider_event_id }),
      }),
    );
    expect(client.rpc).toHaveBeenLastCalledWith(
      "watchflow_finalize_calendar_sync_job",
      expect.objectContaining({
        p_job_id: claim().job_id,
        p_lease_token: claim().lease_token,
        p_source_version: claim().source_version,
        p_outcome: "succeeded",
        p_provider_event_id: claim().provider_event_id,
      }),
    );
  });

  it("does not write credentials when Google supplies no replacement token", async () => {
    const client = clientWithClaims([claim()]);
    await executeCalendarSync(1, client as never, dependencies());
    expect(client.rpc).not.toHaveBeenCalledWith(
      "watchflow_replace_google_calendar_credential",
      expect.anything(),
    );
  });

  it("replaces only the owner-bound encrypted credential before provider mutation", async () => {
    const client = clientWithClaims([claim()]);
    const deps = dependencies();
    deps.refreshAccessToken.mockResolvedValue({
      accessToken: "ephemeral-access",
      replacementRefreshToken: "rotated-refresh",
    });
    await executeCalendarSync(1, client as never, deps);
    expect(client.rpc).toHaveBeenCalledWith(
      "watchflow_replace_google_calendar_credential",
      expect.objectContaining({
        p_user_id: claim().owner_id,
        p_connection_id: claim().connection_id,
        p_encryption_key_version: 2,
      }),
    );
    expect(deps.encryptRefreshToken).toHaveBeenCalledWith(
      "rotated-refresh",
      claim().owner_id,
    );
    const rotationOrder = client.rpc.mock.invocationCallOrder.find(
      (_, index) =>
        client.rpc.mock.calls[index][0] ===
        "watchflow_replace_google_calendar_credential",
    );
    expect(rotationOrder).toBeLessThan(deps.upsertEvent.mock.invocationCallOrder[0]);
  });

  it("uses the same executor path for deterministic deletion and 404-equivalent success", async () => {
    const client = clientWithClaims([
      claim({
        desired_operation: "delete",
        user_movie_id: null,
        movie_id: null,
        movie_title: null,
        runtime_minutes: null,
        scheduled_for: null,
        schedule_timezone: null,
      }),
    ]);
    const deps = dependencies();
    deps.deleteEvent.mockResolvedValue({
      providerEventId: claim().provider_event_id,
      providerEtag: null,
      providerStatusCode: 404,
    });
    await executeCalendarSync(1, client as never, deps);
    expect(deps.upsertEvent).not.toHaveBeenCalled();
    expect(deps.deleteEvent).toHaveBeenCalledOnce();
    expect(client.rpc).toHaveBeenLastCalledWith(
      "watchflow_finalize_calendar_sync_job",
      expect.objectContaining({ p_outcome: "succeeded", p_provider_status_code: 404 }),
    );
  });

  it.each([
    ["retryable", "google_rate_limited", "retryable"],
    ["auth_required", "google_authorization_required", "authRequired"],
    ["failed", "google_provider_rejected", "failed"],
  ] as const)("finalizes %s provider failures without leaking credentials", async (
    outcome,
    errorCode,
    counter,
  ) => {
    const client = clientWithClaims([claim()]);
    const deps = dependencies();
    deps.refreshAccessToken.mockRejectedValue(
      new GoogleCalendarTransportError(outcome, errorCode, 429),
    );
    const result = await executeCalendarSync(1, client as never, deps);
    expect(result[counter]).toBe(1);
    expect(client.rpc).toHaveBeenLastCalledWith(
      "watchflow_finalize_calendar_sync_job",
      expect.objectContaining({ p_outcome: outcome, p_error_code: errorCode }),
    );
    expect(JSON.stringify(client.rpc.mock.calls)).not.toContain("refresh-secret");
    expect(JSON.stringify(client.rpc.mock.calls)).not.toContain("ephemeral-access");
  });

  it("reports exact-lease rejection as stale rather than overwriting newer state", async () => {
    const client = clientWithClaims([claim()]);
    client.rpc.mockImplementation(async (name: string) =>
      name === "watchflow_claim_calendar_sync_jobs"
        ? { data: [claim()], error: null }
        : { data: false, error: null },
    );
    await expect(
      executeCalendarSync(1, client as never, dependencies()),
    ).resolves.toMatchObject({ staleFinalizations: 1, succeeded: 0 });
  });

  it("fails closed when credential rotation does not match owner and connection", async () => {
    const client = clientWithClaims([claim()], false);
    const deps = dependencies();
    deps.refreshAccessToken.mockResolvedValue({
      accessToken: "ephemeral-access",
      replacementRefreshToken: "rotated-refresh",
    });
    await executeCalendarSync(1, client as never, deps);
    expect(deps.upsertEvent).not.toHaveBeenCalled();
    expect(client.rpc).toHaveBeenLastCalledWith(
      "watchflow_finalize_calendar_sync_job",
      expect.objectContaining({
        p_outcome: "failed",
        p_error_code: "calendar_credential_owner_mismatch",
      }),
    );
  });

  it("fails closed on malformed claim payloads instead of silently losing a lease", async () => {
    const client = clientWithClaims([{ unexpected: true }]);
    await expect(
      executeCalendarSync(1, client as never, dependencies()),
    ).rejects.toThrow("claim payload was invalid");
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it("marks an unreadable owner-bound credential as reconnect-required", async () => {
    const client = clientWithClaims([claim()]);
    const deps = dependencies();
    deps.decryptRefreshToken.mockImplementation(() => {
      throw new Error("authentication failed");
    });
    await executeCalendarSync(1, client as never, deps);
    expect(client.rpc).toHaveBeenLastCalledWith(
      "watchflow_finalize_calendar_sync_job",
      expect.objectContaining({
        p_outcome: "auth_required",
        p_error_code: "calendar_credential_invalid",
      }),
    );
  });
});
