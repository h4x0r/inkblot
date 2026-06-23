import { describe, expect, it } from "vitest";
import { repoLabel } from "./github";

describe("repoLabel", () => {
  it("strips the owner when it is the viewer", () => {
    expect(repoLabel("h4x0r/issen", "h4x0r")).toBe("issen");
    expect(repoLabel("H4X0R/issen", "h4x0r")).toBe("issen"); // case-insensitive
  });

  it("keeps owner/repo for other owners (avoids cross-owner collisions)", () => {
    expect(repoLabel("SecurityRonin/issen", "h4x0r")).toBe("SecurityRonin/issen");
  });

  it("returns the name unchanged when there is no slash", () => {
    expect(repoLabel("unknown", "h4x0r")).toBe("unknown");
  });
});
