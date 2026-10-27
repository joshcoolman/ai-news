import { load } from "../shared/api.js";
import { h } from "../shared/dom.js";

/** @param {number} seconds */
function clock(seconds) {
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, "0");
  return hours ? `${hours}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/**
 * The transcript, for a video YouTube has one for (#85): a button for the bar
 * and a panel that opens over the History column, in the slot Chapters uses
 * (opening one closes the other, over the document's "sidebar" event). Just
 * readable: paragraphs headed by the chapters when the video has them, each
 * with a timestamp that seeks there. Nothing follows playback. The T key does
 * what the button does; ×, Escape or T again closes it. The button stays
 * hidden until a transcript is stored; `fetch` asks the server once, which
 * asks YouTube once, and says whether one came.
 * @param {string} videoId
 * @param {{ seek: (seconds: number) => void }} player
 */
export function transcript(videoId, player) {
  let stored = false;
  const body = h("div", { class: "transcript-body" });
  const panel = h(
    "aside",
    { class: "transcript", hidden: true, "aria-label": "Transcript" },
    h("header", {}, h("span", {}, "Transcript"), h("button", { class: "chapters-close", type: "button", onclick: () => open(false), "aria-label": "Close transcript", title: "Close" }, "×")),
    body,
  );
  const button = h("button", { class: "btn", type: "button", hidden: true, title: "Transcript (T)", "aria-expanded": false, onclick: () => open(panel.hidden !== false) }, "Transcript");

  function open(/** @type {boolean} */ on) {
    panel.hidden = !on;
    button.setAttribute("aria-expanded", String(on));
    if (on) document.dispatchEvent(new CustomEvent("sidebar", { detail: panel }));
  }
  const toggle = () => {
    if (stored) open(panel.hidden !== false);
  };

  /** @param {Paragraph[]} paragraphs */
  function show(paragraphs) {
    body.replaceChildren(
      ...paragraphs.map((p) =>
        h(
          "p",
          {},
          p.title && h("strong", { class: "transcript-heading" }, p.title),
          h("button", { class: "transcript-time", type: "button", title: "Play from here", onclick: () => player.seek(p.start) }, clock(p.start)),
          h("span", {}, p.text),
        ),
      ),
    );
    stored = true;
    button.hidden = false;
  }

  // Another sidebar opening takes the slot.
  document.addEventListener("sidebar", (e) => {
    if (/** @type {CustomEvent} */ (e).detail !== panel) open(false);
  });
  document.addEventListener("pointerdown", (e) => {
    const at = /** @type {Node} */ (e.target);
    if (!panel.hidden && !panel.contains(at) && !button.contains(at)) open(false);
  });
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === "Escape") open(false);
    else if (e.key.toLowerCase() === "t" && !e.repeat) toggle();
  });

  return {
    button,
    panel,
    toggle,
    /** Ask the server for it (YouTube, the first time). True when one is here. */
    async fetch() {
      try {
        /** @type {{ paragraphs?: Paragraph[] }} */
        const found = await load(`/api/player/transcript?${new URLSearchParams({ v: videoId })}`);
        if (found.paragraphs?.length) show(found.paragraphs);
      } catch {}
      return stored;
    },
  };
}

/**
 * Ask the server for a queued video's transcript, so the row can wear the T. True when one is stored.
 * @param {string} videoId
 */
export async function fetchTranscript(videoId) {
  try {
    /** @type {{ paragraphs?: Paragraph[] }} */
    const found = await load(`/api/player/transcript?${new URLSearchParams({ v: videoId })}`);
    return !!found.paragraphs?.length;
  } catch {
    return false;
  }
}
