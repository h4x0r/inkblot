import type { Page } from "@playwright/test";

const HOUR = 3_600_000;

/** A deterministic public-activity payload (same shape as /api/u/<user>): two
 * repos, 100 hourly bins, onset window at bin 40. */
export const CANNED_ACTIVITY = {
  viewer: { login: "testuser", name: "Test User", avatarUrl: null },
  empty: false,
  truncated: false,
  persona: {
    persona: "Night Owl",
    emoji: "🌙",
    superlative: "70% of commits after midnight",
  },
  lookbackDays: 365,
  start: 0,
  stepHours: 1,
  hours: 100,
  series: {
    alpha: Array.from({ length: 100 }, (_, i) => (i >= 40 ? 5 : 0)),
    beta: Array.from({ length: 100 }, (_, i) => (i < 40 ? 3 : 0)),
  },
  repos: [
    { name: "alpha", total: 300, private: false },
    { name: "beta", total: 120, private: false },
  ],
  window: { from: 40 * HOUR, to: 99 * HOUR },
};

// A 1×1 transparent PNG — enough for the browser to load the <img> in tests.
const PNG_1x1_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/** Stub the data + render endpoints so e2e is deterministic and never touches
 * GitHub or matplotlib. */
export async function mockInkblotApi(
  page: Page,
  activity: unknown = CANNED_ACTIVITY,
) {
  await page.route("**/api/u/**", (route) => route.fulfill({ json: activity }));
  await page.route("**/api/render", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(PNG_1x1_B64, "base64"),
    }),
  );
}
