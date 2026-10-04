import { del, post } from "../shared/api.js";
import { h, icon, ICONS } from "../shared/dom.js";
import { announce } from "../shared/player-link.js";

/*
  Which removals this window's star made, kept in sessionStorage: it lasts
  while the window is open, across videos, so unstarring only ever restores a
  card its own star removed (an earlier × stays removed).
*/
const KEY = "player-removed";

/** @returns {Set<string>} */
function starRemovals() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

/**
 * @param {string} id
 * @param {boolean} on
 */
function setStarRemoved(id, on) {
  try {
    const ids = starRemovals();
    if (on) ids.add(id);
    else ids.delete(id);
    sessionStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {}
}

/**
 * The bar under the video: who made it (or Add creator) and a favorite star
 * that follows the "on favorite" setting. No link out to YouTube: loading
 * youtube.com here wipes the window's name, and the next thumbnail opens a
 * second window.
 * @param {PlayerVideo} video
 * @param {HTMLElement} [tool] A button from elsewhere on the page (Chapters) that sits in the bar, left of the star.
 */
export function playerBar(video, tool) {
  const state = {
    creator: video.creator,
    adding: false,
    creatorNote: "",
    favorited: video.favorited,
    /** The "Also remove from Home?" question is showing. */
    asking: false,
    removed: starRemovals().has(video.id),
  };
  const bar = h("div", { class: "player-bar" });

  async function remove() {
    state.asking = false;
    state.removed = true;
    setStarRemoved(video.id, true);
    draw();
    await post(`/api/items/${encodeURIComponent(video.id)}/remove`);
    announce({ type: "card", id: video.id });
  }

  async function toggleFavorite() {
    if (!state.favorited) {
      state.favorited = true;
      draw();
      const res = await post("/api/player/favorite", { videoId: video.videoId });
      if (!res.ok) {
        state.favorited = false;
        return draw();
      }
      announce({ type: "card", id: video.id });
      // Only a card showing on home can leave it.
      if (!video.inFeed || video.removed) return;
      if (video.onFavorite === "remove") await remove();
      else if (video.onFavorite === "ask") {
        state.asking = true;
        draw();
      }
      return;
    }
    state.favorited = false;
    state.asking = false;
    draw();
    await del(`/api/favorites/${encodeURIComponent(video.id)}`);
    if (state.removed) {
      state.removed = false;
      setStarRemoved(video.id, false);
      draw();
      await post(`/api/items/${encodeURIComponent(video.id)}/restore`);
    }
    announce({ type: "card", id: video.id });
  }

  async function addCreator() {
    state.adding = true;
    state.creatorNote = "";
    draw();
    try {
      const res = await post("/api/creators", { url: video.link, guidance: "", grab: true });
      const data = await res.json();
      if (!res.ok) state.creatorNote = data.error ?? "Could not add";
      else {
        state.creator = { name: data.creator.name, avatarUrl: data.creator.avatarUrl };
        state.creatorNote = data.added ? "Added" : "";
        announce({ type: "creators" });
      }
    } catch {
      state.creatorNote = "Could not add";
    }
    state.adding = false;
    draw();
  }

  function draw() {
    const { creator, adding, creatorNote, favorited, asking, removed } = state;
    bar.replaceChildren(
      h(
        "div",
        { class: "player-creator" },
        creator
          ? [
              creator.avatarUrl ? h("img", { class: "avatar", src: creator.avatarUrl, alt: "", referrerPolicy: "no-referrer" }) : h("span", { class: "avatar" }),
              h("span", { class: "name" }, creator.name),
            ]
          : video.channel && h("span", { class: "name" }, video.channel),
      ),
      h(
        "div",
        { class: "player-actions" },
        asking && h("button", { class: "link-btn", type: "button", onclick: remove }, "Also remove from Home?"),
        tool,
        h(
          "button",
          {
            class: `icon-btn player-star${favorited ? " on" : ""}`,
            type: "button",
            onclick: toggleFavorite,
            "aria-pressed": favorited,
            "aria-label": favorited ? "Unfavorite" : "Favorite",
            title: favorited ? (removed ? "Unfavorite and put back on Home" : "Unfavorite") : "Favorite",
          },
          icon(ICONS.star, { stroke: 2.2, fill: favorited ? "currentColor" : "none" }),
        ),
        creatorNote && h("span", { class: "player-note" }, creatorNote),
        !creator && h("button", { class: "btn add-creator", type: "button", onclick: addCreator, disabled: adding }, adding ? "Adding" : "Add creator"),
      ),
    );
  }
  draw();
  return bar;
}
