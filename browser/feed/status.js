import { h } from "../shared/dom.js";

/* The lines the status row can show: a refresh in progress, what the last one did, or something running. */

/** @param {number} seconds */
function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * @param {number} n
 * @param {string} one
 */
function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The live status line during a refresh. The feed redraws it once a second.
 * @param {import("./live.js").Live} live
 * @param {() => void} onCancel
 */
export function progressLine(live, onCancel) {
  const creatorsDone = live.creators.filter((c) => c.status !== "pending").length;
  const lanesDone = live.lanes?.filter((l) => l.status === "done").length ?? 0;
  const parts = [
    creatorsDone < live.creators.length ? `Creators ${creatorsDone} of ${live.creators.length}` : "Creators done",
    live.lanes ? `Stories: ${lanesDone} of ${live.lanes.length} searches done` : "Planning story searches",
    clock((Date.now() - live.startedAt) / 1000),
    `$${live.usd.toFixed(2)}`,
  ];
  return h(
    "span",
    { class: "progress" },
    h("span", { class: "pulse", "aria-hidden": true }),
    parts.join(" · "),
    live.lanes && lanesDone < live.lanes.length && h("button", { class: "link-btn", type: "button", onclick: onCancel }, "Stop searching"),
  );
}

/**
 * Something is running: a pulse and what it is.
 * @param {string} text
 */
export function busyLine(text) {
  return h("span", { class: "progress" }, h("span", { class: "pulse" }), text);
}

/**
 * What the last refresh did, shown once it ends.
 * @param {import("./live.js").Summary} s
 * @returns {(Node | string)[]}
 */
export function summaryLine(s) {
  const added = [s.videos && plural(s.videos, "video"), s.stories && plural(s.stories, "story", "stories")].filter(Boolean);
  const head = added.length ? `Added ${added.join(" and ")}` : "Nothing new since the last refresh";
  const tail = [
    s.cancelled && "stopped early",
    s.failed.length && `could not fetch ${s.failed.join(", ")}`,
    s.error && "something failed; see the server log",
  ].filter(Boolean);
  return [h("b", {}, `${head}.`), ` ${clock(s.seconds)} · $${s.usd.toFixed(2)}${tail.length ? ` · ${tail.join(" · ")}` : ""}`];
}
