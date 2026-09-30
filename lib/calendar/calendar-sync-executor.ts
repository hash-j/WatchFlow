import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createCalendarSyncBackgroundClient } from "@/lib/supabase/background";
import {
  decryptCalendarRefreshToken,
  encryptCalendarRefreshToken,
} from "./token-encryption";
import {
  buildGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  GoogleCalendarTransportError,
  refreshGoogleCalendarAccessToken,
  upsertGoogleCalendarEvent,
} from "./google-calendar-transport";
import type {
  CalendarSyncClaim,
  CalendarSyncFinalization,
} from "./types";

const DEFAULT_BATCH_SIZE = 10;
const LEASE_SECONDS = 120;

type CalendarRpcClient = Pick<SupabaseClient, "rpc">;

type ExecutorDependencies = {
  refreshAccessToken: typeof refreshGoogleCalendarAccessToken;
  upsertEvent: typeof upsertGoogleCalendarEvent;
  deleteEvent: typeof deleteGoogleCalendarEvent;
  decryptRefreshToken: typeof decryptCalendarRefreshToken;
  encryptRefreshToken: typeof encryptCalendarRefreshToken;
};

export type CalendarSyncExecutionResult = {
  claimed: number;
  succeeded: number;
  retryable: number;
  failed: number;
  authRequired: number;
  staleFinalizations: number;
};

const defaultDependencies: ExecutorDependencies = {
  refreshAccessToken: refreshGoogleCalendarAccessToken,
  upsertEvent: upsertGoogleCalendarEvent,
  deleteEvent: deleteGoogleCalendarEvent,
  decryptRefreshToken: decryptCalendarRefreshToken,
  encryptRefreshToken: encryptCalendarRefreshToken,
};

function bytea(value: Uint8Array) {
  return `\\x${Buffer.from(value).toString("hex")}`;
}

function buffer(value: unknown) {
  if (typeof value !== "string" || !/^\\x[0-9a-f]+$/i.test(value)) return null;
  return Buffer.from(value.slice(2), "hex");
}

function text(row: Record<string, unknown>, key: string) {
  return typeof row[key] === "string" ? row[key] : null;
}

function nullableText(row: Record<string, unknown>, key: string) {
  return row[key] === null ? null : text(row, key);
}

function number(row: Record<string, unknown>, key: string) {
  return typeof row[key] === "number" && Number.isFinite(row[key])
    ? row[key]
    : null;
}

function parseClaim(value: unknown): CalendarSyncClaim | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const ciphertext = buffer(row.refresh_token_ciphertext);
  const nonce = buffer(row.refresh_token_nonce);
  const authTag = buffer(row.refresh_token_auth_tag);
  const desiredOperation = text(row, "desired_operation");
  const provider = text(row, "provider");
  const providerCalendarId = text(row, "provider_calendar_id");
  const required = [
    "job_id",
    "connection_id",
    "owner_id",
    "source_key",
    "source_version",
    "lease_token",
  ].map((key) => text(row, key));
  const keyVersion = number(row, "encryption_key_version");

  if (
    required.some((value) => !value) ||
    !["upsert", "delete", "connection_cleanup"].includes(
      desiredOperation ?? "",
    ) ||
    provider !== "google" ||
    providerCalendarId !== "primary" ||
    !ciphertext ||
    !nonce ||
    !authTag ||
    !Number.isInteger(keyVersion) ||
    keyVersion === null
  ) {
    return null;
  }

  return {
    jobId: required[0]!,
    connectionId: required[1]!,
    ownerId: required[2]!,
    sourceKey: required[3]!,
    desiredOperation: desiredOperation as CalendarSyncClaim["desiredOperation"],
    sourceVersion: required[4]!,
    leaseToken: required[5]!,
    provider: "google",
    providerCalendarId: "primary",
    providerEventId: nullableText(row, "provider_event_id"),
    userMovieId: nullableText(row, "user_movie_id"),
    movieId: row.movie_id === null ? null : number(row, "movie_id"),
    movieTitle: nullableText(row, "movie_title"),
    runtimeMinutes:
      row.runtime_minutes === null ? null : number(row, "runtime_minutes"),
    scheduledFor: nullableText(row, "scheduled_for"),
    scheduleTimezone: nullableText(row, "schedule_timezone"),
    encryptedCredential: {
      ciphertext,
      nonce,
      authTag,
      keyVersion,
    },
  };
}

async function replaceRotatedCredential(
  client: CalendarRpcClient,
  claim: CalendarSyncClaim,
  replacementRefreshToken: string,
  dependencies: ExecutorDependencies,
) {
  const encrypted = dependencies.encryptRefreshToken(
    replacementRefreshToken,
    claim.ownerId,
  );
  const { data, error } = await client.rpc(
    "watchflow_replace_google_calendar_credential",
    {
      p_user_id: claim.ownerId,
      p_connection_id: claim.connectionId,
      p_refresh_token_ciphertext: bytea(encrypted.ciphertext),
      p_refresh_token_nonce: bytea(encrypted.nonce),
      p_refresh_token_auth_tag: bytea(encrypted.authTag),
      p_encryption_key_version: encrypted.keyVersion,
    },
  );
  if (error) {
    throw new GoogleCalendarTransportError(
      "retryable",
      "calendar_credential_rotation_failed",
    );
  }
  if (data !== true) {
    throw new GoogleCalendarTransportError(
      "failed",
      "calendar_credential_owner_mismatch",
    );
  }
}

