import { h } from "./dom.js";

/*
  One toast contract, so every message looks and behaves alike:
  - done:  something changed ("Added Matthew Berman").
  - error: it did not work; its own colour, so it never reads as success.
  One at a time, newest replaces. Both leave by themselves, and hovering holds them.
*/

const SHOWN_MS = 7000;

/** @type {HTMLElement | undefined} */
let wrap;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let timer;

/**
 * @param {"done" | "error"} kind
 * @param {string} text
 */
export function toast(kind, text) {
  dismissToast();
  const leaveLater = () => {
    clearTimeout(timer);
    timer = setTimeout(dismissToast, SHOWN_MS);
  };
  const body = h("div", { class: `toast ${kind}`, onmouseenter: () => clearTimeout(timer), onmouseleave: leaveLater }, text);
  wrap = h("div", { class: "toast-wrap", role: kind === "error" ? "alert" : "status" }, body);
  document.body.append(wrap);
  leaveLater();
}

export function dismissToast() {
  clearTimeout(timer);
  wrap?.remove();
  wrap = undefined;
}
