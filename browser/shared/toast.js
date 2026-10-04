import { h } from "./dom.js";

/*
  One toast contract, so every message looks and behaves alike:
  - done:  something changed on home. Text ends "Home page updated" (or "refreshed"); clicking goes home.
  - info:  nothing changed, nothing to open ("Nothing new in the last month for X").
  - error: it did not work; its own colour, so it never reads as success.
  - busy:  still running; stays until the next toast replaces it.
  One at a time, newest replaces. done / info / error leave by themselves, and hovering holds them.
*/

const SHOWN_MS = 7000;

/** @type {HTMLElement | undefined} */
let wrap;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let timer;

/**
 * @param {"done" | "info" | "error" | "busy"} kind
 * @param {string} text
 */
export function toast(kind, text) {
  dismissToast();
  const leaveLater = () => {
    clearTimeout(timer);
    if (kind !== "busy") timer = setTimeout(dismissToast, SHOWN_MS);
  };
  const hold = { onmouseenter: () => clearTimeout(timer), onmouseleave: leaveLater };
  const body =
    kind === "done"
      ? h("button", { class: "toast done", type: "button", onclick: () => (location.href = "/"), ...hold }, text)
      : h("div", { class: `toast ${kind}`, ...hold }, kind === "busy" && h("span", { class: "pulse", "aria-hidden": true }), text);
  wrap = h("div", { class: "toast-wrap", role: kind === "error" ? "alert" : "status" }, body);
  document.body.append(wrap);
  leaveLater();
}

export function dismissToast() {
  clearTimeout(timer);
  wrap?.remove();
  wrap = undefined;
}
