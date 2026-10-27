import { del, post } from "../shared/api.js";
import { h, icon, ICONS } from "../shared/dom.js";
import { announce } from "../shared/player-link.js";

/**
 * The bar under the video: who made it (or Add creator) and a favorite star.
 * No link out to YouTube: loading youtube.com here wipes the window's name,
 * and the next thumbnail opens a second window.
 * @param {PlayerVideo} video
 * @param {HTMLElement[]} [tools] Buttons from elsewhere on the page (Chapters, Transcript) that sit in the bar, left of the star.
 */
export function playerBar(video, tools = []) {
  const state = {
    creator: video.creator,
    adding: false,
    creatorNote: "",
    favorited: video.favorited,
  };
  const bar = h("div", { class: "player-bar" });

  async function toggleFavorite() {
    if (!state.favorited) {
      state.favorited = true;
      draw();
      const res = await post("/api/player/favorite", { videoId: video.videoId });
      if (!res.ok) {
        state.favorited = false;
        return draw();
      }
    } else {
      state.favorited = false;
      draw();
      await del(`/api/favorites/${encodeURIComponent(video.id)}`);
    }
    announce({ type: "card", id: video.id });
  }

  async function addCreator() {
    state.adding = true;
    state.creatorNote = "";
    draw();
    try {
      const res = await post("/api/creators", { url: video.link });
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
    const { creator, adding, creatorNote, favorited } = state;
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
        ...tools,
        h(
          "button",
          {
            class: `icon-btn player-star${favorited ? " on" : ""}`,
            type: "button",
            onclick: toggleFavorite,
            "aria-pressed": favorited,
            "aria-label": favorited ? "Unfavorite" : "Favorite",
            title: favorited ? "Unfavorite" : "Favorite",
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
