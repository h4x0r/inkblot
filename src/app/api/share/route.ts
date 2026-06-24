import { put } from "@vercel/blob";
import { auth } from "@/auth";
import { encodeShare } from "@/lib/share";

export const maxDuration = 30;

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function appOrigin(req: Request): string {
  if (process.env.AUTH_URL) return process.env.AUTH_URL.replace(/\/+$/, "");
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

/**
 * Persist the caller's rendered chart PNG to Vercel Blob (public, unguessable
 * key) and return a /s/<token> share URL whose OG image is that chart. Auth-
 * gated: only a signed-in user can publish a share link. The act of calling
 * this is the user's explicit opt-in to create a public link.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_BYTES) {
    return Response.json({ error: "payload size" }, { status: 413 });
  }
  if (!bytes.subarray(0, 8).equals(PNG_SIG)) {
    return Response.json({ error: "not a PNG" }, { status: 415 });
  }

  const title = (
    new URL(req.url).searchParams.get("title") || "GitHub Activity History"
  ).slice(0, 120);

  let blob;
  try {
    blob = await put("charts/chart.png", bytes, {
      access: "public",
      contentType: "image/png",
      addRandomSuffix: true,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("share: blob put failed:", detail);
    return Response.json({ error: "store_failed", detail }, { status: 502 });
  }

  const token = encodeShare({ u: blob.url, t: title });
  return Response.json({
    shareUrl: `${appOrigin(req)}/s/${token}`,
    image: blob.url,
  });
}
