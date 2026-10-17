import { h } from "./dom.js";

/**
 * What a card can do, beyond showing itself. Each action is absent where it
 * does not apply: Creators-page cards have no remove.
 * @typedef {{
 *   mark?: "queued" | "playing",
 *   picked?: boolean,
 *   onPlay?: () => void,
 *   onRemove?: () => void,
 *   onQueue?: () => void,
 * }} CardOptions `onPlay` is the plain click (Creators and Favorites queue instead of playing while the player plays);
 * `onQueue` is the shift-click (take it out of the queue again); `mark` tags a card that is in the player's History;
 * `picked` is the keyboard highlight.
 */

/**
 * One tile in the grid.
 * @param {Card} card
 * @param {CardOptions} [options]
 */
export function cardTile(card, { mark, picked, onPlay, onRemove, onQueue } = {}) {
  const open = (/** @type {MouseEvent} */ e) => {
    if (onQueue && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && e.button === 0) {
      e.preventDefault();
      return onQueue();
    }
    // A plain click on the thumbnail plays in the player window; modified clicks keep the browser's own behaviour.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (onPlay) onPlay();
    else playInPlayer(card);
  };
  return h(
    "div",
    { class: `card${mark ? " queued" : ""}${picked ? " picked" : ""}`, "data-id": card.id },
    h(
      "div",
      { class: "thumb" },
      h("img", { src: card.thumbUrl, alt: "", loading: "lazy" }),
      h("a", { class: "hit", href: card.link, target: "_blank", rel: "noopener", onclick: open, "aria-label": `Open: ${card.title}` }),
      mark && h("span", { class: "tag" }, mark === "playing" ? "Playing" : "Queued"),
      onRemove && h("button", { class: "remove", type: "button", onclick: onRemove, "aria-label": `Remove: ${card.title}`, title: "Remove" }, "×"),
      card.duration && h("span", { class: "badge" }, card.duration),
      card.chapters && h("span", { class: "chapters-mark", title: "Has chapters" }, "C"),
    ),
    h("div", { class: "title" }, h("a", { href: card.link, target: "_blank", rel: "noopener" }, card.title)),
    h("div", { class: "meta" }, card.meta),
  );
}

/** A placeholder in the grid while the creators' lists load. */
export function slotTile() {
  return h("div", { class: "card slot", "aria-busy": true }, h("div", { class: "thumb skeleton" }), h("div", { class: "skeleton-line" }), h("div", { class: "meta" }, " "));
}

/**
 * The tiles a page hands to `sync`: a card keyed by its id, redrawn only when what it shows changes.
 * @param {Card} card
 * @param {CardOptions} options
 * @returns {import("./dom.js").Tile}
 */
export function cardEntry(card, options) {
  return { key: card.id, sig: JSON.stringify([card, options.mark, options.picked]), make: () => cardTile(card, options) };
}

/**
 * `count` placeholders, keyed under `prefix`.
 * @param {string} prefix
 * @param {number} count
 * @returns {import("./dom.js").Tile[]}
 */
export function slotEntries(prefix, count) {
  return Array.from({ length: count }, (_, n) => ({ key: `${prefix}-${n}`, sig: "", make: () => slotTile() }));
}

/** Something is running: a pulse and what it is. @param {string} text */
export function busyLine(text) {
  return h("span", { class: "progress" }, h("span", { class: "pulse" }), text);
}

/*
  One named window for watching: the first click opens it on the right half of
  the screen, later clicks load into it wherever you have put it (the browser
  ignores size and position for a window that already exists). In the one-window
  app the name belongs to the Player frame, so the click loads that instead. It
  must stay on our own /player page: youtube.com's opener policy (and Brave) wipe
  a window's name once it lands there, and the next click opens a second window.
  No noopener either, for the same reason.
*/
/** Play a video card in the player window. @param {Card} card */
export function playInPlayer(card) {
  const s = /** @type {Screen & { availLeft?: number, availTop?: number }} */ (screen);
  const width = Math.round(s.availWidth / 2);
  const left = (s.availLeft ?? 0) + s.availWidth - width;
  const features = `popup,left=${left},top=${s.availTop ?? 0},width=${width},height=${s.availHeight}`;
  window.open(`/player?${new URLSearchParams({ v: card.videoId, t: card.title })}`, "ainews-player", features)?.focus();
}
