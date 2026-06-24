/**
 * Property-based fuzzing of the pure activity parsers — the TS equivalent of a
 * cargo-fuzz target: throw arbitrary inputs at each function and assert the
 * invariants that must ALWAYS hold (never throw, lengths consistent, indices in
 * range, mass conserved). fast-check shrinks any counterexample to a minimal case.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  binCommitsHourly,
  type CommitEvent,
  detectOnsetWindow,
  findOnsetIndex,
  gaussianSmooth,
} from "./activity";

const RUNS = 300;

describe("fuzz: gaussianSmooth", () => {
  it("preserves length and never produces NaN, for any input/sigma", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 1e6, noNaN: true }), { maxLength: 60 }),
        fc.double({ min: 0, max: 50, noNaN: true }),
        (values, sigma) => {
          const out = gaussianSmooth(values, sigma);
          expect(out).toHaveLength(values.length);
          for (const v of out) expect(Number.isFinite(v)).toBe(true);
          for (const v of out) expect(v).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: RUNS },
    );
  });
});

describe("fuzz: findOnsetIndex", () => {
  it("always returns an in-range integer index", () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat({ max: 1000 }), { maxLength: 200 }),
        (values) => {
          const idx = findOnsetIndex(values);
          expect(Number.isInteger(idx)).toBe(true);
          expect(idx).toBeGreaterThanOrEqual(0);
          if (values.length > 0) expect(idx).toBeLessThan(values.length);
          else expect(idx).toBe(0);
        },
      ),
      { numRuns: RUNS },
    );
  });
});

const eventArb = fc.record({
  repo: fc.constantFrom("a", "b", "c", "repo-with-dash", ""),
  ts: fc.integer({ min: 0, max: 10_000_000 }), // bounded so hours stays sane
});

describe("fuzz: binCommitsHourly", () => {
  it("conserves commit count and keeps every series the same length", () => {
    fc.assert(
      fc.property(
        fc.array(eventArb, { minLength: 1, maxLength: 500 }),
        (events: CommitEvent[]) => {
          const s = binCommitsHourly(events);
          expect(s.hours).toBeGreaterThan(0);
          let total = 0;
          for (const repo of Object.keys(s.series)) {
            expect(s.series[repo]).toHaveLength(s.hours);
            total += s.series[repo].reduce((a, b) => a + b, 0);
            expect(s.totals[repo]).toBe(
              s.series[repo].reduce((a, b) => a + b, 0),
            );
          }
          expect(total).toBe(events.length); // no commit lost or invented
        },
      ),
      { numRuns: RUNS },
    );
  });
});

describe("fuzz: detectOnsetWindow", () => {
  it("returns from<=to, both inside the series time range", () => {
    fc.assert(
      fc.property(
        fc.array(eventArb, { minLength: 1, maxLength: 500 }),
        (events: CommitEvent[]) => {
          const s = binCommitsHourly(events);
          const w = detectOnsetWindow(s);
          const lastMs = s.start + (s.hours - 1) * s.stepHours * 3_600_000;
          expect(w.fromIndex).toBeGreaterThanOrEqual(0);
          expect(w.fromIndex).toBeLessThan(s.hours);
          expect(w.from).toBeGreaterThanOrEqual(s.start);
          expect(w.from).toBeLessThanOrEqual(w.to);
          expect(w.to).toBe(lastMs);
        },
      ),
      { numRuns: RUNS },
    );
  });
});
