import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/app/(app)/actions/lists", () => ({ createListAction: vi.fn(), updateListAction: vi.fn() }));
vi.mock("next/image", () => ({ default: (props: Record<string, unknown>) => createElement("img",
  Object.fromEntries(Object.entries(props).filter(([key]) => !["unoptimized", "fill"].includes(key)))) }));
import { CreateListDialog } from "@/components/lists/create-list-dialog";
import { EditListDialog } from "@/components/lists/edit-list-dialog";

const list = { id: "22222222-2222-4222-8222-222222222222", name: "Weekend Movies", description: "For Friday nights",
  visibility: "private" as const, createdAt: "2026-11-03T00:00:00Z", updatedAt: "2026-11-03T00:00:00Z",
  thumbnailPath: "list-thumbnails/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.webp" };
describe("list cover management belongs to list forms", () => {
  it("creates without a required image using one accessible form with name, description and prominent cover action", () => {
    const html = renderToStaticMarkup(createElement(CreateListDialog));
    expect(html.match(/<form\b/g)).toHaveLength(1);
    expect(html).toContain('name="name"'); expect(html).toContain('name="description"');
    expect(html).toContain("Upload cover image"); expect(html).toContain("Optional");
    expect(html).toContain("JPEG, PNG or WebP"); expect(html).toContain("2 MiB");
    expect(html).toContain('name="coverOperation" value="keep"');
    expect(html).not.toMatch(/type="file"[^>]*required/);
    expect(html).toContain('aria-label="Choose cover image"');
  });
  it("shows current artwork with replace/remove controls inside the same edit form", () => {
    const html = renderToStaticMarkup(createElement(EditListDialog, { list }));
    expect(html.match(/<form\b/g)).toHaveLength(1);
    expect(html).toContain("Replace cover image"); expect(html).toContain("Remove cover");
    expect(html).toContain("Current list cover"); expect(html).toContain(`/api/artwork/${list.thumbnailPath}`);
    expect(html).toContain('name="listId"'); expect(html).toContain("For Friday nights");
    expect(html).not.toContain("Edit thumbnail");
  });
  it("handles an empty or malformed stored cover with an upload state", () => {
    for (const thumbnailPath of [null, "https://example.invalid/foreign.png"]) {
      const html = renderToStaticMarkup(createElement(EditListDialog, { list: { ...list, thumbnailPath } }));
      expect(html).toContain("Upload cover image"); expect(html).not.toContain("Remove cover");
      expect(html).not.toContain("example.invalid");
    }
  });
});
