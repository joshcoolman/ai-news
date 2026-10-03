import { describe, expect, it } from "vitest";
import { resumePoint } from "./resume";

describe("resumePoint", () => {
  it("keeps a position in the middle, in whole seconds", () => {
    expect(resumePoint(312.7, 900)).toBe(312);
  });

  it("starts over when barely begun", () => {
    expect(resumePoint(3, 900)).toBeUndefined();
  });

  it("starts over when as good as finished", () => {
    expect(resumePoint(895, 900)).toBeUndefined();
  });

  it("keeps the position while the duration is still unknown", () => {
    expect(resumePoint(312, 0)).toBe(312);
  });
});
