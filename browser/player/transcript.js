import { load, post } from "../shared/api.js";
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
 * with a timestamp that seeks there. While it is open it follows along by
 * paragraph (#87): the one playing is marked and scrolls to the top when it
 * changes, unless the reader scrolled the panel in the last few seconds; Up
 * and Down seek to the paragraph before or after (`step`, #89). The T key does
 * what the button does; ×, Escape or T again closes it. The button stays
 * hidden until a transcript is stored; `fetch` asks the server once, which
 * asks YouTube once, and says whether one came.
 *
 * With it open, S (or the header's Summary button) shows its summary instead
 * (#108): the first time for a video the server has the Claude API make one,
 * after that it is the stored copy; S again goes back to the transcript. One
 * line on what the video is about, then its takeaways, each with a timestamp.
 * @param {string} videoId
 * @param {{ time: () => number, seek: (seconds: number) => void }} player
 */
export function transcript(videoId, player) {
  let stored = false;
  /** @type {Paragraph[]} */
  let list = [];
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let ticking;
  /** When the reader last scrolled the panel by hand; following holds off for HANDS_OFF after. */
  let scrolledAt = 0;
  const HANDS_OFF = 5000;
  let current = -1;
  const body = h("div", { class: "transcript-body" });
  /** The summary, once asked for (#108); `asking` while the server makes it. */
  /** @type {Summary | undefined} */
  let made;
  let asking = false;
  const summaryBody = h("div", { class: "transcript-body summary-body", hidden: true });
  // Two tabs over one panel; S flips between them. A tab already showing does nothing.
  const transcriptTab = h("button", { type: "button", title: "Transcript (S)", "aria-pressed": true, onclick: () => body.hidden && summarize() }, "Transcript");
  const summaryTab = h("button", { type: "button", title: "Summary (S)", "aria-pressed": false, onclick: () => !body.hidden && summarize() }, "Summary");
  const panel = h(
    "aside",
    { class: "transcript", hidden: true, "aria-label": "Transcript" },
    h(
      "header",
      { class: "panel-head" },
      h("h2", {}, "Transcript"),
      h(
        "span",
        { class: "panel-actions" },
        h("span", { class: "panel-switch", role: "group", "aria-label": "Show" }, transcriptTab, summaryTab),
        h("button", { class: "panel-close", type: "button", onclick: () => open(false), "aria-label": "Close transcript", title: "Close" }, "×"),
      ),
    ),
    body,
    summaryBody,
  );
  const button = h("button", { class: "btn", type: "button", hidden: true, title: "Transcript (T)", "aria-expanded": false, onclick: () => open(panel.hidden !== false) }, "Transcript");

  /** Which paragraph is playing, by its place in the list. */
  const playing = () => Math.max(0, list.findLastIndex((p) => p.start <= player.time()));

  /** Mark the paragraph playing, and bring it to the top when it changes. */
  function follow(force = false) {
    const at = playing();
    if (at === current && !force) return;
    current = at;
    list.forEach((_, i) => body.children[i]?.classList.toggle("current", i === at));
    if (force || Date.now() - scrolledAt > HANDS_OFF) body.children[at]?.scrollIntoView({ block: "start", behavior: force ? "instant" : "smooth" });
  }

  function open(/** @type {boolean} */ on) {
    panel.hidden = !on;
    button.setAttribute("aria-expanded", String(on));
    clearInterval(ticking);
    if (!on) return;
    document.dispatchEvent(new CustomEvent("sidebar", { detail: panel }));
    scrolledAt = 0;
    follow(true);
    ticking = setInterval(follow, 500);
  }
  // A hand on the wheel wins for a while. Not the follow's own smooth scroll: that fires no wheel or touch.
  body.addEventListener("wheel", () => (scrolledAt = Date.now()), { passive: true });
  body.addEventListener("touchmove", () => (scrolledAt = Date.now()), { passive: true });
  const toggle = () => {
    if (stored) open(panel.hidden !== false);
  };

  /** Show the summary or the transcript in the panel. */
  function view(/** @type {"summary" | "transcript"} */ which) {
    const summarized = which === "summary";
    summaryBody.hidden = !summarized;
    body.hidden = summarized;
    transcriptTab.setAttribute("aria-pressed", String(!summarized));
    summaryTab.setAttribute("aria-pressed", String(summarized));
    if (!summarized) follow(true);
  }

  /** The summary, or a line saying why there is none (yet). */
  function drawSummary(/** @type {string} */ note = "") {
    if (note || !made) return summaryBody.replaceChildren(h("p", { class: "summary-note" }, note));
    summaryBody.replaceChildren(
      h("p", { class: "summary-gist" }, made.gist),
      h("p", { class: "transcript-heading eyebrow" }, "Takeaways"),
      ...made.points.map((p) => h("p", { class: "summary-point" }, h("button", { class: "transcript-time", type: "button", title: "Play from here", onclick: () => player.seek(p.start) }, clock(p.start)), h("span", {}, p.text))),
    );
  }

  /** S: only with the transcript open. Make the summary the first time, show it after; from the summary, back to the transcript. */
  async function summarize() {
    if (!stored || panel.hidden) return;
    if (body.hidden) return view("transcript");
    view("summary");
    if (made || asking) return;
    asking = true;
    drawSummary("Summarizing\u2026");
    try {
      const res = await post(`/api/player/summary?${new URLSearchParams({ v: videoId })}`);
      /** @type {{ summary?: Summary, error?: string }} */
      const found = await res.json();
      made = found.summary;
      drawSummary(made ? "" : found.error ?? "Could not summarize the transcript.");
    } catch {
      drawSummary("Could not reach the server.");
    } finally {
      asking = false;
    }
  }

  /** @param {Paragraph[]} paragraphs */
  function show(paragraphs) {
    list = paragraphs;
    body.replaceChildren(
      ...paragraphs.map((p) =>
        h(
          "p",
          {},
          p.title && h("strong", { class: "transcript-heading eyebrow" }, p.title),
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
    else if (e.key.toLowerCase() === "s" && !e.repeat && !e.shiftKey) summarize();
  });

  return {
    button,
    panel,
    toggle,
    summarize,
    /**
     * Seek to the paragraph above or below the one playing. False when the panel
     * is closed, so the key keeps its usual meaning; at either end it stays put.
     * @param {1 | -1} direction
     */
    step(direction) {
      if (panel.hidden) return false;
      const next = list[playing() + direction];
      if (next) {
        player.seek(next.start);
        scrolledAt = 0;
        follow();
      }
      return true;
    },
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
