import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/image", () => ({ default: (props: Record<string, unknown>) => createElement("img",
  Object.fromEntries(Object.entries(props).filter(([key]) => !["unoptimized", "fill"].includes(key)))) }));
import { UserAvatar } from "../../components/artwork/user-avatar";
import { ListArtwork } from "../../components/lists/list-artwork";
const source = (path: string) => readFileSync(resolve(path), "utf8");
const migration = "202611020001_private_profile_and_list_artwork.sql";
const sql = source(`supabase/migrations/${migration}`);
describe("artwork migration isolation and ownership", () => {
  it("is one forward migration with only the required column, bucket, grants and policies", () => {
    expect(readdirSync("supabase/migrations").filter(name => name.startsWith("202611020001"))).toEqual([migration]);
    expect(sql).toContain("alter table public.lists add column thumbnail_path text");
    expect(sql).toContain("grant update (thumbnail_path)");
    expect(sql).toContain("'watchflow-artwork', 'watchflow-artwork', false, 2097152, array['image/webp']");
    expect(sql).not.toMatch(/calendar_|qstash|service_role|security definer|disable row level/i);
    expect(sql).toContain("relrowsecurity");
  });
  it("protects both namespaces by owner and requires list ownership for inserts", () => {
    expect(sql).toContain("split_part(p_name, '/', 2) = (select auth.uid())::text");
    expect(sql).toContain("l.user_id = (select auth.uid())");
    expect(sql).toContain("user_id::text || '/' || id::text");
    expect(sql).toContain("new.id::text");
    expect(sql).toContain("new.avatar_url is distinct from old.avatar_url");
  });
  it("uses restrictive bucket-only guards so other permissive policies cannot grant cross-owner access or overwrite", () => {
    expect(sql).toContain("as restrictive for all to public"); expect(sql).toContain("as restrictive for update to public");
    expect(sql).toContain("using (bucket_id <> 'watchflow-artwork') with check (bucket_id <> 'watchflow-artwork')");
    expect(sql).toContain("as restrictive for insert to authenticated");
    expect(sql.match(/create policy /g)).toHaveLength(6);
  });
});
describe("shared UI, fallbacks and replacement URLs", () => {
  const owner = "11111111-1111-4111-8111-111111111111", listId = "22222222-2222-4222-8222-222222222222", version = "33333333-3333-4333-8333-333333333333";
  it("renders initials for absent/foreign/external profile images and a private URL for an owned image", () => {
    for (const path of [null, "https://example.invalid/external.jpg", `avatars/${version}/${owner}.webp`]) {
      const markup = renderToStaticMarkup(createElement(UserAvatar, { ownerId: owner, name: "Hashim Ali", path }));
      expect(markup).toContain("HA"); expect(markup).not.toContain("<img");
    }
    expect(renderToStaticMarkup(createElement(UserAvatar, { ownerId: owner, path: `avatars/${owner}/${version}.webp` }))).toContain(`/api/artwork/avatars/${owner}/${version}.webp`);
  });
  it("preserves the poster/empty-list collage when no valid custom artwork is set", () => {
    const props = { listId, listName: "Mine", posterPaths: [] };
    expect(renderToStaticMarkup(createElement(ListArtwork, props))).toContain("No movies yet");
    expect(renderToStaticMarkup(createElement(ListArtwork, { ...props, posterPaths: ["/poster.jpg"] }))).toContain("image.tmdb.org");
    expect(renderToStaticMarkup(createElement(ListArtwork, { ...props, path: `list-thumbnails/${owner}/${listId}/${version}.webp` }))).toContain(`/api/artwork/list-thumbnails/${owner}/${listId}/${version}.webp`);
  });
  it("shares the avatar and keeps list cover management in the create/edit form", () => {
    for (const path of ["app/(app)/settings/profile/page.tsx", "components/app-shell.tsx", "components/mobile-app-navigation.tsx"]) expect(source(path)).toContain("UserAvatar");
    expect(source("components/lists/list-card.tsx")).toContain("ListArtwork");
    expect(source("app/(app)/lists/[listId]/page.tsx")).not.toContain("ListArtworkDialog");
    expect(source("app/(app)/lists/[listId]/page.tsx")).not.toContain("<ListArtwork");
    expect(source("components/lists/list-details-form.tsx")).toContain("ListCoverField");
    expect(source("components/lists/list-card.tsx")).not.toContain("ArtworkEditor");
    expect(source("components/artwork/artwork-image.tsx")).toContain("source === failedSource");
    expect(source("components/artwork/artwork-editor.tsx")).toContain("URL.revokeObjectURL");
    expect(source("components/artwork/artwork-image.tsx")).not.toContain("createSignedUrl(");
  });
});
