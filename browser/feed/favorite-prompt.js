import { h } from "../shared/dom.js";

/**
 * Shown after favoriting when the setting is "ask". Escape counts as Cancel.
 * With "Don't ask again" ticked, the choice becomes the setting.
 * @param {string} title
 * @param {(removeFromHome: boolean, dontAsk: boolean) => void} onDone
 */
export function favoritePrompt(title, onDone) {
  const dontAsk = h("input", { type: "checkbox" });
  const answer = (/** @type {boolean} */ remove) => {
    dialog.remove();
    onDone(remove, dontAsk.checked);
  };
  const dialog = h(
    "dialog",
    { class: "prompt", oncancel: () => answer(false) },
    h("p", {}, "Saved ", h("b", {}, title), " to favorites. Delete from home?"),
    h("label", { class: "check" }, dontAsk, "Don't ask again"),
    h(
      "div",
      { class: "prompt-actions" },
      h("button", { class: "btn", type: "button", onclick: () => answer(false) }, "Cancel"),
      h("button", { class: "btn primary", type: "button", autofocus: true, onclick: () => answer(true) }, "Yes"),
    ),
  );
  document.body.append(dialog);
  dialog.showModal();
}
