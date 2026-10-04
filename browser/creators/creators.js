import { boot, del, load, patch, post } from "../shared/api.js";
import { h, sync } from "../shared/dom.js";
import { CREATORS_CHANGED_EVENT, handToHome } from "../shared/handoff.js";
import { onPlayerMessage } from "../shared/player-link.js";
import { setRefreshing, topBar } from "../shared/top-bar.js";
import { cardEntry, slotEntries } from "../feed/card.js";
import { busyLine } from "../feed/status.js";

/*
  The Creators page: recent videos on the left, the creators on the right, and
  topics across the videos. The page draws before its videos: they load behind
  placeholders, and the topics (a model call the first time) after them. The
  server keeps the day's lists, so coming back is quick; a reload of this page
  is the ask for fresh ones.
*/

const DAY = 86_400_000;
const PLACEHOLDERS = 8;

const config = await boot();
/** @type {Settings} */
const settings = await load("/api/settings");

const state = {
  /** @type {Creator[]} */
  creators: await load("/api/creators"),
  /** The creator picked in the sidebar, by channel id. */
  selected: /** @type {string | null} */ (null),
  /** Null while the videos load. */
  recent: /** @type {Recent | null} */ (null),
  failed: false,
  /** Null while the topics are being grouped. */
  topics: /** @type {PageTopic[] | null} */ (null),
  topic: /** @type {string | null} */ (null),
  days: Math.min(config.days.max, Math.max(config.days.min, settings.creatorsWindowDays ?? 7)),
};

/** Whether this document was loaded by reloading the page. */
function reloadedHere() {
  const nav = /** @type {PerformanceNavigationTiming | undefined} */ (performance.getEntriesByType("navigation")[0]);
  return nav?.type === "reload";
}

/** A stable hue per topic name, so a topic keeps its colour from visit to visit. */
function hueOf(/** @type {string} */ name) {
  let n = 7;
  for (const c of name) n = (n * 31 + c.charCodeAt(0)) % 360;
  return n;
}

/* The parts of the page that stay put; `draw` fills them. */

const windowLabel = h("span");
const range = h("input", {
  type: "range",
  min: config.days.min,
  max: config.days.max,
  step: 1,
  value: state.days,
  "aria-label": "Days of recent videos to show",
  oninput: () => {
    state.days = Number(range.value);
    draw();
  },
  onchange: () => void patch("/api/settings", { creatorsWindowDays: state.days }),
});
const status = h("p", { class: "status creators-status", "aria-live": "polite" });
const topics = h("div", { class: "topics" });
const grid = h("div", { class: "grid" });
const nothing = h("p", { class: "empty" });
const rows = h("ul", { class: "rows" });
const noCreators = h("p", { class: "empty" }, "No creators. Paste a YouTube URL above to add one.");

document.body.append(
  h(
    "div",
    { class: "wrap" },
    topBar("creators"),
    h("h2", { class: "page-title" }, "Creators"),
    addCreatorForm(loadCreators),
    h("label", { class: "window" }, windowLabel, range),
    h("div", { class: "creators-layout" }, h("section", {}, status, topics, nothing, grid), h("aside", {}, rows, noCreators)),
  ),
);
setRefreshing(config.refreshing);

