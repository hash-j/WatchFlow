import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), normalize: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("./images", async importOriginal => ({ ...await importOriginal<typeof import("./images")>(), normalizeArtwork: mocks.normalize }));
import { mutateArtwork, deleteAccountArtwork } from "./server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArtworkError } from "./images";
import { ARTWORK_BUCKET, createArtworkPath, ownsArtworkPath, type ArtworkTarget } from "./paths";
const owner = "11111111-1111-4111-8111-111111111111", listId = "22222222-2222-4222-8222-222222222222", version = "33333333-3333-4333-8333-333333333333";
function setup(target: ArtworkTarget, old: string | null = null) {
  const column = target.kind === "avatar" ? "avatar_url" : "thumbnail_path";
  const read = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: target.kind === "avatar" ? owner : listId, [column]: old }, error: null }) };
  read.select.mockReturnValue(read); read.eq.mockReturnValue(read);
  const write = { update: vi.fn(), eq: vi.fn(), is: vi.fn(), select: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: "saved" }, error: null }) };
  for (const method of ["update", "eq", "is", "select"] as const) write[method].mockReturnValue(write);
  const storage = { upload: vi.fn().mockResolvedValue({ error: null }), remove: vi.fn().mockResolvedValue({ error: null }) };
  const client = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: owner } }, error: null }) },
    from: vi.fn().mockReturnValueOnce(read).mockReturnValue(write), storage: { from: vi.fn(() => storage) } };
  mocks.client.mockResolvedValue(client);
  return { read, write, storage, client };
}
beforeEach(() => { vi.resetAllMocks(); mocks.normalize.mockResolvedValue(Buffer.from("normalized-webp")); });
describe.each([{ kind: "avatar" } as const, { kind: "list", listId } as const])("owner-scoped $kind artwork", target => {
  it("uploads only a server-generated owned path and updates the scoped reference", async () => {
    const h = setup(target), file = new File(["mock"], "../../someone-else.svg");
    expect((await mutateArtwork(target, "upload", file)).status).toBe("success");
    expect(h.client.auth.getUser).toHaveBeenCalledOnce(); expect(h.client.storage.from).toHaveBeenCalledWith(ARTWORK_BUCKET);
    const path = h.storage.upload.mock.calls[0][0]; expect(ownsArtworkPath(path, owner, target)).toBe(true);
    expect(h.storage.upload.mock.calls[0][2]).toMatchObject({ contentType: "image/webp", upsert: false });
    expect(h.write.is).toHaveBeenCalledWith(target.kind === "avatar" ? "avatar_url" : "thumbnail_path", null);
    expect(h.write.eq).toHaveBeenCalledWith("id", target.kind === "avatar" ? owner : listId);
    if (target.kind === "list") { expect(h.read.eq).toHaveBeenCalledWith("user_id", owner); expect(h.write.eq).toHaveBeenCalledWith("user_id", owner); }
    expect(h.storage.remove).not.toHaveBeenCalled();
  });
  it("replaces with a new immutable name before cleaning the old object", async () => {
    const old = createArtworkPath(owner, target, version), h = setup(target, old);
    await mutateArtwork(target, "upload", new File(["mock"], "new.jpg"));
    expect(h.storage.upload.mock.calls[0][0]).not.toBe(old);
    expect(h.write.eq).toHaveBeenCalledWith(target.kind === "avatar" ? "avatar_url" : "thumbnail_path", old);
    expect(h.storage.remove).toHaveBeenCalledWith([old]);
    expect(h.write.maybeSingle.mock.invocationCallOrder[0]).toBeLessThan(h.storage.remove.mock.invocationCallOrder[0]);
  });
  it("removes the reference and stored object, restoring the UI fallback", async () => {
    const old = createArtworkPath(owner, target, version), h = setup(target, old);
    const result = await mutateArtwork(target, "remove");
    expect(result.message).toContain("default image is restored");
    expect(h.write.update).toHaveBeenCalledWith({ [target.kind === "avatar" ? "avatar_url" : "thumbnail_path"]: null });
    expect(h.storage.remove).toHaveBeenCalledWith([old]); expect(h.storage.upload).not.toHaveBeenCalled();
  });
  it("rejects nonexistent or inaccessible owner rows without a storage write", async () => {
    const h = setup(target); h.read.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(mutateArtwork(target, "upload", new File(["mock"], "x.png"))).rejects.toThrow();
    expect(h.storage.upload).not.toHaveBeenCalled(); expect(h.write.update).not.toHaveBeenCalled();
  });
  it("rejects invalid images and upload failures without changing existing metadata", async () => {
    const h = setup(target); mocks.normalize.mockRejectedValueOnce(new ArtworkError("invalid file"));
    await expect(mutateArtwork(target, "upload", null)).rejects.toThrow("invalid file");
    expect(h.write.update).not.toHaveBeenCalled();
    setup(target).storage.upload.mockResolvedValueOnce({ error: { message: "PRIVATE_RAW_STORAGE_ERROR" } });
    await expect(mutateArtwork(target, "upload", null)).rejects.toThrow("could not be uploaded");
  });
  it("keeps old objects on uncertain metadata errors and cleans only its uncommitted object on a conflict", async () => {
    const old = createArtworkPath(owner, target, version), h = setup(target, old);
    h.write.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "private" } });
    await expect(mutateArtwork(target, "upload", null)).rejects.toThrow("could not be confirmed");
    expect(h.storage.remove).not.toHaveBeenCalled();
    const conflict = setup(target, old); conflict.write.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(mutateArtwork(target, "upload", null)).rejects.toThrow("another tab");
    expect(conflict.storage.remove).toHaveBeenCalledWith([conflict.storage.upload.mock.calls[0][0]]);
    expect(conflict.storage.remove).not.toHaveBeenCalledWith([old]);
  });
  it("reports remove-write failures and stored-file cleanup failures honestly", async () => {
    const old = createArtworkPath(owner, target, version), h = setup(target, old);
    h.write.maybeSingle.mockResolvedValueOnce({ data: null, error: {} });
    await expect(mutateArtwork(target, "remove")).rejects.toThrow("could not be confirmed");
    expect(h.storage.remove).not.toHaveBeenCalled();
    const cleanup = setup(target, old); cleanup.storage.remove.mockResolvedValueOnce({ error: {} });
    expect((await mutateArtwork(target, "remove")).message).toContain("cleanup failed");
  });
});
it("requires a fresh authenticated user and never cleans another owner's reference", async () => {
  const target = { kind: "avatar" } as const, h = setup(target);
  h.client.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: {} });
  await expect(mutateArtwork(target, "remove")).rejects.toThrow("Sign in again");
  expect(h.client.from).not.toHaveBeenCalled();
  const external = setup(target, createArtworkPath(version, target, owner));
  await mutateArtwork(target, "remove"); expect(external.storage.remove).not.toHaveBeenCalled();
});
it("cleans owned artwork in batches before account deletion, never another user's files", async () => {
  const path = createArtworkPath(owner, { kind: "avatar" }, version);
  const rpc = vi.fn().mockResolvedValueOnce({ data: [path], error: null }).mockResolvedValueOnce({ data: [], error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const client = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: owner } }, error: null }) },
    rpc, storage: { from: vi.fn(() => ({ remove })) } };
  await deleteAccountArtwork(client as unknown as SupabaseClient, owner);
  expect(remove).toHaveBeenCalledExactlyOnceWith([path]); expect(rpc).toHaveBeenCalledTimes(2);
  rpc.mockResolvedValueOnce({ data: [createArtworkPath(version, { kind: "avatar" }, owner)], error: null });
  await expect(deleteAccountArtwork(client as unknown as SupabaseClient, owner)).rejects.toThrow("could not be checked");
  expect(remove).toHaveBeenCalledOnce();
  rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } });
  await expect(deleteAccountArtwork(client as unknown as SupabaseClient, owner)).resolves.toBeUndefined();
  rpc.mockResolvedValueOnce({ data: [path], error: null }); remove.mockResolvedValueOnce({ error: {} });
  await expect(deleteAccountArtwork(client as unknown as SupabaseClient, owner)).rejects.toThrow("remains active");
});
