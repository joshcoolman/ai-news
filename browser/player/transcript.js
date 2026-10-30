import { load, send } from "../shared/api.js";
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
 * (#108); S again goes back to the transcript. One line on what the video is
 * about, then its takeaways, each with a timestamp. With none made yet, the
 * panel asks what the reader wants from it (#110), the box pre-filled with the
 * guidance used last; Summarize has the server ask the Claude API. A summary
 * made shows the guidance it was made with and Resummarize, the box again,
 * whose summary replaces it. No summary is made without one of those presses.
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
  /**
   * The summary (#108) once the server has said whether there is one (`loaded`); `guidance`, the box's
   * text, starts as the one used last (#110). `asking` while the server makes one, `editing` while the
   * box shows over a summary already made, `error` what went wrong last.
   */
  /** @type {Summary | undefined} */
  let made;
  let loaded = false;
  let guidance = "";
  let asking = false;
  let editing = false;
  let error = "";
  const summaryBody = h("div", { class: "transcript-body summary-body", hidden: true });
  const heading = h("span", {}, "Transcript");
  const flip = h("button", { class: "summary-flip", type: "button", title: "Summary (S)", onclick: () => summarize() }, "Summary");
  const panel = h(
    "aside",
    { class: "transcript", hidden: true, "aria-label": "Transcript" },
    h("header", {}, heading, h("span", { class: "transcript-actions" }, flip, h("button", { class: "chapters-close", type: "button", onclick: () => open(false), "aria-label": "Close transcript", title: "Close" }, "×"))),
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
    heading.textContent = summarized ? "Summary" : "Transcript";
    flip.textContent = summarized ? "Transcript" : "Summary";
    flip.classList.toggle("back", summarized);
    flip.title = `${flip.textContent} (S)`;
    if (!summarized) follow(true);
  }

  const note = (/** @type {string} */ text) => h("p", { class: "summary-note" }, text);

  /** The guidance box (#110): pre-filled, Summarize (or Cmd/Ctrl+Enter) makes the summary with it. */
  function guidanceForm() {
    const box = /** @type {HTMLTextAreaElement} */ (
      h("textarea", {
        class: "summary-guidance",
        rows: 4,
        placeholder: "Optional: what you want from it. Bullets only; people and companies mentioned, with what each does; only high-signal news\u2026",
        "aria-label": "Guidance for the summary",
      })
    );
    box.value = guidance;
    const go = () => make(box.value);
    box.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        go();
      }
    });
    const form = h(
      "div",
      { class: "summary-form" },
      h("label", {}, made ? "Resummarize, with this guidance:" : "What do you want from this summary?"),
      box,
      h(
        "div",
        { class: "summary-buttons" },
        made && h("button", { class: "summary-flip back", type: "button", onclick: () => ((editing = false), drawSummary()) }, "Cancel"),
        h("button", { class: "summary-flip", type: "button", onclick: go }, made ? "Resummarize" : "Summarize"),
      ),
    );
    requestAnimationFrame(() => box.focus());
    return form;
  }

  /** The summary, the box to ask for one, or a line saying what is happening. */
  function drawSummary() {
    if (!loaded) return summaryBody.replaceChildren(note("Loading\u2026"));
    if (asking) return summaryBody.replaceChildren(note("Summarizing\u2026"));
    const problem = error && note(error);
    if (!made || editing) return summaryBody.replaceChildren(...[problem, guidanceForm()].filter((n) => !!n));
    summaryBody.replaceChildren(
      ...[
        problem,
        h("p", { class: "summary-gist" }, made.gist),
        ...made.points.map((p) => h("p", {}, h("button", { class: "transcript-time", type: "button", title: "Play from here", onclick: () => player.seek(p.start) }, clock(p.start)), h("span", {}, p.text))),
        h(
          "div",
          { class: "summary-foot" },
          made.guidance && h("p", { class: "summary-note" }, `Asked for: ${made.guidance}`),
          h("button", { class: "summary-flip back", type: "button", onclick: () => ((editing = true), (error = ""), drawSummary()) }, "Resummarize"),
        ),
      ].filter((n) => !!n),
    );
  }

  /** Ask the server for the summary now, with this guidance; it replaces the one shown. */
  async function make(/** @type {string} */ said) {
    if (asking) return;
    guidance = said.trim();
    asking = true;
    error = "";
    drawSummary();
    try {
      const res = await send("POST", `/api/player/summary?${new URLSearchParams({ v: videoId })}`, { guidance });
      /** @type {{ summary?: Summary, error?: string }} */
      const found = await res.json();
      if (found.summary) {
        made = found.summary;
        editing = false;
      } else error = found.error ?? "Could not summarize the transcript.";
    } catch {
      error = "Could not reach the server.";
    } finally {
      asking = false;
    }
    drawSummary();
  }

  /** S: only with the transcript open. Show the summary, or the box to ask for one; from the summary, back to the transcript. */
  async function summarize() {
    if (!stored || panel.hidden) return;
    if (body.hidden) return view("transcript");
    view("summary");
    if (loaded) return drawSummary();
    drawSummary();
    try {
      /** @type {{ summary?: Summary, guidance?: string }} */
      const found = await load(`/api/player/summary?${new URLSearchParams({ v: videoId })}`);
      made = found.summary;
      guidance = found.guidance ?? "";
    } catch {
      error = "Could not reach the server.";
    }
    loaded = true;
    drawSummary();
  }

  /** @param {Paragraph[]} paragraphs */
  function show(paragraphs) {
    list = paragraphs;
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
    // Typing guidance (#110): the keys are letters again; Escape only leaves the box.
    if (e.target instanceof Element && e.target.closest("input, textarea")) {
      if (e.key === "Escape") /** @type {HTMLElement} */ (e.target).blur();
      return;
    }
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
