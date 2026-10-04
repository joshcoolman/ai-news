import { h, icon, ICONS } from "../shared/dom.js";

/**
 * What a card can do, beyond showing itself. Each action is absent where it
 * does not apply: Creators-page cards have no remove, Favorites has no star.
 * @typedef {{
 *   note?: string,
 *   searching?: boolean,
 *   checking?: boolean,
 *   arriving?: boolean,
 *   onRemove?: () => void,
 *   onMore?: () => void,
 *   onFavorite?: () => void,
 * }} CardOptions
 */

/**
 * One tile in the grid: a video or a story.
 * @param {Card} card
 * @param {CardOptions} [options]
 */
export function cardTile(card, { note, searching, checking, arriving, onRemove, onMore, onFavorite } = {}) {
  const open = (/** @type {MouseEvent} */ e) => {
    // A plain click on the thumbnail plays in the player window; modified clicks keep the browser's own behaviour.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (card.videoId) openInPlayer(`/player?${new URLSearchParams({ v: card.videoId, t: card.title })}`);
    else window.open(card.link, "_blank", "popup,noopener,width=1280,height=820");
  };
  const actions = checking
    ? [h("span", { class: "card-note checking-note" }, "Checking guidance")]
    : [
        onRemove && h("button", { class: "remove", type: "button", onclick: onRemove, "aria-label": `Remove: ${card.title}`, title: "Remove" }, "×"),
        onFavorite &&
          h(
            "button",
            {
              class: `fav${card.favorited ? " on" : ""}`,
              type: "button",
              onclick: onFavorite,
              disabled: card.favorited,
              "aria-label": card.favorited ? `In favorites: ${card.title}` : `Favorite: ${card.title}`,
              title: card.favorited ? "In favorites" : "Favorite",
            },
            icon(ICONS.star, { size: 16, stroke: 2.2, fill: card.favorited ? "currentColor" : "none" }),
          ),
        onMore &&
          h(
            "button",
            { class: "more", type: "button", onclick: onMore, disabled: searching, "aria-label": `More like this: ${card.title}`, title: "More like this" },
            icon(ICONS.search, { size: 16, stroke: 2.4 }),
          ),
        (searching || note) && h("span", { class: "card-note" }, searching ? "Searching" : note),
      ];
  return h(
    "div",
    { class: `card${arriving ? " arrive" : ""}${checking ? " checking" : ""}` },
    h(
      "div",
      { class: "thumb", style: { "--h": hue(card.id) } },
      card.thumbUrl ? h("img", { src: card.thumbUrl, alt: "", loading: "lazy" }) : h("span", {}, card.label),
      h("a", { class: "hit", href: card.link, target: "_blank", rel: "noopener", onclick: open, "aria-label": `Open: ${card.title}` }),
      card.isNew && h("span", { class: "new-tag" }, "New"),
      actions,
      card.duration && h("span", { class: "badge" }, card.duration),
    ),
    h("div", { class: "title" }, h("a", { href: card.link, target: "_blank", rel: "noopener" }, card.title)),
    h("div", { class: "meta" }, card.meta),
  );
}

/**
 * A placeholder in the grid while a creator's list, a story lane or a search is still working.
 * @param {string} label
 * @param {string} [activity]
 */
export function slotTile(label, activity) {
  return h(
    "div",
    { class: "card slot", "aria-busy": true },
    h("div", { class: "thumb skeleton" }, h("span", { class: "slot-label" }, label)),
    h("div", { class: "skeleton-line" }),
    h("div", { class: "meta slot-activity" }, activity ?? " "),
  );
}

/**
 * The tiles a page hands to `sync`: a card keyed by its id, redrawn only when what it shows changes.
 * @param {Card} card
 * @param {CardOptions} options
 * @returns {import("../shared/dom.js").Tile}
 */
export function cardEntry(card, options) {
  return {
    key: card.id,
    sig: JSON.stringify([card, options.note, options.searching, options.checking, options.arriving]),
    // A card redrawn in place has already arrived; only a new one animates in.
    make: (replacing) => cardTile(card, { ...options, arriving: options.arriving && !replacing }),
  };
}

/**
 * `count` placeholders, keyed under `prefix`.
 * @param {string} prefix
 * @param {number} count
 * @returns {import("../shared/dom.js").Tile[]}
 */
export function slotEntries(prefix, count) {
  return Array.from({ length: count }, (_, n) => ({ key: `${prefix}-${n}`, sig: "", make: () => slotTile("") }));
}

/*
  One named window for watching: the first click opens it on the right half of
  the screen, later clicks load into it wherever you have put it (the browser
  ignores size and position for a window that already exists). It must stay on
  our own /player page: youtube.com's opener policy (and Brave) wipe a window's
  name once it lands there, and the next click opens a second window. No
  noopener either, for the same reason.
*/
/** @param {string} link */
function openInPlayer(link) {
  const s = /** @type {Screen & { availLeft?: number, availTop?: number }} */ (screen);
  const width = Math.round(s.availWidth / 2);
  const left = (s.availLeft ?? 0) + s.availWidth - width;
  const features = `popup,left=${left},top=${s.availTop ?? 0},width=${width},height=${s.availHeight}`;
  window.open(link, "ainews-player", features)?.focus();
}

/** @param {string} id */
function hue(id) {
  let n = 0;
  for (const c of id) n = (n * 31 + c.charCodeAt(0)) % 360;
  return n;
}
