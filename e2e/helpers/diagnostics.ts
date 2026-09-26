import {
  expect,
  type ConsoleMessage,
  type Page,
  type Request,
  type Response,
  type TestInfo,
} from "@playwright/test";

type ConsoleFailure = {
  kind: "console";
  level: "error" | "warning";
  category: string;
  location: string | null;
};

type PageFailure = {
  kind: "page-error";
  errorType: string;
  category: string;
};

type RequestFailure = {
  kind: "request-failed";
  method: string;
  resourceType: string;
  url: string;
  category: string;
};

type HttpFailure = {
  kind: "http";
  method: string;
  resourceType: string;
  status: number;
  url: string;
};

export type SafeBrowserFailure =
  | ConsoleFailure
  | PageFailure
  | RequestFailure
  | HttpFailure;

export type BrowserAuditSnapshot = {
  failures: SafeBrowserFailure[];
};

export type BrowserFailureCollector = {
  snapshot: () => BrowserAuditSnapshot;
  stop: () => void;
};

type FailureAllowance = {
  allowedHttpStatuses?: readonly number[];
  allowedHttpFailures?: readonly {
    status: number;
    urlPattern: RegExp;
  }[];
  allowedUrlPatterns?: readonly RegExp[];
  allowedCategories?: readonly string[];
  allowedConsoleFailures?: readonly {
    category: string;
    locationPattern: RegExp;
  }[];
};

function redactPathSegment(segment: string) {
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      segment,
    ) ||
    /^\d{5,}$/.test(segment)
  ) {
    return ":id";
  }

  return segment;
}

export function safeRequestUrl(value: string) {
  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname
      .split("/")
      .map(redactPathSegment)
      .join("/");
    const origin = parsed.origin === "null" ? `${parsed.protocol}` : parsed.origin;
    return `${origin}${pathname}`;
  } catch {
    return "[unparseable-url]";
  }
}

function browserMessageCategory(value: string) {
  const normalized = value.toLowerCase();

  if (normalized.includes("hydration")) return "hydration";
  if (normalized.includes("failed to fetch")) return "failed-fetch";
  if (normalized.includes("unique key")) return "react-key";
  if (
    normalized.includes("largest contentful paint") &&
    normalized.includes('loading="eager"')
  ) {
    return "next-image-lcp-advice";
  }
  if (
    normalized.includes("was preloaded using link preload but not used") &&
    normalized.includes(".woff2")
  ) {
    return "unused-font-preload-advice";
  }
  if (normalized.includes("websocket") || normalized.includes("hmr")) {
    return "development-transport";
  }
  if (
    normalized.includes("is rendering with server caches disabled") &&
    normalized.includes("react devtools")
  ) {
    return "development-cache-diagnostics";
  }
  if (normalized.includes("content security policy")) return "csp";
  if (normalized.includes("accessibility")) return "accessibility";
  if (normalized.includes("warning:")) return "react-warning";
  return "browser-runtime";
}

function networkFailureCategory(value: string | null) {
  const normalized = value?.toLowerCase() ?? "";

  if (normalized.includes("aborted")) return "aborted";
  if (normalized.includes("timed out")) return "timeout";
  if (normalized.includes("name_not_resolved")) return "dns";
  if (normalized.includes("connection")) return "connection";
  return "network";
}

function safeErrorType(value: string) {
  return /^[A-Za-z][A-Za-z0-9]*Error$/.test(value) ? value : "Error";
}

export function monitorBrowserFailures(
  page: Page,
): BrowserFailureCollector {
  const failures: SafeBrowserFailure[] = [];

  const onConsole = (message: ConsoleMessage) => {
    const type = message.type();
    if (type !== "error" && type !== "warning") return;

    const location = message.location().url;
    failures.push({
      kind: "console",
      level: type,
      category: browserMessageCategory(message.text()),
      location: location ? safeRequestUrl(location) : null,
    });
  };

  const onPageError = (error: Error) => {
    failures.push({
      kind: "page-error",
      errorType: safeErrorType(error.name),
      category: browserMessageCategory(error.message),
    });
  };

  const onRequestFailed = (request: Request) => {
    failures.push({
      kind: "request-failed",
      method: request.method(),
      resourceType: request.resourceType(),
      url: safeRequestUrl(request.url()),
      category: networkFailureCategory(request.failure()?.errorText ?? null),
    });
  };

  const onResponse = (response: Response) => {
    if (response.status() < 400) return;

    const request = response.request();
    failures.push({
      kind: "http",
      method: request.method(),
      resourceType: request.resourceType(),
      status: response.status(),
      url: safeRequestUrl(response.url()),
    });
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("requestfailed", onRequestFailed);
  page.on("response", onResponse);

  return {
    snapshot: () => ({ failures: [...failures] }),
    stop() {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      page.off("requestfailed", onRequestFailed);
      page.off("response", onResponse);
    },
  };
}

function isAllowed(
  failure: SafeBrowserFailure,
  allowance: FailureAllowance,
) {
  if (
    "category" in failure &&
    (failure.category === "development-transport" ||
      failure.category === "unused-font-preload-advice" ||
      allowance.allowedCategories?.includes(failure.category))
  ) {
    return true;
  }

  if (
    failure.kind === "request-failed" &&
    failure.resourceType === "websocket" &&
    failure.url.includes("/_next/")
  ) {
    return true;
  }

  if (
    failure.kind === "http" &&
    allowance.allowedHttpFailures?.some(
      ({ status, urlPattern }) =>
        failure.status === status && urlPattern.test(failure.url),
    )
  ) {
    return true;
  }

  if (
    failure.kind === "console" &&
    failure.location &&
    allowance.allowedConsoleFailures?.some(
      ({ category, locationPattern }) =>
        failure.category === category &&
        locationPattern.test(failure.location ?? ""),
    )
  ) {
    return true;
  }

  if (
    failure.kind === "http" &&
    allowance.allowedHttpStatuses?.includes(failure.status)
  ) {
    return true;
  }

  if (
    "url" in failure &&
    allowance.allowedUrlPatterns?.some((pattern) => pattern.test(failure.url))
  ) {
    return true;
  }

  return false;
}

export function expectNoUnexpectedBrowserFailures(
  collector: BrowserFailureCollector,
  allowance: FailureAllowance = {},
) {
  const unexpected = collector
    .snapshot()
    .failures.filter((failure) => !isAllowed(failure, allowance));

  expect(
    unexpected,
    "Unexpected browser failures (diagnostics contain categories and redacted paths only)",
  ).toEqual([]);
}

export async function attachBrowserAudit(
  testInfo: TestInfo,
  label: string,
  collector: BrowserFailureCollector,
) {
  await testInfo.attach(`${label}-browser-audit`, {
    body: Buffer.from(JSON.stringify(collector.snapshot(), null, 2), "utf8"),
    contentType: "application/json",
  });
}