function draw() {
  const { creators, selected, recent, failed, topic, days } = state;
  const cutoff = Date.now() - days * DAY;
  const loading = recent === null;
  const inWindow = (recent?.cards ?? []).filter((r) => new Date(r.publishedAt).getTime() >= cutoff);
  const listed = inWindow.filter((r) => creators.some((c) => c.channelId === r.channelId));
  const topicIds = new Set(state.topics?.find((t) => t.name === topic)?.ids);
  const inTopic = (/** @type {RecentCard} */ r) => !topic || topicIds.has(r.card.id);
  const shown = listed.filter((r) => (!selected || r.channelId === selected) && inTopic(r));
  // Sidebar counts follow the chosen topic; topic badges follow the chosen creator.
  const count = (/** @type {string} */ id) => listed.filter((r) => r.channelId === id && inTopic(r)).length;
  const badges = (state.topics ?? [])
    .map((t) => {
      const ids = new Set(t.ids);
      const videos = listed.filter((r) => ids.has(r.card.id) && (!selected || r.channelId === selected));
      return { name: t.name, videos: videos.length, creators: new Set(videos.map((r) => r.channelId)).size };
    })
    .filter((b) => b.name === topic || b.videos >= (selected ? 1 : 2))
    .sort((a, b) => b.creators - a.creators || b.videos - a.videos)
    .slice(0, 12);
  // The list may have been cut off inside the window, so the count is a floor.
  const capped = (/** @type {string} */ id) => {
    const r = recent?.reach.find((x) => x.channelId === id);
    return !!r?.full && !!r.oldest && new Date(r.oldest).getTime() > cutoff;
  };

  windowLabel.textContent = `Last ${days} days`;

  status.replaceChildren(
    loading
      ? busyLine(failed ? "Could not read creator feeds. Reload to try again." : `Gathering videos from ${creators.length} creators`)
      : state.topics === null
        ? busyLine(`${listed.length} videos · grouping topics`)
        : `${listed.length} videos from ${new Set(listed.map((r) => r.channelId)).size} creators`,
  );

  topics.hidden = state.topics !== null && badges.length === 0;
  if (state.topics === null) {
    topics.setAttribute("aria-hidden", "true");
    topics.replaceChildren(...[96, 132, 84, 150, 110].map((w) => h("span", { class: "topic-ghost skeleton", style: { width: `${w}px` } })));
  } else {
    topics.removeAttribute("aria-hidden");
    topics.replaceChildren(
      ...badges.map((b) =>
        h(
          "button",
          {
            class: `topic${b.creators > 1 ? " multi" : ""}`,
            style: { "--h": hueOf(b.name) },
            type: "button",
            "aria-pressed": topic === b.name,
            title: b.creators > 1 ? `${b.creators} creators` : undefined,
            onclick: () => {
              state.topic = topic === b.name ? null : b.name;
              draw();
            },
          },
          b.name,
          h("span", {}, b.videos),
        ),
      ),
    );
  }

  const none = !loading && shown.length === 0;
  nothing.hidden = !none;
  grid.hidden = none;
  nothing.textContent = `Nothing in the last ${days} days${topic ? ` on ${topic}` : ""}${selected ? " from this creator" : ""}.`;
  sync(grid, loading ? slotEntries("loading", PLACEHOLDERS) : shown.map((r) => cardEntry(r.card, { onMore: () => explore(r.card) })));

  noCreators.hidden = creators.length > 0;
  sync(
    rows,
    creators.map((c) => {
      const on = selected === c.channelId;
      const n = count(c.channelId);
      const cut = capped(c.channelId);
      return {
        key: c.channelId,
        // Guidance is left out: the input holds its own text while this row stays on screen.
        sig: JSON.stringify([c.name, c.avatarUrl, on, loading, n, cut]),
        make: () =>
          h(
            "li",
            { class: `${on ? "on" : ""}${loading || n ? "" : " none"}` },
            h(
              "button",
              {
                class: "creator-pick",
                type: "button",
                "aria-pressed": on,
                onclick: () => {
                  state.selected = on ? null : c.channelId;
                  draw();
                },
              },
              c.avatarUrl ? h("img", { class: "avatar", src: c.avatarUrl, alt: "", referrerPolicy: "no-referrer" }) : h("span", { class: "avatar" }),
              h("span", { class: "name" }, c.name),
              loading
                ? h("span", { class: "count count-ghost skeleton" })
                : h("span", { class: "count", title: cut ? `Shows only the newest ${config.feedCap}` : undefined }, `${n}${cut ? "+" : ""}`),
            ),
            on &&
              h(
                "div",
                { class: "row-main" },
                guidanceInput(c),
                h("button", { class: "link-btn", type: "button", onclick: () => remove(c), "aria-label": `Delete ${c.name}` }, "Delete creator"),
              ),
          ),
      };
    }),
  );
}

