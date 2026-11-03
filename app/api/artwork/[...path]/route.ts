import { createClient } from "@/lib/supabase/server";
import { ARTWORK_BUCKET, MAX_ARTWORK_BYTES, parseArtworkPath } from "@/lib/artwork/paths";

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin", "Vary": "Cookie" };
  try {
    const path = (await context.params).path.join("/");
    const parsed = parseArtworkPath(path);
    if (!parsed) return new Response(null, { status: 404, headers });
    const client = await createClient();
    const { data, error } = await client.auth.getClaims();
    if (error || !data?.claims?.sub) return new Response(null, { status: 401, headers });
    if (parsed.ownerId !== data.claims.sub) return new Response(null, { status: 404, headers });
    const result = await client.storage.from(ARTWORK_BUCKET).download(path);
    if (result.error || !result.data || result.data.size > MAX_ARTWORK_BYTES) return new Response(null, { status: 404, headers });
    const buffer = await result.data.arrayBuffer(), bytes = new Uint8Array(buffer);
    // Never serve a spoofed SVG/HTML upload, even if a caller bypassed the UI.
    if (bytes.length < 12 || String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" || String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP") {
      return new Response(null, { status: 404, headers });
    }
    return new Response(buffer, { headers: { ...headers, "Content-Type": "image/webp", "Content-Disposition": 'inline; filename="artwork.webp"' } });
  } catch { return new Response(null, { status: 503, headers }); }
}
