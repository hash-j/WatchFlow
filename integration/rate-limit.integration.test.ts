import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REQUIRED_ENVIRONMENT = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "E2E_EXPECTED_SUPABASE_URL",
  "E2E_USER_A_EMAIL",
  "E2E_USER_A_PASSWORD",
  "E2E_USER_B_EMAIL",
  "E2E_USER_B_PASSWORD",
] as const;

const OPERATIONS = [
  "search",
  "details",
  "import_search",
  "import_details",
] as const;

type Operation = (typeof OPERATIONS)[number];

type QaClient = {
  client: SupabaseClient;
  diagnosticUserId: string;
};

type SafeRateLimitRecord = {
  allowed: boolean;
  remaining: number;
  retry_after_seconds: number;
  limit: number;
  window_seconds: number;
  operation: Operation;
  request_sequence: number;
};

type DiagnosticRow = {
  operation: string;
  window_started_at: string;
  request_count: number;
  updated_at: string;
};

function environmentValue(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function normalizedUrl(value: string | null) {
  return value?.replace(/\/$/, "") ?? null;
}

const liveIntegrationEnabled =
  process.env.RUN_TMDB_RATE_LIMIT_INTEGRATION_TESTS === "true" &&
  process.env.E2E_TARGET_ENV === "development" &&
  process.env.E2E_RATE_LIMIT_BUCKETS_ARE_FRESH === "true" &&
  REQUIRED_ENVIRONMENT.every((name) => environmentValue(name)) &&
  normalizedUrl(environmentValue("NEXT_PUBLIC_SUPABASE_URL")) ===
    normalizedUrl(environmentValue("E2E_EXPECTED_SUPABASE_URL"));

const liveDescribe = liveIntegrationEnabled
  ? describe.sequential
  : describe.skip;

function createQaClient(key: string, authorization?: string) {
  return createClient(environmentValue("NEXT_PUBLIC_SUPABASE_URL")!, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    ...(authorization
      ? { global: { headers: { Authorization: authorization } } }
      : {}),
  });
}

async function authenticate(
  emailName: "E2E_USER_A_EMAIL" | "E2E_USER_B_EMAIL",
  passwordName: "E2E_USER_A_PASSWORD" | "E2E_USER_B_PASSWORD",
): Promise<QaClient> {
  const client = createQaClient(
    environmentValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")!,
  );
  const { error } = await client.auth.signInWithPassword({
    email: environmentValue(emailName)!,
    password: environmentValue(passwordName)!,
  });

  if (error) {
    throw new Error(`Disposable QA authentication failed (${error.code}).`);
  }

  const identity = await client.auth.getUser();
  if (identity.error || !identity.data.user) {
    throw new Error(
      `Disposable QA identity verification failed (${identity.error?.code ?? "unknown"}).`,
    );
  }

  return { client, diagnosticUserId: identity.data.user.id };
}

function parseRateLimitRecord(
  data: unknown,
  operation: Operation,
  requestSequence: number,
): SafeRateLimitRecord {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Limiter returned a malformed result.");
  }

  const result = data as Record<string, unknown>;
  const expectedKeys = [
    "allowed",
    "limit",
    "remaining",
    "retry_after_seconds",
    "window_seconds",
  ];

  if (
    Object.keys(result).sort().join(",") !== expectedKeys.join(",") ||
    typeof result.allowed !== "boolean" ||
    !Number.isSafeInteger(result.remaining) ||
    !Number.isSafeInteger(result.retry_after_seconds) ||
    !Number.isSafeInteger(result.limit) ||
    !Number.isSafeInteger(result.window_seconds)
  ) {
    throw new Error("Limiter returned an invalid contract shape.");
  }

  return {
    allowed: result.allowed,
    remaining: result.remaining as number,
    retry_after_seconds: result.retry_after_seconds as number,
    limit: result.limit as number,
    window_seconds: result.window_seconds as number,
    operation,
    request_sequence: requestSequence,
  };
}

async function callLimiter(
  client: SupabaseClient,
  operation: Operation,
  requestSequence: number,
  cost = 1,
) {
  const { data, error } = await client.rpc(
    "watchflow_take_tmdb_rate_limit",
    {
      p_operation: operation,
      p_cost: cost,
    },
  );

  if (error) {
    throw new Error(`Limiter RPC failed (${error.code}).`);
  }

  return parseRateLimitRecord(data, operation, requestSequence);
}

