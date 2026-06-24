import { expect, test } from "@playwright/test";
import { mockInkblotApi } from "./fixtures";

// Regression: the in-app "Sign in for private repos" affordance on /u/<user>
// must actually START GitHub OAuth, not just navigate to the landing page. It
// was a <Link href="/">, so clicking it dumped signed-out viewers back on the
// landing page ("clicking log in from inside goes back to landing page") instead
// of signing them in.
test("public explorer: 'sign in for private repos' starts GitHub OAuth", async ({
  page,
}) => {
  await mockInkblotApi(page);

  // intercept the GitHub authorize redirect so we never hit real GitHub
  let authorizeHit = false;
  await page.route(/github\.com\/login\/oauth\/authorize/, (route) => {
    authorizeHit = true;
    return route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><body>stub github login</body></html>",
    });
  });

  await page.goto("/u/testuser");
  await page.getByText(/sign in for private repos/i).click();
  await page.waitForTimeout(1500);

  // clicking it must initiate OAuth, not just land back on the landing page
  expect(authorizeHit).toBe(true);
});