/**
 * Guidance edited in place; saved on Enter or when focus leaves.
 * @param {Creator} creator
 */
function guidanceInput(creator) {
  const input = h("input", {
    class: "guidance-input",
    value: creator.guidance,
    placeholder: "No guidance: every new video. Click to add some.",
    "aria-label": `Guidance for ${creator.name}`,
    onblur: async () => {
      if (input.value.trim() === creator.guidance) return;
      const res = await patch(`/api/creators/${creator.channelId}`, { guidance: input.value });
      if (res.ok) creator.guidance = input.value.trim();
    },
    onkeydown: (/** @type {KeyboardEvent} */ e) => {
      if (e.key === "Enter") input.blur();
      if (e.key === "Escape") {
        input.value = creator.guidance;
        input.blur();
      }
    },
  });
  return input;
}

/**
 * Paste a video, Shorts, youtu.be, /@handle or /channel/UC… URL; optional guidance for that creator.
 * @param {() => void} onAdded
 */
function addCreatorForm(onAdded) {
  const url = h("input", { class: "field url", placeholder: "Paste a YouTube video or channel URL", "aria-label": "YouTube URL" });
  const guidance = h("input", { class: "field guide", placeholder: "Guidance (optional), e.g. only announcement videos", "aria-label": "Guidance for this creator" });
  const submit = h("button", { class: "btn primary", type: "submit", disabled: true }, "Add creator");
  const said = h("p", { hidden: true });
  const say = (/** @type {"error" | "ok" | ""} */ kind, text = "") => {
    said.hidden = !kind;
    said.className = kind;
    said.textContent = text;
  };
  const busy = (/** @type {boolean} */ on) => {
    submit.disabled = on || !url.value.trim();
    submit.textContent = on ? "Adding" : "Add creator";
  };
  url.oninput = () => busy(false);
  return h(
    "form",
    {
      class: "add-form",
      onsubmit: async (/** @type {Event} */ e) => {
        e.preventDefault();
        busy(true);
        say("");
        try {
          const res = await post("/api/creators", { url: url.value, guidance: guidance.value });
          const data = await res.json();
          if (!res.ok) say("error", data.error ?? "Could not add that creator.");
          else {
            say("ok", data.added ? `Added ${data.creator.name}.` : `${data.creator.name} is already listed.`);
            url.value = guidance.value = "";
            onAdded();
          }
        } catch {
          say("error", "Could not reach the server.");
        }
        busy(false);
      },
    },
    url,
    guidance,
    submit,
    said,
  );
}

/** @param {Creator} c */
async function remove(c) {
  state.creators = state.creators.filter((x) => x.channelId !== c.channelId);
  if (state.selected === c.channelId) state.selected = null;
  draw();
  await del(`/api/creators/${c.channelId}`);
}

/**
 * Search the video's topic on home: go there now, and home runs it behind placeholders. Creators stays untouched.
 * @param {Card} card
 */
function explore(card) {
  handToHome({ kind: "video", title: card.title, channel: card.meta.split(" · ")[0] });
}

/* Loading */

/** The videos, then the topics across them. `fresh` asks the server to read every list again. */
async function loadVideos(fresh = false) {
  state.failed = false;
  try {
    state.recent = await load(`/api/creators/recent${fresh ? "?fresh=1" : ""}`);
  } catch {
    state.failed = true;
    return draw();
  }
  state.topics = null;
  draw();
  try {
    state.topics = (await load("/api/creators/topics")).topics;
  } catch {
    state.topics = [];
  }
  draw();
}

/** The list of creators changed (added here, in the header, or from the player): read it and their videos again. */
async function loadCreators() {
  state.creators = await load("/api/creators");
  draw();
  await loadVideos();
}

window.addEventListener(CREATORS_CHANGED_EVENT, () => void loadCreators());
onPlayerMessage((msg) => msg.type === "creators" && void loadCreators());

draw();
void loadVideos(reloadedHere());
