import { describe, expect, it } from "vitest";
import { HOUR_MS } from "./activity";
import { buildActivityResponse } from "./activity-response";

const viewer = { login: "octo", name: "Octo Cat", avatarUrl: null };

describe("buildActivityResponse", () => {
  it("returns an empty shape (no persona) when there are no events", () => {
    const r = buildActivityResponse({
      viewer,
      events: [],
      sinceDays: 365,
      truncated: false,
    });
    expect(r.empty).toBe(true);
    expect(r.persona).toBeNull();
    expect(r.repos).toEqual([]);
    expect(r.series).toEqual({});
    expect(r.lookbackDays).toBe(365);
    expect(r.window).toEqual({ from: 0, to: 0 });
  });

  it("bins, grades a persona, and lists repos busiest-first", () => {
    const base = Date.UTC(2026, 0, 1, 0, 0, 0);
    const events = [
      { repo: "small", ts: base },
      { repo: "big", ts: base + HOUR_MS },
      { repo: "big", ts: base + 2 * HOUR_MS },
      { repo: "big", ts: base + 3 * HOUR_MS },
    ];
    const r = buildActivityResponse({
      viewer,
      events,
      sinceDays: 540,
      truncated: true,
    });
    expect(r.empty).toBe(false);
    expect(r.truncated).toBe(true);
    expect(r.persona).not.toBeNull();
    expect(r.repos.map((x) => x.name)).toEqual(["big", "small"]); // desc by total
    expect(r.repos[0].total).toBe(3);
    expect(r.start).toBe(base);
    expect(r.window.to).toBeGreaterThanOrEqual(r.window.from);
    expect(Object.keys(r.series).sort()).toEqual(["big", "small"]);
  });

  it("flags private repos from the privateRepos list", () => {
    const base = Date.UTC(2026, 0, 1);
    const r = buildActivityResponse({
      viewer,
      events: [
        { repo: "pub", ts: base },
        { repo: "secret", ts: base + HOUR_MS },
      ],
      sinceDays: 365,
      truncated: false,
      privateRepos: ["secret"],
    });
    const byName = Object.fromEntries(r.repos.map((x) => [x.name, x.private]));
    expect(byName).toEqual({ pub: false, secret: true });
  });
});
