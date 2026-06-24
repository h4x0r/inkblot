import { expect, test } from "@playwright/test";
import { mockInkblotApi } from "./fixtures";

// Regression: social scrapers (LinkedIn especially) want a complete Open Graph
// object. og:type was missing and og:image had no alt; assert the explorer page
// exposes a complete OG image card.
test("public explorer: complete Open Graph image metadata (type + alt)", async ({
  page,
}) => {
  await mockInkblotApi(page);
  await page.goto("/u/testuser");

  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
    "content",
    "website",
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
  const alt = await page
    .locator('meta[property="og:image:alt"]')
    .getAttribute("content");
  expect(alt && alt.length > 0).toBe(true);
});
