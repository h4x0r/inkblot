import { describe, expect, it } from "vitest";
import {
  binCommitsHourly,
  detectOnsetWindow,
  findOnsetIndex,
  gaussianSmooth,
  HOUR_MS,
  type CommitEvent,
} from "./activity";

describe("gaussianSmooth", () => {
  it("returns a copy unchanged when sigma is 0 (identity)", () => {
    const v = [0, 0, 5, 0, 0];
    const out = gaussianSmooth(v, 0);
    expect(out).toEqual(v);
    expect(out).not.toBe(v); // copy, not the same array
  });

  it("spreads a single spike symmetrically and keeps its peak centered", () => {
    // interior spike (length 21, spike at 10) so edge truncation is negligible
    const v = new Array<number>(21).fill(0);
    v[10] = 1;
    const out = gaussianSmooth(v, 1);
    // peak stays at the center index
    expect(out.indexOf(Math.max(...out))).toBe(10);
    // symmetric about the center
    expect(out[9]).toBeCloseTo(out[11], 10);
    expect(out[8]).toBeCloseTo(out[12], 10);
    // away from edges a normalized kernel preserves total mass
    const mass = out.reduce((a, b) => a + b, 0);
    expect(mass).toBeCloseTo(1, 6);
  });
});

describe("findOnsetIndex", () => {
  it("finds the ramp and backs up by the pad (no smoothing)", () => {
    // 50 quiet bins then 50 busy bins; peak = 10, threshold = 0.2*10 = 2
    const v = [...Array(50).fill(0), ...Array(50).fill(10)];
    const idx = findOnsetIndex(v, { sigmaBins: 0, peakFraction: 0.2, padBins: 5 });
    // crossing is at index 50; padded back 5 => 45
    expect(idx).toBe(45);
  });

  it("never returns a negative index", () => {
    const v = [10, 10, 10];
    const idx = findOnsetIndex(v, { sigmaBins: 0, peakFraction: 0.2, padBins: 5 });
    expect(idx).toBe(0);
  });

  it("returns 0 for an all-zero series (no activity)", () => {
    expect(findOnsetIndex([0, 0, 0], { sigmaBins: 0 })).toBe(0);
  });
});

describe("binCommitsHourly", () => {
  it("buckets commits into per-repo hourly counts", () => {
    const base = Date.UTC(2026, 0, 1, 0, 0, 0); // hour-aligned
    const events: CommitEvent[] = [
      { repo: "a", ts: base + 10 * 60_000 }, // 00:10 -> bin 0
      { repo: "a", ts: base + 50 * 60_000 }, // 00:50 -> bin 0
      { repo: "b", ts: base + 2 * HOUR_MS + 30 * 60_000 }, // 02:30 -> bin 2
    ];
    const s = binCommitsHourly(events);
    expect(s.start).toBe(base);
    expect(s.stepHours).toBe(1);
    expect(s.hours).toBe(3);
    expect(s.series.a).toEqual([2, 0, 0]);
    expect(s.series.b).toEqual([0, 0, 1]);
    expect(s.totals).toEqual({ a: 2, b: 1 });
  });

  it("throws on empty input rather than silently returning empty", () => {
    expect(() => binCommitsHourly([])).toThrow();
  });
});

describe("detectOnsetWindow", () => {
  it("starts the window just before the fleet's activity ramps up", () => {
    // build an hourly series: repo 'x' quiet for 50h, busy for 50h
    const start = Date.UTC(2026, 0, 1, 0, 0, 0);
    const counts = [...Array(50).fill(0), ...Array(50).fill(8)];
    const s = {
      start,
      stepHours: 1,
      hours: 100,
      series: { x: counts },
      totals: { x: counts.reduce((a, b) => a + b, 0) },
    };
    const w = detectOnsetWindow(s, { sigmaBins: 0, peakFraction: 0.2, padBins: 5 });
    // onset index 45 -> from = start + 45h; to = last bin
    expect(w.fromIndex).toBe(45);
    expect(w.from).toBe(start + 45 * HOUR_MS);
    expect(w.to).toBe(start + 99 * HOUR_MS);
  });
});