function failedFinalization(
  claim: CalendarSyncClaim,
  error: unknown,
): CalendarSyncFinalization {
  if (error instanceof GoogleCalendarTransportError) {
    return {
      jobId: claim.jobId,
      leaseToken: claim.leaseToken,
      sourceVersion: claim.sourceVersion,
      outcome: error.outcome,
      providerStatusCode: error.providerStatusCode ?? undefined,
      errorCode: error.errorCode,
    };
  }
  return {
    jobId: claim.jobId,
    leaseToken: claim.leaseToken,
    sourceVersion: claim.sourceVersion,
    outcome: "failed",
    errorCode: "calendar_executor_failure",
  };
}

async function executeClaim(
  client: CalendarRpcClient,
  claim: CalendarSyncClaim,
  dependencies: ExecutorDependencies,
): Promise<CalendarSyncFinalization> {
  try {
    let refreshToken: string;
    try {
      refreshToken = dependencies.decryptRefreshToken(
        claim.encryptedCredential,
        claim.ownerId,
      );
    } catch {
      throw new GoogleCalendarTransportError(
        "auth_required",
        "calendar_credential_invalid",
      );
    }
    const access = await dependencies.refreshAccessToken(refreshToken);
    if (access.replacementRefreshToken) {
      await replaceRotatedCredential(
        client,
        claim,
        access.replacementRefreshToken,
        dependencies,
      );
    }

    if (!claim.providerEventId) {
      throw new GoogleCalendarTransportError(
        "failed",
        "calendar_provider_event_id_missing",
      );
    }

    const result =
      claim.desiredOperation === "upsert"
        ? await dependencies.upsertEvent({
            calendarId: claim.providerCalendarId,
            accessToken: access.accessToken,
            payload: buildGoogleCalendarEvent({
              providerEventId: claim.providerEventId,
              sourceKey: claim.sourceKey,
              sourceVersion: claim.sourceVersion,
              movieTitle: claim.movieTitle ?? "",
              movieId: claim.movieId ?? 0,
              scheduledFor: claim.scheduledFor ?? "",
              scheduleTimezone: claim.scheduleTimezone ?? "",
              runtimeMinutes: claim.runtimeMinutes ?? 0,
            }),
          })
        : await dependencies.deleteEvent({
            calendarId: claim.providerCalendarId,
            providerEventId: claim.providerEventId,
            accessToken: access.accessToken,
          });

    return {
      jobId: claim.jobId,
      leaseToken: claim.leaseToken,
      sourceVersion: claim.sourceVersion,
      outcome: "succeeded",
      providerEventId: result.providerEventId,
      providerEtag: result.providerEtag ?? undefined,
      providerStatusCode: result.providerStatusCode,
    };
  } catch (error) {
    return failedFinalization(claim, error);
  }
}

async function finalize(
  client: CalendarRpcClient,
  result: CalendarSyncFinalization,
) {
  const response = await client.rpc("watchflow_finalize_calendar_sync_job", {
    p_job_id: result.jobId,
    p_lease_token: result.leaseToken,
    p_source_version: result.sourceVersion,
    p_outcome: result.outcome,
    p_provider_event_id: result.providerEventId ?? null,
    p_provider_etag: result.providerEtag ?? null,
    p_provider_status_code: result.providerStatusCode ?? null,
    p_error_code: result.errorCode ?? null,
  });
  if (response.error) throw new Error("Calendar sync finalization failed.");
  return response.data === true;
}

export async function executeCalendarSync(
  batchSize = DEFAULT_BATCH_SIZE,
  client: CalendarRpcClient = createCalendarSyncBackgroundClient(),
  dependencies: ExecutorDependencies = defaultDependencies,
): Promise<CalendarSyncExecutionResult> {
  const claimed = await client.rpc("watchflow_claim_calendar_sync_jobs", {
    p_batch_size: batchSize,
    p_lease_seconds: LEASE_SECONDS,
  });
  if (claimed.error) throw new Error("Calendar sync claim failed.");

  const rows = Array.isArray(claimed.data) ? claimed.data : [];
  const parsed = rows.map(parseClaim);
  if (parsed.some((claim) => claim === null)) {
    throw new Error("Calendar sync claim payload was invalid.");
  }
  const claims = parsed as CalendarSyncClaim[];
  const totals: CalendarSyncExecutionResult = {
    claimed: claims.length,
    succeeded: 0,
    retryable: 0,
    failed: 0,
    authRequired: 0,
    staleFinalizations: 0,
  };

  for (const claim of claims) {
    const result = await executeClaim(client, claim, dependencies);
    const finalized = await finalize(client, result);
    if (!finalized) {
      totals.staleFinalizations += 1;
      continue;
    }
    if (result.outcome === "succeeded") totals.succeeded += 1;
    else if (result.outcome === "retryable") totals.retryable += 1;
    else if (result.outcome === "auth_required") totals.authRequired += 1;
    else totals.failed += 1;
  }

  return totals;
}
