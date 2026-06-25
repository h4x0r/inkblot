import { expect, test } from "@playwright/test";
import { mockInkblotApi } from "./fixtures";

test("landing: typing a username plots them", async ({ page }) => {
  await page.goto("/");
  const input = page.getByPlaceholder("any GitHub username");
  await expect(input).toBeVisible();
  await input.fill("torvalds");
  await page.getByRole("button", { name: /Plot/ }).click();
  await expect(page).toHaveURL(/\/u\/torvalds$/);
});

// Like the landing/profile flow, the share page should lead with the
// friction-free "type a username" form (no login), not a sign-in nudge.
test("share page: typing a username plots them (no login required)", async ({
  page,
}) => {
  const token = Buffer.from(
    JSON.stringify({
      u: "https://demo.public.blob.vercel-storage.com/inkblot.png",
      t: "Test inkblot",
    }),
  ).toString("base64url");
  await page.goto(`/s/${token}`);
  const input = page.getByPlaceholder("any GitHub username");
  await expect(input).toBeVisible();
  await input.fill("torvalds");
  await page.getByRole("button", { name: /Plot/ }).click();
  await expect(page).toHaveURL(/\/u\/torvalds$/);
});

test("public explorer: renders persona, chart, and controls", async ({
  page,
}) => {
  await mockInkblotApi(page);
  await page.goto("/u/testuser");

  // persona badge from the mocked data
  await expect(page.getByText("Night Owl")).toBeVisible();
  // the streamgraph image rendered from the mocked /api/render
  await expect(page.getByRole("img", { name: /streamgraph/i })).toBeVisible();
  // the time controls are present
  await expect(page.getByLabel("From")).toBeVisible();
  await expect(page.getByLabel("To")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Copy README embed/i }),
  ).toBeVisible();
});

test("public explorer: jump to another developer from the profile", async ({
  page,
}) => {
  await mockInkblotApi(page);
  await page.goto("/u/testuser");
  const another = page.getByPlaceholder("check another username…");
  await expect(another).toBeVisible();
  await another.fill("someoneelse");
  await page.getByRole("button", { name: /Go/ }).click();
  await expect(page).toHaveURL(/\/u\/someoneelse$/);
});

test("public explorer: narrowing the time range writes from/to to the URL", async ({
  page,
}) => {
  await mockInkblotApi(page);
  await page.goto("/u/testuser");
  await expect(page.getByText("Night Owl")).toBeVisible();

  // set an explicit From earlier than the default window (bin 40 -> 1970 epoch)
  await page.getByLabel("From").fill("1970-01-01T05:00");
  // the address bar should pick up a non-default from/to (omit-when-default)
  await expect(page).toHaveURL(/[?&]from=/);
});

test("invalid username shows a friendly message, not a crash", async ({
  page,
}) => {
  await page.goto("/u/-not-valid-");
  await expect(page.getByText(/isn.t a valid GitHub username/i)).toBeVisible();
});
