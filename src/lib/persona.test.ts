import { describe, expect, it } from "vitest";
import { classifyPersona } from "./persona";

const MON = Date.UTC(2024, 0, 1, 0, 0, 0); // 2024-01-01 is a Monday 00:00 UTC

// build a per-bin total array (stepHours=1) with counts at given bin indices
function total(hours: number, at: Record<number, number>): number[] {
  const a = new Array<number>(hours).fill(0);
  for (const [i, c] of Object.entries(at)) a[Number(i)] = c;
  return a;
}

const make = (t: number[]) =>
  classifyPersona({ start: MON, stepHours: 1, total: t });

// Personas describe the SHAPE of the daily rhythm, not an absolute clock: the
// commit timestamps arrive normalised to UTC (GitHub strips the committer's tz
// offset), so any "9am"/"after midnight" claim would be a fiction. These metrics
// — how tight the daily window is, weekend share, single-day bursts — are
// invariant to which timezone the subject was actually in.
describe("classifyPersona", () => {
  it("Clockwork when commits sit in a tight daily window (any hours)", () => {
    // hours 1–3, across five weekdays: tight window, spread over days
    const at: Record<number, number> = {};
    for (let d = 0; d < 5; d++) {
      at[d * 24 + 1] = 1;
      at[d * 24 + 2] = 1;
      at[d * 24 + 3] = 1;
    }
    const p = make(total(24 * 5, at));
    expect(p.persona).toBe("Clockwork");
    // no absolute day/night claim in the copy
    expect(p.superlative.toLowerCase()).not.toContain("midnight");
    expect(p.superlative.toLowerCase()).toContain("window");
  });

  it("Around the Clock when commit hours span the whole day", () => {
    // every hour, across three weekdays — no fixed daily schedule
    const at: Record<number, number> = {};
    for (let d = 0; d < 3; d++) for (let h = 0; h < 24; h++) at[d * 24 + h] = 1;
    const p = make(total(24 * 3, at));
    expect(p.persona).toBe("Around the Clock");
  });

  it("Weekend Warrior when most commits land on Sat/Sun", () => {
    const p = make(
      total(24 * 7, { [24 * 5 + 12]: 10, [24 * 6 + 13]: 8, [24 * 1 + 12]: 1 }),
    );
    expect(p.persona).toBe("Weekend Warrior");
  });

  it("The Sprinter when commits concentrate in a single day", () => {
    const p = make(total(24 * 10, { 18: 5, 19: 6, 20: 5, 21: 4 }));
    expect(p.persona).toBe("The Sprinter");
  });

  it("The Marathoner for a moderate spread steady across days", () => {
    // hours 8–18 spread over three weekdays: window ~9h, no single-day burst
    const p = make(
      total(24 * 3, {
        8: 1,
        10: 1,
        [24 + 12]: 1,
        [24 + 14]: 1,
        [48 + 16]: 1,
        [48 + 18]: 1,
      }),
    );
    expect(p.persona).toBe("The Marathoner");
  });

  it("returns a safe persona for an empty window", () => {
    const p = make([0, 0, 0]);
    expect(p.persona).toBeTruthy();
    expect(p.emoji).toBeTruthy();
  });
});
