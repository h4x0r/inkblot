import { describe, expect, it } from "vitest";
import { isValidGitHubUsername, repoLabel } from "./github";

describe("isValidGitHubUsername", () => {
  it("accepts valid GitHub usernames", () => {
    for (const u of [
      "torvalds",
      "h4x0r",
      "a",
      "a-b",
      "gaearon",
      "x".repeat(39),
    ]) {
      expect(isValidGitHubUsername(u)).toBe(true);
    }
  });

  it("rejects invalid usernames", () => {
    for (const u of [
      "",
      "-bad",
      "bad-",
      "a--b", // consecutive hyphens
      "x".repeat(40), // too long
      "has space",
      "has/slash",
      "under_score",
      "..",
    ]) {
      expect(isValidGitHubUsername(u)).toBe(false);
    }
  });
});

describe("repoLabel", () => {
  it("strips the owner when it is the viewer", () => {
    expect(repoLabel("h4x0r/issen", "h4x0r")).toBe("issen");
    expect(repoLabel("H4X0R/issen", "h4x0r")).toBe("issen"); // case-insensitive
  });

  it("keeps owner/repo for other owners (avoids cross-owner collisions)", () => {
    expect(repoLabel("SecurityRonin/issen", "h4x0r")).toBe(
      "SecurityRonin/issen",
    );
  });

  it("returns the name unchanged when there is no slash", () => {
    expect(repoLabel("unknown", "h4x0r")).toBe("unknown");
  });
});
