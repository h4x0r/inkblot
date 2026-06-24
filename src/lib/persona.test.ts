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

describe("classifyPersona", () => {
  it("Night Owl when commits cluster after midnight", () => {
    const p = make(total(24, { 1: 5, 2: 8, 3: 4 })); // 01–03h Monday
    expect(p.persona).toBe("Night Owl");
    expect(p.emoji).toBe("🌙");
    expect(p.superlative.toLowerCase()).toContain("midnight");
  });

  it("9-to-5 Machine for weekday business-hours commits", () => {
    const p = make(
      total(24, { 9: 3, 10: 3, 11: 3, 13: 3, 14: 3, 15: 3, 16: 3 }),
    );
    expect(p.persona).toBe("9-to-5 Machine");
  });

  it("Weekend Warrior when most commits land on Sat/Sun", () => {
    // day index 5 = Saturday, 6 = Sunday (from a Monday start), midday
    const p = make(
      total(24 * 7, { [24 * 5 + 12]: 10, [24 * 6 + 13]: 8, [24 * 1 + 12]: 1 }),
    );
    expect(p.persona).toBe("Weekend Warrior");
  });

  it("Dawn Patrol for early-morning commits", () => {
    const p = make(total(24, { 5: 4, 6: 6, 7: 5, 8: 3 }));
    expect(p.persona).toBe("Dawn Patrol");
  });

  it("The Sprinter when commits concentrate in a single day", () => {
    // evening hours, all on day 0 -> avoids the time-of-day bands, high concentration
    const p = make(total(24 * 10, { 18: 5, 19: 6, 20: 5, 21: 4 }));
    expect(p.persona).toBe("The Sprinter");
  });

  it("The Marathoner when commits spread steadily across days", () => {
    const at: Record<number, number> = {};
    for (let d = 0; d < 10; d++) {
      at[d * 24 + 19] = 3;
      at[d * 24 + 20] = 3;
    }
    expect(make(total(24 * 10, at)).persona).toBe("The Marathoner");
  });

  it("returns a safe persona for an empty window", () => {
    const p = make([0, 0, 0]);
    expect(p.persona).toBeTruthy();
    expect(p.emoji).toBeTruthy();
  });
});
