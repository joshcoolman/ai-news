import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { render } from "../server/ai/prompts.js";

describe("render", () => {
  it("drops a paragraph whose variables are all empty, and keeps the rest word for word", () => {
    const text = "Plan {{n}} lanes. {{avoid}}\n\nOthers:\n{{others}}\n\nEnd.\n";
    assert.strictEqual(render(text, { n: 4, avoid: "", others: "" }), "Plan 4 lanes.\n\nEnd.");
    assert.strictEqual(render(text, { n: 4, avoid: "Not X.", others: "- b" }), "Plan 4 lanes. Not X.\n\nOthers:\n- b\n\nEnd.");
  });

  it("throws on a variable with no value, so a renamed placeholder cannot silently vanish", () => {
    assert.throws(() => render("Hi {{name}}", {}), (/** @type {Error} */ e) => e.message.includes("{{name}}"));
  });
});
