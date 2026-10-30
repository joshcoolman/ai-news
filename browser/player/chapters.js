import { load } from "../shared/api.js";
import { h } from "../shared/dom.js";

/** @typedef {{ start: number, title: string }} Chapter */

/** @param {number} seconds */
function clock(seconds) {
  const hours = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return hours ? `${hours}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/**
 * Chapters, for a video whose description lists them: a button for the bar and
 * a panel that opens over the History column, so the video stays in full view.
 * Picking a chapter jumps there and leaves the panel open, because looking for
 * the right spot usually takes a few tries. While it is open, the up and down
 * keys walk the chapters (`step`). The C key does what the button does. The ×,
 * Escape, the button or C again, or a click
 * anywhere else (the video included) closes it. The button stays hidden when
 * the video has no chapters.
 * @param {string} videoId
 * @param {{ frame: HTMLIFrameElement, time: () => number, seek: (seconds: number) => void }} player
 */
export function chapters(videoId, player) {
  /** @type {Chapter[]} */
  let list = [];
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let ticking;

  const rows = h("ol", {});
  const count = h("span", { class: "panel-count" });
  const panel = h(
    "aside",
    { class: "chapters", hidden: true, "aria-label": "Chapters" },
    h(
      "header",
      { class: "panel-head" },
      h("h2", {}, "Chapters"),
      count,
      h("span", { class: "panel-actions" }, h("button", { class: "panel-close", type: "button", onclick: () => open(false), "aria-label": "Close chapters", title: "Close" }, "×")),
    ),
    rows,
  );
  const button = h("button", { class: "btn", type: "button", hidden: true, title: "Chapters (C)", "aria-expanded": false, onclick: () => open(panel.hidden !== false) }, "Chapters");

  /** Which chapter is playing, by its place in the list. */
  const playing = () => Math.max(0, list.findLastIndex((c) => c.start <= player.time()));

  /** The chapter marked last, so the list only moves when the playing one changes. */
  let marked = -1;

  /**
   * Mark the chapter that is playing and hold it at the list's vertical middle, as History does (#104): the list
   * is padded half its height at the bottom so the last chapter gets there too; near the top it simply stays put.
   */
  function mark(instant = false) {
    const at = playing();
    if (at === marked && !instant) return;
    marked = at;
    list.forEach((_, i) => rows.children[i]?.classList.toggle("current", i === at));
    rows.children[at]?.scrollIntoView({ block: "center", behavior: instant ? "instant" : "smooth" });
  }

  /** Open it if closed, close it if open; nothing for a video without chapters. */
  function toggle() {
    if (list.length) open(panel.hidden !== false);
  }

  function open(/** @type {boolean} */ on) {
    panel.hidden = !on;
    button.setAttribute("aria-expanded", String(on));
    clearInterval(ticking);
    if (!on) return;
    // Transcript shares the slot (#85): opening this closes that.
    document.dispatchEvent(new CustomEvent("sidebar", { detail: panel }));
    mark(true);
    ticking = setInterval(mark, 500);
  }

  load(`/api/player/chapters?${new URLSearchParams({ v: videoId })}`).then(
    (found) => {
      list = found.chapters;
      if (!list.length) return;
      count.textContent = String(list.length);
      rows.replaceChildren(
        ...list.map((c) =>
          h(
            "li",
            {},
            h(
              "button",
              {
                type: "button",
                onclick: () => {
                  player.seek(c.start);
                  mark();
                },
              },
              h("span", { class: "chapter-time" }, clock(c.start)),
              h("span", { class: "chapter-title" }, c.title),
            ),
          ),
        ),
      );
      button.hidden = false;
    },
    () => {},
  );

  document.addEventListener("sidebar", (e) => {
    if (/** @type {CustomEvent} */ (e).detail !== panel) open(false);
  });
  // Clicking off closes it. Not a click on the video: that lands inside the embed and this page never hears it.
  document.addEventListener("pointerdown", (e) => {
    const at = /** @type {Node} */ (e.target);
    if (!panel.hidden && !panel.contains(at) && !button.contains(at)) open(false);
  });
  // Escape closes; C opens and closes, and does nothing for a video without chapters.
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === "Escape") open(false);
    // Not while the key repeats: holding C down would flick the list open and shut.
    else if (e.key.toLowerCase() === "c" && !e.repeat) toggle();
  });

  return {
    button,
    panel,
    toggle,
    /**
     * Move to the chapter above or below the one playing. False when the list
     * is closed, so the key keeps its usual meaning; at either end it stays put.
     * @param {1 | -1} direction
     */
    step(direction) {
      if (panel.hidden) return false;
      const next = list[playing() + direction];
      if (next) {
        player.seek(next.start);
        mark();
      }
      return true;
    },
  };
}
