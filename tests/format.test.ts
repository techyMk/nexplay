import { describe, it, expect } from "vitest";
import { compactNumber } from "@/lib/format";

describe("compactNumber", () => {
  it("renders small numbers verbatim", () => {
    expect(compactNumber(0)).toBe("0");
    expect(compactNumber(42)).toBe("42");
    expect(compactNumber(999)).toBe("999");
  });

  it("formats thousands with k", () => {
    expect(compactNumber(1000)).toMatch(/^1[.,]?0?K?k?$/);
    expect(compactNumber(1500)).toMatch(/1[.,]5K|1[.,]5k/);
  });

  it("formats millions with M", () => {
    expect(compactNumber(1_500_000)).toMatch(/1[.,]5M|1[.,]5m/);
  });

  it("handles non-finite values", () => {
    expect(compactNumber(Number.POSITIVE_INFINITY)).toBe("0");
    expect(compactNumber(Number.NaN)).toBe("0");
  });
});
