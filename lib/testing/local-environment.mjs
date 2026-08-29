import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseEnvironmentLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const separator = trimmed.indexOf("=");
  if (separator <= 0) return null;

  const name = trimmed.slice(0, separator).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return null;

  let value = trimmed.slice(separator + 1).trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1);
  }

  return { name, value };
}

/**
 * Loads ignored local QA configuration without overriding explicit shell/CI
 * variables. Application configuration comes from .env.local first; the test
 * file contributes only QA-specific values that are still missing.
 */
export function loadLocalTestEnvironment(
  environment = process.env,
  directory = process.cwd(),
) {
  for (const filename of [".env.local", ".env.test.local"]) {
    const path = resolve(directory, filename);
    if (!existsSync(path)) continue;

    const fileEnvironment = {};
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const entry = parseEnvironmentLine(line);
      if (!entry) continue;
      fileEnvironment[entry.name] = entry.value;
    }

    for (const [name, value] of Object.entries(fileEnvironment)) {
      if (environment[name] === undefined || environment[name]?.trim() === "") {
        environment[name] = value;
      }
    }
  }
}
