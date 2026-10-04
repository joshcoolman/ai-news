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
 * the right spot usually takes a few tries. The ×, Escape, the button again, or
 * a click anywhere else (the video included) closes it. The button stays
 * hidden when the video has no chapters.
 * @param {string} videoId
 * @param {{ frame: HTMLIFrameElement, time: () => number, seek: (seconds: number) => void }} player
 */
export function chapters(videoId, player) {
  /** @type {Chapter[]} */
  let list = [];
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let ticking;

  const rows = h("ol", {});
  const panel = h(
    "aside",
    { class: "chapters", hidden: true, "aria-label": "Chapters" },
    h("header", {}, h("span", {}, "Chapters"), h("button", { class: "chapters-close", type: "button", onclick: () => open(false), "aria-label": "Close chapters", title: "Close" }, "×")),
    rows,
  );
  const button = h("button", { class: "btn", type: "button", hidden: true, "aria-expanded": false, onclick: () => open(panel.hidden !== false) }, "Chapters");

  /** Mark the chapter that is playing. */
  function mark() {
    const time = player.time();
    const playing = list.findLast((c) => c.start <= time) ?? list[0];
    list.forEach((c, i) => rows.children[i]?.classList.toggle("current", c === playing));
  }

  function open(/** @type {boolean} */ on) {
    panel.hidden = !on;
    button.setAttribute("aria-expanded", String(on));
    clearInterval(ticking);
    if (!on) return;
    mark();
    ticking = setInterval(mark, 500);
    rows.querySelector(".current")?.scrollIntoView({ block: "nearest" });
  }

  load(`/api/player/chapters?${new URLSearchParams({ v: videoId })}`).then(
    (found) => {
      list = found.chapters;
      if (!list.length) return;
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

  // Clicking off closes it. A click on the video never reaches this page; the page losing the keyboard to the video is how it shows.
  document.addEventListener("pointerdown", (e) => {
    const at = /** @type {Node} */ (e.target);
    if (!panel.hidden && !panel.contains(at) && !button.contains(at)) open(false);
  });
  window.addEventListener("blur", () => setTimeout(() => document.activeElement === player.frame && open(false)));
  window.addEventListener("keydown", (e) => e.key === "Escape" && open(false));

  return { button, panel };
}