async function expectRpcError(
  client: SupabaseClient,
  operation: string,
  cost: number | null,
  acceptedCodes: readonly string[],
) {
  const { error } = await client.rpc("watchflow_take_tmdb_rate_limit", {
    p_operation: operation,
    p_cost: cost,
  });

  expect(error).not.toBeNull();
  expect(acceptedCodes).toContain(error?.code);
}

async function readRows(
  diagnosticClient: SupabaseClient,
  diagnosticUserId: string,
) {
  const { data, error } = await diagnosticClient
    .from("watchflow_tmdb_rate_limits")
    .select("operation,window_started_at,request_count,updated_at")
    .eq("user_id", diagnosticUserId)
    .order("operation");

  if (error) {
    throw new Error(`Read-only limiter diagnostics failed (${error.code}).`);
  }

  return (data ?? []) as DiagnosticRow[];
}

async function readRow(
  diagnosticClient: SupabaseClient,
  diagnosticUserId: string,
  operation: Operation,
) {
  const { data, error } = await diagnosticClient
    .from("watchflow_tmdb_rate_limits")
    .select("operation,window_started_at,request_count,updated_at")
    .eq("user_id", diagnosticUserId)
    .eq("operation", operation)
    .maybeSingle();

  if (error) {
    throw new Error(`Read-only limiter diagnostics failed (${error.code}).`);
  }
  if (!data) {
    throw new Error("Expected limiter diagnostic row is missing.");
  }

  return data as DiagnosticRow;
}

function operationWindowSeconds(operation: string) {
  return operation === "search" || operation === "details" ? 60 : 600;
}

async function requireFreshBuckets(
  diagnosticClient: SupabaseClient,
  qaUsers: readonly QaClient[],
) {
  const now = Date.now();

  for (const qaUser of qaUsers) {
    const rows = await readRows(
      diagnosticClient,
      qaUser.diagnosticUserId,
    );

    for (const row of rows) {
      if (
        !OPERATIONS.includes(row.operation as Operation) ||
        !Number.isSafeInteger(row.request_count) ||
        row.request_count < 0
      ) {
        throw new Error("QA limiter diagnostics contain invalid state.");
      }

      const windowStart = Date.parse(row.window_started_at);
      const expiresAt =
        windowStart + operationWindowSeconds(row.operation) * 1_000;
      if (!Number.isFinite(windowStart) || expiresAt > now) {
        throw new Error(
          "Disposable QA limiter buckets are not fresh; wait for natural expiry before rerunning.",
        );
      }
    }
  }
}

async function waitForReportedRetry(seconds: number) {
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 60) {
    throw new Error("Limiter returned an unsafe retry duration.");
  }

  const deadline = Date.now() + seconds * 1_000 + 1_500;
  while (Date.now() < deadline) {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(deadline - Date.now(), 5_000)),
    );
  }
}

async function waitForDiagnosticWindowExpiry(
  row: DiagnosticRow,
  windowSeconds: number,
) {
  const windowStartedAt = Date.parse(row.window_started_at);
  if (!Number.isFinite(windowStartedAt)) {
    throw new Error("Limiter diagnostic row has an invalid window timestamp.");
  }

  const deadline = windowStartedAt + windowSeconds * 1_000 + 1_500;
  while (Date.now() < deadline) {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(deadline - Date.now(), 5_000)),
    );
  }
}

