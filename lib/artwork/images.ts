import "server-only";
import sharp from "sharp";
import { artworkFileError, MAX_ARTWORK_BYTES } from "./paths";

export class ArtworkError extends Error {}
export async function normalizeArtwork(file: unknown): Promise<Buffer> {
  if (!(file instanceof File)) throw new ArtworkError("Choose an image to upload.");
  const error = artworkFileError(file);
  if (error) throw new ArtworkError(error);
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const signatureMatches = file.type === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) :
      file.type === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 :
        bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
    if (!signatureMatches) throw new Error("Image signature mismatch");
    const image = sharp(bytes, { limitInputPixels: 20_000_000, animated: false, failOn: "warning" });
    const metadata = await image.metadata();
    const expected: Record<string, string> = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
    if (metadata.format !== expected[file.type] || (metadata.pages ?? 1) !== 1) throw new Error("Unsupported image content");
    // Re-encode decoded pixels: no SVG, original metadata or uploaded filename.
    const output = await image.rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    if (output.length > MAX_ARTWORK_BYTES) throw new Error("Output too large");
    return output;
  } catch { throw new ArtworkError("This image could not be read. Choose a valid JPEG, PNG or WebP image under 20 megapixels."); }
}
