import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), mutate: vi.fn(), revalidate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/artwork/server", () => ({ mutateArtwork: mocks.mutate }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { GET } from "../../app/api/artwork/[...path]/route";
import { updateArtworkAction } from "../../app/(app)/actions/artwork";
import { ArtworkError } from "./images";
import { createArtworkPath } from "./paths";
const owner = "11111111-1111-4111-8111-111111111111", listId = "22222222-2222-4222-8222-222222222222", version = "33333333-3333-4333-8333-333333333333";
const path = createArtworkPath(owner, { kind: "avatar" }, version);
function readImage(image = new Blob(["RIFFxxxxWEBPdata"], { type: "image/webp" })) {
  const download = vi.fn().mockResolvedValue({ data: image, error: null });
  const claims = vi.fn().mockResolvedValue({ data: { claims: { sub: owner } }, error: null });
  const client = { auth: { getClaims: claims }, storage: { from: vi.fn(() => ({ download })) } };
  mocks.client.mockResolvedValue(client);
  return { client, download, claims };
}
const request = (name: string) => GET(new Request("https://local.invalid/api/artwork"), { params: Promise.resolve({ path: name.split("/") }) });
beforeEach(() => { vi.resetAllMocks(); });
describe("private same-origin image GET", () => {
  it("delivers only an authenticated owned raster without public or shared caches", async () => {
    const h = readImage(), response = await request(path);
    expect(response.status).toBe(200); expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("Cache-Control")).toContain("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(h.download).toHaveBeenCalledExactlyOnceWith(path);
  });
  it("denies unauthenticated or cross-user requests before any object download", async () => {
    const h = readImage(); h.claims.mockResolvedValueOnce({ data: null, error: {} });
    expect((await request(path)).status).toBe(401); expect(h.download).not.toHaveBeenCalled();
    expect((await request(createArtworkPath(version, { kind: "avatar" }, owner))).status).toBe(404);
    expect(h.download).not.toHaveBeenCalled();
  });
  it("rejects paths, missing objects, spoofed SVG/HTML, and storage errors safely", async () => {
    const h = readImage();
    expect((await request(`avatars/${owner}/../secret`)).status).toBe(404);
    h.download.mockResolvedValueOnce({ data: null, error: { message: "SECRET_ERROR" } });
    expect((await request(path)).status).toBe(404);
    readImage(new Blob(["<svg>not a raster</svg>"], { type: "image/webp" }));
    expect((await request(path)).status).toBe(404);
    mocks.client.mockRejectedValueOnce(new Error("SECRET_ERROR"));
    const result = await request(path); expect(result.status).toBe(503); expect(await result.text()).not.toContain("SECRET_ERROR");
  });
});
describe("artwork action boundaries", () => {
  it("ignores supplied owners/object paths, accepts only a validated target and refreshes global avatars", async () => {
    const file = new File(["image"], "image.png"), form = new FormData();
    form.set("kind", "avatar"); form.set("operation", "upload"); form.set("image", file);
    form.set("userId", "other-user"); form.set("path", "someone-elses-image");
    mocks.mutate.mockResolvedValue({ status: "success", message: "saved" });
    expect((await updateArtworkAction({ status: "idle", message: "" }, form)).status).toBe("success");
    expect(mocks.mutate).toHaveBeenCalledWith({ kind: "avatar" }, "upload", file);
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
  });
  it("validates list IDs and limits thumbnail invalidation to list views", async () => {
    const form = new FormData(); form.set("kind", "list"); form.set("operation", "remove"); form.set("listId", "../bad");
    expect((await updateArtworkAction({ status: "idle", message: "" }, form)).status).toBe("error");
    expect(mocks.mutate).not.toHaveBeenCalled(); form.set("listId", listId);
    mocks.mutate.mockResolvedValue({ status: "success", message: "removed" });
    await updateArtworkAction({ status: "idle", message: "" }, form);
    expect(mocks.mutate).toHaveBeenCalledWith({ kind: "list", listId }, "remove", null);
    expect(mocks.revalidate.mock.calls).toEqual([["/lists"], [`/lists/${listId}`]]);
  });
  it("returns only controlled errors", async () => {
    const form = new FormData(); form.set("kind", "avatar"); form.set("operation", "remove");
    mocks.mutate.mockRejectedValueOnce(new ArtworkError("Sign in again."));
    expect((await updateArtworkAction({ status: "idle", message: "" }, form)).message).toBe("Sign in again.");
    mocks.mutate.mockRejectedValueOnce(new Error("PRIVATE_STORAGE_DETAILS"));
    expect((await updateArtworkAction({ status: "idle", message: "" }, form)).message).not.toContain("PRIVATE_STORAGE_DETAILS");
  });
});
