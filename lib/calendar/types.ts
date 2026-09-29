export const CALENDAR_PROVIDERS = ["google"] as const;

export type CalendarProvider = (typeof CALENDAR_PROVIDERS)[number];

export const CALENDAR_CONNECTION_STATUSES = [
  "connected",
  "reconnect_required",
  "disconnect_pending",
] as const;

export type CalendarConnectionStatus =
  (typeof CALENDAR_CONNECTION_STATUSES)[number];

export const CALENDAR_SYNC_OPERATIONS = [
  "upsert",
  "delete",
  "connection_cleanup",
] as const;

export type CalendarSyncOperation =
  (typeof CALENDAR_SYNC_OPERATIONS)[number];

export const CALENDAR_SYNC_JOB_STATES = [
  "pending",
  "leased",
  "retryable",
  "succeeded",
  "skipped",
  "failed",
  "auth_required",
] as const;

export type CalendarSyncJobState =
  (typeof CALENDAR_SYNC_JOB_STATES)[number];

export const CALENDAR_SYNC_OUTCOMES = [
  "succeeded",
  "retryable",
  "skipped",
  "failed",
  "auth_required",
] as const;

export type CalendarSyncOutcome =
  (typeof CALENDAR_SYNC_OUTCOMES)[number];

export type CalendarConnection = {
  id: string;
  userId: string;
  provider: CalendarProvider;
  providerSubject: string;
  displayEmail: string;
  providerCalendarId: "primary";
  syncEnabled: boolean;
  status: CalendarConnectionStatus;
  grantedScopes: string[];
  connectedAt: string;
  updatedAt: string;
  lastSuccessfulSyncAt: string | null;
  lastErrorCode: string | null;
  lastErrorAt: string | null;
};

export type CalendarEventMapping = {
  id: string;
  userId: string;
  connectionId: string;
  sourceKey: string;
  userMovieId: string | null;
  providerCalendarId: "primary";
  providerEventId: string;
  sourceVersion: string;
  providerEtag: string | null;
  syncState: "synced" | "delete_pending" | "error";
  syncedAt: string;
};

export type CalendarSyncJob = {
  id: string;
  userId: string;
  connectionId: string;
  sourceKey: string;
  userMovieId: string | null;
  desiredOperation: CalendarSyncOperation;
  sourceVersion: string;
  state: CalendarSyncJobState;
  attemptCount: number;
  attemptLimit: number;
  availableAt: string;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  providerStatusCode: number | null;
  errorCode: string | null;
  completedAt: string | null;
};

export type CalendarSyncClaim = {
  jobId: string;
  connectionId: string;
  ownerId: string;
  sourceKey: string;
  desiredOperation: CalendarSyncOperation;
  sourceVersion: string;
  leaseToken: string;
  provider: CalendarProvider;
  providerCalendarId: "primary";
  providerEventId: string | null;
  userMovieId: string | null;
  movieId: number | null;
  movieTitle: string | null;
  runtimeMinutes: number | null;
  scheduledFor: string | null;
  scheduleTimezone: string | null;
  encryptedCredential: {
    ciphertext: Uint8Array;
    nonce: Uint8Array;
    authTag: Uint8Array;
    keyVersion: number;
  };
};

export type CalendarSyncFinalization = {
  jobId: string;
  leaseToken: string;
  sourceVersion: string;
  outcome: CalendarSyncOutcome;
  providerEventId?: string;
  providerEtag?: string;
  providerStatusCode?: number;
  errorCode?: string;
};
