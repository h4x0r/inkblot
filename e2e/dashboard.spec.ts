import { expect, test } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { CANNED_ACTIVITY, mockInkblotApi } from "./fixtures";

// MUST match playwright.config.ts webServer.env.AUTH_SECRET — the running server
// decodes the session cookie with this, so the forged token must use the same.
const AUTH_SECRET = "e2e-placeholder-secret-value-1234567890";
// http localhost → non-secure cookie name (Auth.js v5)
const COOKIE = "authjs.session-token";

test("authed dashboard renders the shared explorer (hook + controls)", async ({
  page,
  context,
  baseURL,
}) => {
  // forge an Auth.js session cookie so auth() returns a signed-in user
  // server-side and `/` renders <Dashboard> instead of the landing page
  const token = await encode({
    token: {
      name: "Test User",
      email: "t@example.com",
      picture: null,
      sub: "42",
      accessToken: "ghp_e2e_placeholder",
    },
    secret: AUTH_SECRET,
    salt: COOKIE,
    maxAge: 3600,
  });
  await context.addCookies([{ name: COOKIE, value: token, url: baseURL! }]);

  // the dashboard loads its own data from /api/activity; stub both it + render
  await mockInkblotApi(page); // stubs /api/render (+ /api/u, unused here)
  await page.route("**/api/activity", (route) =>
    route.fulfill({ json: CANNED_ACTIVITY }),
  );

  await page.goto("/");

  // dashboard chrome (not the landing username form)
  await expect(page.getByTitle("Sign out")).toBeVisible();
  await expect(page.getByText(/You're a/)).toBeVisible(); // persona line
  // the shared TimeRangeControls + render hook are live
  await expect(page.getByLabel("From")).toBeVisible();
  await expect(page.getByLabel("To")).toBeVisible();
  await expect(page.getByRole("img", { name: /streamgraph/i })).toBeVisible();
});
