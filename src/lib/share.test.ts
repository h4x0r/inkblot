import { describe, expect, it } from "vitest";
import { decodeShare, encodeShare } from "./share";

const BLOB = "https://abc123.public.blob.vercel-storage.com/charts/chart-xyz.png";

describe("share token codec", () => {
  it("round-trips a valid blob URL + title", () => {
    const token = encodeShare({ u: BLOB, t: "h4x0r's GitHub Activity History" });
    expect(decodeShare(token)).toEqual({
      u: BLOB,
      t: "h4x0r's GitHub Activity History",
    });
  });

  it("rejects non-Vercel-Blob hosts (no arbitrary og:image)", () => {
    const token = encodeShare({ u: "https://evil.example.com/x.png", t: "x" });
    expect(decodeShare(token)).toBeNull();
  });

  it("rejects non-https URLs", () => {
    const token = encodeShare({
      u: "http://abc.public.blob.vercel-storage.com/a.png",
      t: "x",
    });
    expect(decodeShare(token)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(decodeShare("not-base64-json")).toBeNull();
    expect(decodeShare("")).toBeNull();
  });

  it("clamps an over-long title", () => {
    const token = encodeShare({ u: BLOB, t: "x".repeat(500) });
    const out = decodeShare(token);
    expect(out?.t.length).toBeLessThanOrEqual(200);
  });
});
