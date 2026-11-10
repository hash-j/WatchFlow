import { describe, expect, it } from "vitest";

import { normalizeSourceNewlines } from "./source-text";

describe.each(["\n", "\r\n"])("SQL source contract with %j newlines", (newline) => {
  const expected = "revoke execute on function public.example(\n  uuid, uuid\n)\n  from public, anon, authenticated, service_role;\n";

  it("preserves the exact signature, role list, indentation and final newline", () => {
    expect(normalizeSourceNewlines(expected.replace(/\n/g, newline))).toBe(expected);
  });

  it("does not hide changed grants, arguments or whitespace", () => {
    for (const changed of [
      expected.replace("revoke", "grant"),
      expected.replace("uuid, uuid", "uuid, text"),
      expected.replace(", authenticated", ""),
      expected.replace("  from", " from"),
    ]) {
      expect(normalizeSourceNewlines(changed.replace(/\n/g, newline))).not.toBe(expected);
    }
  });
});
