import { describe, expect, it } from "vitest";
import { render } from "./prompts";

describe("render", () => {
  it("drops a paragraph whose variables are all empty, and keeps the rest word for word", () => {
    const text = "Plan {{n}} lanes. {{avoid}}\n\nOthers:\n{{others}}\n\nEnd.\n";
    expect(render(text, { n: 4, avoid: "", others: "" })).toBe("Plan 4 lanes.\n\nEnd.");
    expect(render(text, { n: 4, avoid: "Not X.", others: "- b" })).toBe("Plan 4 lanes. Not X.\n\nOthers:\n- b\n\nEnd.");
  });

  it("throws on a variable with no value, so a renamed placeholder cannot silently vanish", () => {
    expect(() => render("Hi {{name}}", {})).toThrow("{{name}}");
  });
});
