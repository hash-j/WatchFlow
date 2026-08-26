export type QaCredentialKind = "A" | "B" | "delete";

export type QaCredentials = {
  email: string;
  password: string;
};

export type QaGuard = {
  enabled: boolean;
  reason: string;
};

const AUTHENTICATED_QA_VARIABLES = [
  "E2E_USER_A_EMAIL",
  "E2E_USER_A_PASSWORD",
  "E2E_USER_B_EMAIL",
  "E2E_USER_B_PASSWORD",
] as const;

const ACCOUNT_DELETION_VARIABLES = [
  "E2E_DELETE_ACCOUNT_EMAIL",
  "E2E_DELETE_ACCOUNT_PASSWORD",
] as const;

function environmentValue(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function missingVariables(names: readonly string[]) {
  return names.filter((name) => environmentValue(name) === null);
}

export function getE2eBaseUrl() {
  return (
    environmentValue("E2E_BASE_URL") ??
    environmentValue("PLAYWRIGHT_BASE_URL") ??
    "http://localhost:3000"
  );
}

function isLoopbackBaseUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

function normalizedSupabaseUrl(value: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    return url.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function buildDevelopmentTargetGuard(): QaGuard {
  if (environmentValue("E2E_TARGET_ENV") !== "development") {
    return {
      enabled: false,
      reason: "set E2E_TARGET_ENV=development to authorize QA mutations",
    };
  }

  if (!isLoopbackBaseUrl(getE2eBaseUrl())) {
    return {
      enabled: false,
      reason: "authenticated QA is restricted to a loopback application URL",
    };
  }

  const expectedSupabaseUrl = normalizedSupabaseUrl(
    environmentValue("E2E_EXPECTED_SUPABASE_URL"),
  );
  const configuredSupabaseUrl = normalizedSupabaseUrl(
    environmentValue("NEXT_PUBLIC_SUPABASE_URL"),
  );

  if (!expectedSupabaseUrl) {
    return {
      enabled: false,
      reason:
        "set E2E_EXPECTED_SUPABASE_URL to the disposable development project URL",
    };
  }

  if (!configuredSupabaseUrl || configuredSupabaseUrl !== expectedSupabaseUrl) {
    return {
      enabled: false,
      reason:
        "NEXT_PUBLIC_SUPABASE_URL must exactly match E2E_EXPECTED_SUPABASE_URL",
    };
  }

  return {
    enabled: true,
    reason: "development application and Supabase target guard satisfied",
  };
}

function buildAuthenticatedQaGuard(): QaGuard {
  if (!developmentTargetGuard.enabled) {
    return developmentTargetGuard;
  }

  const missing = missingVariables(AUTHENTICATED_QA_VARIABLES);
  if (missing.length > 0) {
    return {
      enabled: false,
      reason: `missing ${missing.join(", ")}`,
    };
  }

  return {
    enabled: true,
    reason: "development QA guard satisfied",
  };
}

function buildAccountDeletionGuard(): QaGuard {
  if (!authenticatedQaGuard.enabled) {
    return authenticatedQaGuard;
  }

  if (environmentValue("E2E_RUN_ACCOUNT_DELETION") !== "true") {
    return {
      enabled: false,
      reason: "set E2E_RUN_ACCOUNT_DELETION=true for the disposable account",
    };
  }

  const missing = missingVariables(ACCOUNT_DELETION_VARIABLES);
  if (missing.length > 0) {
    return {
      enabled: false,
      reason: `missing ${missing.join(", ")}`,
    };
  }

  const disposableEmail = environmentValue("E2E_DELETE_ACCOUNT_EMAIL")!;
  const protectedEmails = [
    environmentValue("E2E_USER_A_EMAIL"),
    environmentValue("E2E_USER_B_EMAIL"),
  ].filter((value): value is string => value !== null);

  if (
    protectedEmails.some(
      (email) => email.toLowerCase() === disposableEmail.toLowerCase(),
    )
  ) {
    return {
      enabled: false,
      reason: "the disposable deletion account must differ from QA Users A and B",
    };
  }

  return {
    enabled: true,
    reason: "disposable account deletion guard satisfied",
  };
}

export const developmentTargetGuard = buildDevelopmentTargetGuard();
export const authenticatedQaGuard = buildAuthenticatedQaGuard();
export const accountDeletionQaGuard = buildAccountDeletionGuard();

export function getQaCredentials(kind: QaCredentialKind): QaCredentials {
  const prefix =
    kind === "delete" ? "E2E_DELETE_ACCOUNT" : `E2E_USER_${kind}`;
  const emailName = `${prefix}_EMAIL`;
  const passwordName = `${prefix}_PASSWORD`;
  const email = environmentValue(emailName);
  const password = environmentValue(passwordName);

  if (!email || !password) {
    throw new Error(
      `QA credentials are unavailable. Configure ${emailName} and ${passwordName}.`,
    );
  }

  return { email, password };
}

export function getTestMovieQuery() {
  return environmentValue("E2E_TEST_MOVIE_QUERY") ?? "Inception";
}

export function getOnboardingMovieQueries() {
  return [
    environmentValue("E2E_ONBOARDING_MOVIE_QUERY_A") ?? getTestMovieQuery(),
    environmentValue("E2E_ONBOARDING_MOVIE_QUERY_B") ?? "Arrival",
  ] as const;
}
