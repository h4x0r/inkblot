import { afterEach, describe, expect, it, vi } from "vitest";
import { audit } from "./audit";

afterEach(() => vi.restoreAllMocks());

describe("audit", () => {
  it("emits a single structured JSON line tagged inkblot.audit with the event fields", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    audit({ event: "public_activity", username: "octo", commits: 42 });
    expect(spy).toHaveBeenCalledOnce();
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line.kind).toBe("inkblot.audit");
    expect(typeof line.ts).toBe("number");
    expect(line.event).toBe("public_activity");
    expect(line.username).toBe("octo");
    expect(line.commits).toBe(42);
  });
});
