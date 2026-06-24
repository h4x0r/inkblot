import { describe, expect, it } from "vitest";
import {
  binCommitsHourly,
  decodeRepoMask,
  defaultRepoSelection,
  detectOnsetWindow,
  encodeRepoMask,
  findOnsetIndex,
  gaussianSmooth,
  HOUR_MS,
  parseChartParams,
  type CommitEvent,
} from "./activity";

describe("parseChartParams", () => {
  const p = (s: string) => parseChartParams(new URLSearchParams(s));

  it("parses epoch-ms and ISO from/to", () => {
    expect(p("from=1700000000000&to=1700100000000")).toMatchObject({
      from: 1700000000000,
      to: 1700100000000,
    });
    const r = p("from=2026-03-01&to=2026-06-24T12:00");
    expect(r.from).toBe(Date.parse("2026-03-01"));
    expect(r.to).toBe(Date.parse("2026-06-24T12:00"));
  });

  it("passes through the raw repos mask, undefined when absent/empty", () => {
    expect(p("repos=ab_3").reposMask).toBe("ab_3");
    expect(p("").reposMask).toBeUndefined();
    expect(p("repos=").reposMask).toBeUndefined();
    expect(p("from=notadate").from).toBeUndefined();
  });
});

describe("repo bitmask codec", () => {
  // canonical universe must be name-sorted by both encode and decode
  const all = ["alpha", "beta", "delta", "gamma", "omega", "zeta"].sort();

  it("round-trips an arbitrary selection", () => {
    const sel = ["alpha", "gamma", "zeta"];
    const mask = encodeRepoMask(all, sel);
    expect(decodeRepoMask(all, mask).sort()).toEqual([...sel].sort());
  });

  it("stays compact for large lists", () => {
    const big = Array.from({ length: 130 }, (_, i) => `r${i}`).sort();
    const mask = encodeRepoMask(big, big); // select all
    expect(mask.length).toBeLessThan(30);
    expect(decodeRepoMask(big, mask).sort()).toEqual([...big].sort());
  });

  it("handles empty selection", () => {
    expect(decodeRepoMask(all, encodeRepoMask(all, []))).toEqual([]);
  });

  it("round-trips across every byte-length remainder", () => {
    const universe = (n: number) =>
      Array.from(
        { length: n },
        (_, i) => `r${String(i).padStart(2, "0")}`,
      ).sort();
    // 6 repos -> 1 byte -> 2-char mask (encode rem 1 / decode rem 2)
    const u6 = universe(6);
    expect(
      decodeRepoMask(u6, encodeRepoMask(u6, ["r02", "r05"])).sort(),
    ).toEqual(["r02", "r05"]);
    // 9 repos -> 2 bytes -> 3-char mask (encode rem 2 / decode rem 3)
    const u9 = universe(9);
    expect(
      decodeRepoMask(u9, encodeRepoMask(u9, ["r00", "r08"])).sort(),
    ).toEqual(["r00", "r08"]);
    // 24 repos -> 3 bytes -> 4-char mask (full quartet, rem 0)
    const u24 = universe(24);
    expect(decodeRepoMask(u24, encodeRepoMask(u24, u24)).sort()).toEqual(u24);
  });

  it("treats a mask shorter than the universe as all-unset (no out-of-range)", () => {
    const big = Array.from({ length: 24 }, (_, i) => `r${i}`).sort();
    expect(decodeRepoMask(big, "A")).toEqual([]);
  });
});

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
    const idx = findOnsetIndex(v, {
      sigmaBins: 0,
      peakFraction: 0.2,
      padBins: 5,
    });
    // crossing is at index 50; padded back 5 => 45
    expect(idx).toBe(45);
  });

  it("never returns a negative index", () => {
    const v = [10, 10, 10];
    const idx = findOnsetIndex(v, {
      sigmaBins: 0,
      peakFraction: 0.2,
      padBins: 5,
    });
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

describe("defaultRepoSelection", () => {
  it("picks busiest repos until coverage is reached", () => {
    const repos = [
      { name: "a", total: 50 },
      { name: "b", total: 40 },
      { name: "c", total: 10 },
    ];
    // total 100, 90% target = 90; a(50)+b(90) >= 90 -> [a,b]
    expect(defaultRepoSelection(repos)).toEqual(["a", "b"]);
  });

  it("sorts busiest-first regardless of input order", () => {
    const repos = [
      { name: "small", total: 5 },
      { name: "big", total: 95 },
    ];
    expect(defaultRepoSelection(repos)).toEqual(["big"]);
  });

  it("hard-caps the count", () => {
    const repos = Array.from({ length: 40 }, (_, i) => ({
      name: `r${i}`,
      total: 1,
    }));
    expect(defaultRepoSelection(repos, { cap: 25 })).toHaveLength(25);
  });

  it("respects a custom coverage fraction", () => {
    const repos = [
      { name: "a", total: 60 },
      { name: "b", total: 30 },
      { name: "c", total: 10 },
    ];
    // 50% target = 50; a(60) >= 50 -> [a]
    expect(defaultRepoSelection(repos, { coverage: 0.5 })).toEqual(["a"]);
  });

  it("returns all repos when every total is zero", () => {
    const repos = [
      { name: "a", total: 0 },
      { name: "b", total: 0 },
    ];
    expect(defaultRepoSelection(repos).sort()).toEqual(["a", "b"]);
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
    const w = detectOnsetWindow(s, {
      sigmaBins: 0,
      peakFraction: 0.2,
      padBins: 5,
    });
    // onset index 45 -> from = start + 45h; to = last bin
    expect(w.fromIndex).toBe(45);
    expect(w.from).toBe(start + 45 * HOUR_MS);
    expect(w.to).toBe(start + 99 * HOUR_MS);
  });
});
