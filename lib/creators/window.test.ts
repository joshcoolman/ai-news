import { describe, expect, it } from "vitest";
import { clampDays, DEFAULT_DAYS, MAX_DAYS, MIN_DAYS } from "./window";

describe("clampDays", () => {
  it("keeps the Creators window between its floor and ceiling", () => {
    expect(clampDays(1)).toBe(MIN_DAYS);
    expect(clampDays(99)).toBe(MAX_DAYS);
    expect(clampDays(12.4)).toBe(12);
  });

  it("falls back to the default for anything that is not a number", () => {
    expect(clampDays(undefined)).toBe(DEFAULT_DAYS);
    expect(clampDays("soon")).toBe(DEFAULT_DAYS);
  });
});
