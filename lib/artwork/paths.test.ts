import { describe, expect, it } from "vitest";
import { artworkSource, createArtworkPath, ownsArtworkPath, parseArtworkPath, profileInitials } from "./paths";
const owner = "11111111-1111-4111-8111-111111111111", list = "22222222-2222-4222-8222-222222222222", version = "33333333-3333-4333-8333-333333333333";
describe("private artwork references", () => {
  it("generates immutable separate namespaces without any uploaded filename", () => {
    expect(createArtworkPath(owner, { kind: "avatar" }, version)).toBe(`avatars/${owner}/${version}.webp`);
    expect(createArtworkPath(owner, { kind: "list", listId: list }, version)).toBe(`list-thumbnails/${owner}/${list}/${version}.webp`);
    expect(() => createArtworkPath(owner, { kind: "list", listId: "../other" }, version)).toThrow();
  });
  it("requires exact owner and list identity for cleanup/rendering", () => {
    const path = createArtworkPath(owner, { kind: "list", listId: list }, version);
    expect(ownsArtworkPath(path, owner, { kind: "list", listId: list })).toBe(true);
    expect(ownsArtworkPath(path, version, { kind: "list", listId: list })).toBe(false);
    expect(ownsArtworkPath(path, owner, { kind: "list", listId: version })).toBe(false);
    expect(ownsArtworkPath(path, owner, { kind: "avatar" })).toBe(false);
    expect(artworkSource(path)).toBe(`/api/artwork/${path}`);
  });
  it.each(["https://evil.invalid/image.png", "../secret", `avatars/${owner}/../${version}.webp`,
    `avatars/${owner}/${version}.svg`, `avatars/${owner}/${version}.webp?x=1`, `avatars/${owner}/${version}.webp#x`,
    `avatars/${owner}/%2e%2e`, `avatars/${owner}/sub/${version}.webp`, `avatars/${owner}/${version}\n.webp`, "", null])("rejects arbitrary or traversing reference %s", path => {
    expect(parseArtworkPath(path)).toBeNull(); expect(artworkSource(path)).toBeNull();
  });
  it("has one consistent initials fallback", () => {
    expect(profileInitials(" Hashim Ali ", "email@example.invalid")).toBe("HA");
    expect(profileInitials(null, "hashim@example.invalid")).toBe("H"); expect(profileInitials("")).toBe("W");
  });
});
