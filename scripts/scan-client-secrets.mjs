import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { relative, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const staticExtensions = new Set([
  ".body",
  ".html",
  ".js",
  ".json",
  ".rsc",
  ".txt",
]);
const renderedPayloadExtensions = new Set([
  ".body",
  ".html",
  ".json",
  ".rsc",
  ".txt",
]);
const serverSecretNames = [
  "SUPABASE_SECRET_KEY",
  "TMDB_READ_ACCESS_TOKEN",
  "VAPID_PRIVATE_KEY",
  "WATCHFLOW_SCHEDULER_SECRET",
  "WATCHFLOW_DEV_SCHEDULER_SECRET",
  "WATCHFLOW_EXPECTED_SUPABASE_PROJECT_REF",
  "CRON_SECRET",
  "GOOGLE_CALENDAR_CLIENT_SECRET",
  "GOOGLE_CALENDAR_CLIENT_ID",
  "GOOGLE_CALENDAR_REDIRECT_URI",
  "CALENDAR_TOKEN_ENCRYPTION_KEY",
];

function extension(path) {
  const dot = path.lastIndexOf(".");
  return dot < 0 ? "" : path.slice(dot).toLowerCase();
}

function filesUnder(directory, allowedExtensions) {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path, allowedExtensions);
    if (!entry.isFile() || !allowedExtensions.has(extension(path))) {
      return [];
    }
    return [path];
  });
}

function parseEnvironmentFile(path) {
  if (!existsSync(path)) return new Map();

  const values = new Map();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/,
    );
    if (!match) continue;

    let value = match[2] ?? "";
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values.set(match[1], value);
  }
  return values;
}

const localEnvironment = parseEnvironmentFile(
  resolve(repositoryRoot, ".env.local"),
);
const forbiddenPatterns = [
  {
    category: "Supabase secret-key-shaped value",
    test: (contents) => /sb_secret_[A-Za-z0-9_-]{12,}/.test(contents),
  },
  ...serverSecretNames.map((value) => ({
    category: "server-only environment-variable name",
    test: (contents) => contents.includes(value),
  })),
  ...serverSecretNames.flatMap((name) => {
    const value = process.env[name] ?? localEnvironment.get(name) ?? "";
    return value.length >= 8
      ? [
          {
            category: `${name} configured value`,
            test: (contents) => contents.includes(value),
          },
        ]
      : [];
  }),
];
const reviewPatterns = [
  { category: "Supabase secret-prefix SDK sentinel", value: "sb_secret_" },
  { category: "Supabase service-role SDK marker", value: "service_role" },
];
const files = [
  ...filesUnder(resolve(repositoryRoot, ".next", "static"), staticExtensions),
  ...filesUnder(
    resolve(repositoryRoot, ".next", "server", "app"),
    renderedPayloadExtensions,
  ),
];

if (files.length === 0) {
  console.error(
    "Client secret scan could not find built browser artifacts. Run npm run build first.",
  );
  process.exitCode = 1;
} else {
  const findings = [];
  const reviewedMarkers = [];
  for (const path of files) {
    if (statSync(path).size > 25 * 1024 * 1024) continue;
    const contents = readFileSync(path, "utf8");
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(contents)) {
        findings.push({
          path: relative(repositoryRoot, path).replaceAll("\\", "/"),
          category: pattern.category,
        });
      }
    }
    for (const pattern of reviewPatterns) {
      if (contents.includes(pattern.value)) {
        reviewedMarkers.push({
          path: relative(repositoryRoot, path).replaceAll("\\", "/"),
          category: pattern.category,
        });
      }
    }
  }

  const uniqueFindings = [
    ...new Map(
      findings.map((finding) => [
        `${finding.path}\0${finding.category}`,
        finding,
      ]),
    ).values(),
  ];

  if (uniqueFindings.length > 0) {
    console.error("Client secret scan found forbidden pattern categories:");
    for (const finding of uniqueFindings) {
      console.error(`- ${finding.path}: ${finding.category}`);
    }
    process.exitCode = 1;
  } else {
    console.log(
      `Client secret scan passed: ${files.length} browser artifact files checked; no forbidden pattern categories found.`,
    );
    for (const marker of reviewedMarkers) {
      console.log(
        `- ${marker.path}: ${marker.category}; configured secret value leak: no`,
      );
    }
  }
}
