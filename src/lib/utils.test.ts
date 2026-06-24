import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("joins truthy class values and drops falsy ones", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("merges conflicting tailwind utilities (last wins, via tailwind-merge)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-sm text-muted", "text-foreground")).toBe(
      "text-sm text-foreground",
    );
  });
});
