import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
import { normalizeArtwork } from "./images";
import { MAX_ARTWORK_BYTES } from "./paths";
const pixels = () => sharp({ create: { width: 4, height: 8, channels: 3, background: "red" } });
describe("server image decoding and normalization", () => {
  it.each(["jpeg", "png", "webp"] as const)("accepts %s and emits a metadata-free WebP", async format => {
    const input = await pixels().withMetadata({ exif: { IFD0: { Artist: "test metadata" } } }).toFormat(format).toBuffer();
    const output = await normalizeArtwork(new File([new Uint8Array(input)], "untrusted-name", { type: `image/${format}` }));
    const metadata = await sharp(output).metadata();
    expect(metadata.format).toBe("webp"); expect(metadata.exif).toBeUndefined();
    expect(metadata.width).toBeLessThanOrEqual(1024); expect(metadata.height).toBeLessThanOrEqual(1024);
  });
  it.each(["image/svg+xml", "image/gif", "text/html", "application/octet-stream"])("rejects unsupported MIME %s", async type => {
    await expect(normalizeArtwork(new File(["unsupported"], "photo.png", { type }))).rejects.toThrow("JPEG, PNG or WebP");
  });
  it("rejects oversized, empty and missing input", async () => {
    await expect(normalizeArtwork(new File([new Uint8Array(MAX_ARTWORK_BYTES + 1)], "huge.png", { type: "image/png" }))).rejects.toThrow("2 MiB");
    await expect(normalizeArtwork(new File([], "empty.png", { type: "image/png" }))).rejects.toThrow("Choose an image");
    await expect(normalizeArtwork(null)).rejects.toThrow("Choose an image");
  });
  it("does not trust the MIME claim, extension or a magic prefix alone", async () => {
    const jpeg = await pixels().jpeg().toBuffer();
    for (const bytes of [Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") , jpeg, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])]) {
      await expect(normalizeArtwork(new File([new Uint8Array(bytes)], "fake.png", { type: "image/png" }))).rejects.toThrow("could not be read");
    }
  });
  it("enforces the decoded pixel limit even for small compressed files", async () => {
    const bytes = await sharp({ create: { width: 5000, height: 4001, channels: 3, background: "blue" } }).png().toBuffer();
    expect(bytes.length).toBeLessThan(MAX_ARTWORK_BYTES);
    await expect(normalizeArtwork(new File([new Uint8Array(bytes)], "large-dimensions.png", { type: "image/png" }))).rejects.toThrow("under 20 megapixels");
  });
});
