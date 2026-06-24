import { describe, expect, it } from "vitest";
import { encodeRepoMask, HOUR_MS } from "./activity";
import {
  buildRenderPayload,
  buildShareParams,
  clampIndex,
  defaultRange,
  indexToMs,
  msToIndex,
  resolveView,
  seedView,
  sortedRepoNames,
  type ViewData,
} from "./inkblot-view";

// A small view: 100 hourly bins from epoch 0, onset window bins 40..99.
function view(overrides: Partial<ViewData> = {}): ViewData {
  return {
    start: 0,
    stepHours: 1,
    hours: 100,
    series: {
      alpha: Array.from({ length: 100 }, (_, i) => (i >= 40 ? 5 : 0)),
      beta: Array.from({ length: 100 }, (_, i) => (i < 40 ? 3 : 0)),
    },
    repos: [
      { name: "alpha", total: 300 },
      { name: "beta", total: 120 },
    ],
    window: { from: 40 * HOUR_MS, to: 99 * HOUR_MS },
    ...overrides,
  };
}

describe("index/ms helpers", () => {
  it("round-trips index<->ms and clamps", () => {
    expect(msToIndex(5 * HOUR_MS, 0, HOUR_MS)).toBe(5);
    expect(indexToMs(5, 0, HOUR_MS)).toBe(5 * HOUR_MS);
    expect(clampIndex(-3, 100)).toBe(0);
    expect(clampIndex(250, 100)).toBe(99);
    expect(clampIndex(50, 100)).toBe(50);
  });
});

describe("sortedRepoNames", () => {
  it("is lexicographic (matches the image route's universe)", () => {
    expect(
      sortedRepoNames(
        view({
          repos: [
            { name: "zed", total: 1 },
            { name: "abc", total: 2 },
          ],
        }),
      ),
    ).toEqual(["abc", "zed"]);
  });
});

describe("defaultRange", () => {
  it("maps the onset window to clamped bin indices", () => {
    expect(defaultRange(view())).toEqual([40, 99]);
  });
  it("clamps a window that runs past the series", () => {
    const d = view({ window: { from: -10 * HOUR_MS, to: 999 * HOUR_MS } });
    expect(defaultRange(d)).toEqual([0, 99]);
  });
});

describe("seedView (client mount from URL params)", () => {
  it("uses defaults when no params are present", () => {
    const { selected, range } = seedView(view(), {});
    expect(range).toEqual([40, 99]);
    // default selection is busiest-first covering 90% -> alpha alone (300/420=71%? no) -> alpha+beta
    expect(selected.sort()).toEqual(["alpha", "beta"]);
  });
  it("uses default selection but explicit from/to when only the window is set", () => {
    const d = view();
    const { selected, range } = seedView(d, {
      from: 10 * HOUR_MS,
      to: 20 * HOUR_MS,
      reposMask: undefined,
    });
    expect(range).toEqual([10, 20]);
    expect(selected.length).toBeGreaterThan(0);
  });

  it("seeds the selection from a repos mask when present", () => {
    const d = view();
    const mask = encodeRepoMask(sortedRepoNames(d), ["alpha"]);
    const { selected } = seedView(d, { reposMask: mask });
    expect(selected).toEqual(["alpha"]);
  });
});

describe("resolveView (server-side, image route)", () => {
  it("defaults selection + full onset window when params absent", () => {
    const r = resolveView(view(), {});
    expect(r.window).toEqual([40 * HOUR_MS, 99 * HOUR_MS]);
    expect(r.selected.sort()).toEqual(["alpha", "beta"]);
  });
  it("honors explicit from/to (ms)", () => {
    const r = resolveView(view(), { from: 5 * HOUR_MS, to: 15 * HOUR_MS });
    expect(r.window).toEqual([5 * HOUR_MS, 15 * HOUR_MS]);
  });
});

describe("buildShareParams (omit-when-default)", () => {
  it("is empty when selection and range are the defaults", () => {
    const d = view();
    const def = defaultRange(d);
    const defSel = ["alpha", "beta"];
    expect(buildShareParams(d, defSel, def)).toBe("");
  });
  it("emits from/to when the range differs from default", () => {
    const d = view();
    const p = new URLSearchParams(
      buildShareParams(d, ["alpha", "beta"], [10, 20]),
    );
    expect(p.get("from")).toBe(String(10 * HOUR_MS));
    expect(p.get("to")).toBe(String(20 * HOUR_MS));
  });
  it("emits a repos mask when the selection differs from default", () => {
    const d = view();
    const p = new URLSearchParams(
      buildShareParams(d, ["alpha"], defaultRange(d)),
    );
    expect(p.get("repos")).toBeTruthy();
  });
  it("round-trips through resolveView", () => {
    const d = view();
    const qs = buildShareParams(d, ["alpha"], [10, 20]);
    const params = {
      from: 10 * HOUR_MS,
      to: 20 * HOUR_MS,
      reposMask: new URLSearchParams(qs).get("repos") ?? undefined,
    };
    expect(resolveView(d, params).selected).toEqual(["alpha"]);
  });
});

describe("buildRenderPayload", () => {
  it("packs the /api/render body with an ms window", () => {
    const d = view();
    const payload = buildRenderPayload(d, ["alpha"], [10, 20], {
      title: "x's GitHub Activity History",
      subtitle: "Night Owl · most after-dark",
      personaEmoji: "🦇",
      avatarUrl: "https://github.com/x.png",
    });
    expect(payload.selected).toEqual(["alpha"]);
    expect(payload.window).toEqual([10 * HOUR_MS, 20 * HOUR_MS]);
    expect(payload.start).toBe(0);
    expect(payload.step_hours).toBe(1);
    expect(payload.title).toBe("x's GitHub Activity History");
    expect(payload.persona_emoji).toBe("🦇");
  });
});