function expectedRange(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function expiredAuthorizationHeader() {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ exp: 1, role: "authenticated" })}.invalid`;
  return `Bearer ${token}`;
}

liveDescribe("development Supabase TMDB rate limiter", () => {
  let userA: QaClient;
  let userB: QaClient;
  let anonymous: SupabaseClient;
  let diagnosticClient: SupabaseClient;
  let userASearchRetry = 0;

  beforeAll(async () => {
    if (
      environmentValue("E2E_USER_A_EMAIL")?.toLowerCase() ===
      environmentValue("E2E_USER_B_EMAIL")?.toLowerCase()
    ) {
      throw new Error("QA Users A and B must be distinct disposable users.");
    }

    [userA, userB] = await Promise.all([
      authenticate("E2E_USER_A_EMAIL", "E2E_USER_A_PASSWORD"),
      authenticate("E2E_USER_B_EMAIL", "E2E_USER_B_PASSWORD"),
    ]);
    if (userA.diagnosticUserId === userB.diagnosticUserId) {
      throw new Error("QA Users A and B resolved to the same identity.");
    }

    anonymous = createQaClient(
      environmentValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")!,
    );
    diagnosticClient = createQaClient(
      environmentValue("SUPABASE_SECRET_KEY")!,
    );

    // This privileged client is read-only throughout the suite. It is never
    // used to invoke the limiter or alter QA rows.
    await requireFreshBuckets(diagnosticClient, [userA, userB]);
  });

  afterAll(async () => {
    await Promise.allSettled([
      userA?.client.auth.signOut({ scope: "local" }),
      userB?.client.auth.signOut({ scope: "local" }),
    ]);
  });

  it("verifies live object access and rejects invalid input without consuming allowance", async () => {
    expect(await readRows(diagnosticClient, userA.diagnosticUserId)).toEqual(
      expect.any(Array),
    );

    await expectRpcError(userA.client, "invalid_operation", 1, ["22023"]);
    for (const invalidCost of [0, -1, 31, null]) {
      await expectRpcError(userA.client, "search", invalidCost, ["22023"]);
    }

    const authenticatedTableRead = await userA.client
      .from("watchflow_tmdb_rate_limits")
      .select("operation")
      .limit(1);
    expect(authenticatedTableRead.data).toBeNull();
    expect(["42501", "PGRST301"]).toContain(
      authenticatedTableRead.error?.code,
    );

    const anonymousTableRead = await anonymous
      .from("watchflow_tmdb_rate_limits")
      .select("operation")
      .limit(1);
    expect(anonymousTableRead.data).toBeNull();
    expect(["42501", "PGRST301"]).toContain(anonymousTableRead.error?.code);

    await expectRpcError(anonymous, "search", 1, [
      "42501",
      "PGRST202",
      "PGRST301",
    ]);

    const missingRpc = await userA.client.rpc(
      "watchflow_missing_tmdb_rate_limit_probe",
      { p_operation: "search", p_cost: 1 },
    );
    expect(["42883", "PGRST202"]).toContain(missingRpc.error?.code);

    expect(await readRows(diagnosticClient, userA.diagnosticUserId)).toEqual(
      expect.any(Array),
    );
  });

  it("enforces the 30-request search contract and leaves denial state unchanged", async () => {
    const allowed: SafeRateLimitRecord[] = [];
    for (let sequence = 1; sequence <= 30; sequence += 1) {
      allowed.push(
        await callLimiter(userA.client, "search", sequence),
      );
    }

    expect(allowed.every((record) => record.allowed)).toBe(true);
    expect(allowed.map((record) => record.remaining)).toEqual(
      expectedRange(0, 29).reverse(),
    );
    expect(allowed.every((record) => record.limit === 30)).toBe(true);
    expect(
      allowed.every((record) => record.window_seconds === 60),
    ).toBe(true);

    const beforeDenial = await readRow(
      diagnosticClient,
      userA.diagnosticUserId,
      "search",
    );
    const denied = await callLimiter(userA.client, "search", 31);
    const afterDenial = await readRow(
      diagnosticClient,
      userA.diagnosticUserId,
      "search",
    );

    expect(denied).toMatchObject({
      allowed: false,
      remaining: 0,
      limit: 30,
      window_seconds: 60,
      request_sequence: 31,
    });
    expect(denied.retry_after_seconds).toBeGreaterThan(0);
    expect(afterDenial).toEqual(beforeDenial);
    expect(afterDenial.request_count).toBe(30);
    userASearchRetry = denied.retry_after_seconds;
  });

  it("isolates users and operation buckets while accepting 10 concurrent search calls", async () => {
    const userABefore = await readRow(
      diagnosticClient,
      userA.diagnosticUserId,
      "search",
    );
    const userABlocked = await callLimiter(userA.client, "search", 32);
    const userAAfter = await readRow(
      diagnosticClient,
      userA.diagnosticUserId,
      "search",
    );
    expect(userABlocked.allowed).toBe(false);
    expect(userAAfter).toEqual(userABefore);
    userASearchRetry = userABlocked.retry_after_seconds;

    const userBConcurrent = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        callLimiter(userB.client, "search", index + 1),
      ),
    );
    expect(userBConcurrent.every((record) => record.allowed)).toBe(true);
    expect(
      userBConcurrent.map((record) => record.remaining).sort((a, b) => a - b),
    ).toEqual(expectedRange(20, 29));
    expect(
      (
        await readRow(
          diagnosticClient,
          userB.diagnosticUserId,
          "search",
        )
      ).request_count,
    ).toBe(10);

    await expect(callLimiter(userA.client, "details", 1)).resolves.toMatchObject(
      { allowed: true, remaining: 19, limit: 20, window_seconds: 60 },
    );
    await expect(
      callLimiter(userA.client, "import_search", 1),
    ).resolves.toMatchObject({
      allowed: true,
      remaining: 119,
      limit: 120,
      window_seconds: 600,
    });
    await expect(
      callLimiter(userA.client, "import_details", 1),
    ).resolves.toMatchObject({
      allowed: true,
      remaining: 119,
      limit: 120,
      window_seconds: 600,
    });
    await expect(callLimiter(userB.client, "details", 1)).resolves.toMatchObject(
      { allowed: true, remaining: 19, limit: 20, window_seconds: 60 },
    );

    const inaccessibleState = await userB.client
      .from("watchflow_tmdb_rate_limits")
      .select("operation")
      .limit(1);
    expect(inaccessibleState.data).toBeNull();
    expect(["42501", "PGRST301"]).toContain(inaccessibleState.error?.code);
  });

  it("enforces the independent 20-request details contract", async () => {
    const allowed = [
      parseRateLimitRecord(
        {
          allowed: true,
          remaining: 19,
          retry_after_seconds: 0,
          limit: 20,
          window_seconds: 60,
        },
        "details",
        1,
      ),
    ];
    for (let sequence = 2; sequence <= 20; sequence += 1) {
      allowed.push(
        await callLimiter(userA.client, "details", sequence),
      );
    }

    expect(allowed.every((record) => record.allowed)).toBe(true);
    expect(allowed.map((record) => record.remaining)).toEqual(
      expectedRange(0, 19).reverse(),
    );

    const beforeDenial = await readRow(
      diagnosticClient,
      userA.diagnosticUserId,
      "details",
    );
    const denied = await callLimiter(userA.client, "details", 21);
    const afterDenial = await readRow(
      diagnosticClient,
      userA.diagnosticUserId,
      "details",
    );
    expect(denied).toMatchObject({
      allowed: false,
      remaining: 0,
      limit: 20,
      window_seconds: 60,
      request_sequence: 21,
    });
    expect(denied.retry_after_seconds).toBeGreaterThan(0);
    expect(afterDenial).toEqual(beforeDenial);
    expect(afterDenial.request_count).toBe(20);
    expect(
      (
        await readRow(
          diagnosticClient,
          userA.diagnosticUserId,
          "search",
        )
      ).request_count,
    ).toBe(30);
  });

  it(
    "starts a fresh search window after the reported retry duration",
    async () => {
      const beforeExpiry = await readRow(
        diagnosticClient,
        userA.diagnosticUserId,
        "search",
      );
      await waitForReportedRetry(userASearchRetry);

      const restarted = await callLimiter(userA.client, "search", 1);
      const afterExpiry = await readRow(
        diagnosticClient,
        userA.diagnosticUserId,
        "search",
      );

      expect(restarted).toMatchObject({
        allowed: true,
        remaining: 29,
        limit: 30,
        window_seconds: 60,
      });
      expect(afterExpiry.request_count).toBe(1);
      expect(afterExpiry.window_started_at).not.toBe(
        beforeExpiry.window_started_at,
      );
    },
    90_000,
  );

  it(
    "enforces import-search cost and batched-cost contracts independently",
    async () => {
      const userAAllowed: SafeRateLimitRecord[] = [];
      for (let sequence = 2; sequence <= 120; sequence += 1) {
        userAAllowed.push(
          await callLimiter(userA.client, "import_search", sequence),
        );
      }
      expect(userAAllowed.every((record) => record.allowed)).toBe(true);
      expect(userAAllowed.at(-1)?.remaining).toBe(0);

      const userADenied = await callLimiter(
        userA.client,
        "import_search",
        121,
      );
      expect(userADenied).toMatchObject({
        allowed: false,
        remaining: 0,
        limit: 120,
        window_seconds: 600,
        request_sequence: 121,
      });
      expect(userADenied.retry_after_seconds).toBeGreaterThan(0);

      const costTwo = await callLimiter(userB.client, "import_search", 1, 2);
      const costTen = await callLimiter(userB.client, "import_search", 2, 10);
      const exceedsRemaining = await callLimiter(
        userB.client,
        "import_search",
        3,
        109,
      );
      expect(costTwo).toMatchObject({ allowed: true, remaining: 118 });
      expect(costTen).toMatchObject({ allowed: true, remaining: 108 });
      expect(exceedsRemaining).toMatchObject({
        allowed: false,
        remaining: 108,
      });
      expect(
        (
          await readRow(
            diagnosticClient,
            userB.diagnosticUserId,
            "import_search",
          )
        ).request_count,
      ).toBe(12);

      const exactRemaining = await callLimiter(
        userB.client,
        "import_search",
        4,
        108,
      );
      const afterExact = await callLimiter(
        userB.client,
        "import_search",
        5,
      );
      expect(exactRemaining).toMatchObject({ allowed: true, remaining: 0 });
      expect(afterExact).toMatchObject({ allowed: false, remaining: 0 });
      expect(
        (
          await readRow(
            diagnosticClient,
            userB.diagnosticUserId,
            "import_search",
          )
        ).request_count,
      ).toBe(120);
    },
    120_000,
  );

  it(
    "enforces import-details while retaining user and operation isolation",
    async () => {
      const userAAllowed: SafeRateLimitRecord[] = [];
      for (let sequence = 2; sequence <= 120; sequence += 1) {
        userAAllowed.push(
          await callLimiter(userA.client, "import_details", sequence),
        );
      }
      expect(userAAllowed.every((record) => record.allowed)).toBe(true);
      expect(userAAllowed.at(-1)?.remaining).toBe(0);

      const denied = await callLimiter(
        userA.client,
        "import_details",
        121,
      );
      expect(denied).toMatchObject({
        allowed: false,
        remaining: 0,
        limit: 120,
        window_seconds: 600,
        request_sequence: 121,
      });

      await expect(
        callLimiter(userB.client, "import_details", 1),
      ).resolves.toMatchObject({
        allowed: true,
        remaining: 119,
        limit: 120,
        window_seconds: 600,
      });

      expect(
        (
          await readRow(
            diagnosticClient,
            userA.diagnosticUserId,
            "import_search",
          )
        ).request_count,
      ).toBe(120);
      expect(
        (
          await readRow(
            diagnosticClient,
            userA.diagnosticUserId,
            "search",
          )
        ).request_count,
      ).toBe(1);
    },
    120_000,
  );

  it(
    "accepts exactly 30 of 35 concurrent calls in a fresh search window",
    async () => {
      const previousWindow = await readRow(
        diagnosticClient,
        userB.diagnosticUserId,
        "search",
      );
      await waitForDiagnosticWindowExpiry(previousWindow, 60);
      const concurrent = await Promise.all(
        Array.from({ length: 35 }, (_, index) =>
          callLimiter(userB.client, "search", index + 1),
        ),
      );
      const accepted = concurrent.filter((record) => record.allowed);
      const rejected = concurrent.filter((record) => !record.allowed);

      expect(accepted).toHaveLength(30);
      expect(rejected).toHaveLength(5);
      expect(
        accepted.map((record) => record.remaining).sort((a, b) => a - b),
      ).toEqual(expectedRange(0, 29));
      expect(
        rejected.every(
          (record) =>
            record.remaining === 0 && record.retry_after_seconds > 0,
        ),
      ).toBe(true);

      const finalRow = await readRow(
        diagnosticClient,
        userB.diagnosticUserId,
        "search",
      );
      expect(finalRow.request_count).toBe(30);
      expect(finalRow.window_started_at).not.toBe(
        previousWindow.window_started_at,
      );
    },
    90_000,
  );

  it("rejects an expired session without creating limiter state", async () => {
    const before = await readRows(diagnosticClient, userA.diagnosticUserId);
    const expired = createQaClient(
      environmentValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")!,
      expiredAuthorizationHeader(),
    );
    await expectRpcError(expired, "search", 1, ["PGRST301", "PGRST303"]);
    const after = await readRows(diagnosticClient, userA.diagnosticUserId);
    expect(after).toEqual(before);
  });

  it("verifies final QA row state without exposing identities", async () => {
    const userARows = await readRows(
      diagnosticClient,
      userA.diagnosticUserId,
    );
    const userBRows = await readRows(
      diagnosticClient,
      userB.diagnosticUserId,
    );

    for (const rows of [userARows, userBRows]) {
      expect(new Set(rows.map((row) => row.operation)).size).toBe(rows.length);
      expect(
        rows.every(
          (row) =>
            OPERATIONS.includes(row.operation as Operation) &&
            row.request_count >= 0 &&
            Date.parse(row.updated_at) >= Date.parse(row.window_started_at),
        ),
      ).toBe(true);
    }

    expect(
      Object.fromEntries(
        userARows.map((row) => [row.operation, row.request_count]),
      ),
    ).toEqual({
      details: 20,
      import_details: 120,
      import_search: 120,
      search: 1,
    });
    expect(
      Object.fromEntries(
        userBRows.map((row) => [row.operation, row.request_count]),
      ),
    ).toEqual({
      details: 1,
      import_details: 1,
      import_search: 120,
      search: 30,
    });
  });
});
