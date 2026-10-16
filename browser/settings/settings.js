import { boot, load, patch } from "../shared/api.js";
import { h } from "../shared/dom.js";
import { deleteKeys } from "../shared/keys.js";
import { setRefreshing, topBar } from "../shared/top-bar.js";

/** @type {{ value: Settings["onFavorite"], label: string }[]} */
const ON_FAVORITE = [
  { value: "ask", label: "Ask each time" },
  { value: "remove", label: "Delete from home" },
  { value: "keep", label: "Keep on home" },
];

/*
  The guide at the foot of the page: everything the app does that no button
  shows. Each entry is the keys (or the click) and what they do, in the app's
  own words. A new shortcut is not done until it is listed here.
*/
/** @type {{ where: string, note?: string, moves: [keys: string[], does: string][] }[]} */
const GUIDE = [
  {
    where: "Home",
    moves: [
      [["click"], "On a video: while the player is playing, queue it right under the one playing; with nothing playing, play it. Either way the card leaves Home, as its × does."],
      [["←", "→", "↑", "↓"], "Move the highlight through the grid; the first press highlights the first card. Esc drops it. A click on a card moves it there."],
      [["Enter"], "On a highlighted topic: More like this, and the topic leaves; the results land where it was. On a video: the click, queue or play. The highlight moves to the next card, the first from the last."],
      [["Delete"], "Remove the highlighted card, as its × does. The highlight moves on the same way."],
    ],
  },
  {
    where: "Player",
    note: "The keys work while the player's own page has the keyboard. After a click on the video they go to YouTube; click the bar or the History column to get them back.",
    moves: [
      [["↑", "↓"], "Play the video above or below in History. The playing one stays at the column's middle; the list slides. Each video picks up where you left it."],
      [["Delete"], "Remove the playing video from History and move on to the one below it. Home keeps its card."],
      [["←", "→"], "Back or forward 10 seconds."],
      [["C"], "Open or close Chapters, for a video that has them."],
      [["↑", "↓"], "With Chapters open: the previous or next chapter."],
      [["Esc"], "Close Chapters."],
    ],
  },
  {
    where: "Creators",
    moves: [
      [["click"], "On a video, while the player is playing: queue it right under the one playing, and the card says Queued (the one playing says Playing). The first click, with nothing playing, plays. A marked card ignores further clicks."],
      [["Shift", "click"], "On a queued video: take it out of the queue again. On the playing one: the same as its Delete, the next one plays."],
      [["click"], "On a creator in the sidebar: pick them. The grid shows their latest 30 videos whatever the day slider says, and the topic chips step aside. Click again, or an empty part of the page, to let go."],
      [["↑", "↓"], "With a creator picked: move the pick up or down the list. Wraps at both ends."],
      [["←"], "Highlight the video beside the picked creator, the nearest one on screen. From then on the arrows walk the grid, stopping at its edges; → off the right edge, or Esc, goes back to the creator list."],
      [["Enter"], "On the highlighted video: queue or play, as its click; on a Queued or Playing one: take it out again, as shift-click."],
    ],
  },
  {
    where: "Favorites",
    moves: [
      [["click"], "On a video: as on Creators, queue or play, and the card says Queued or Playing while it is in the player's History. It stays a favorite."],
      [["Shift", "click"], "On a queued video: take it out of the queue again. On the playing one: the next plays."],
    ],
  },
];

function guide() {
  return h(
    "fieldset",
    { class: "setting guide" },
    h("legend", {}, "Keys and power moves"),
    h("p", {}, "None of these has a button. When a video ends in the player, the next one down that you have not finished starts by itself. History is kept when the player closes; a row leaves only by its ×."),
    GUIDE.flatMap((section) => [
      h("h3", {}, section.where),
      h(
        "dl",
        {},
        section.moves.flatMap(([keys, does]) => [h("dt", {}, keys.map((k) => h("kbd", {}, k))), h("dd", {}, does)]),
      ),
      section.note && h("p", {}, section.note),
    ]),
  );
}

const config = await boot();
/** @type {Settings} */
const settings = await load("/api/settings");

const save = (/** @type {Partial<Settings>} */ change) => patch("/api/settings", change);

/** Only where this browser holds the keys: on a server with its own, there is nothing here to delete. */
const ownKeys = Object.values(config.keys).includes("browser");

document.body.append(
  h(
    "div",
    { class: "wrap narrow" },
    topBar("settings"),
    h("h2", { class: "page-title" }, "Settings"),
    h(
      "fieldset",
      { class: "setting" },
      h("legend", {}, "When I favorite a card"),
      ON_FAVORITE.map((o) =>
        h(
          "label",
          { class: "check" },
          h("input", { type: "radio", name: "onFavorite", value: o.value, checked: settings.onFavorite === o.value, onchange: () => save({ onFavorite: o.value }) }),
          o.label,
        ),
      ),
    ),
    h(
      "fieldset",
      { class: "setting" },
      h("legend", {}, "Members-only videos"),
      h(
        "label",
        { class: "check" },
        h("input", {
          type: "checkbox",
          checked: settings.skipMembersOnly !== false,
          onchange: (/** @type {Event} */ e) => save({ skipMembersOnly: /** @type {HTMLInputElement} */ (e.target).checked }),
        }),
        "Skip members-only content",
      ),
    ),
    guide(),
    ownKeys &&
      h(
        "fieldset",
        { class: "setting" },
        h("legend", {}, "API keys"),
        h("p", {}, "Your keys are saved in this browser only. Deleting them brings back the Add your keys step."),
        h(
          "button",
          {
            class: "btn",
            type: "button",
            onclick: () => {
              deleteKeys();
              location.href = "/";
            },
          },
          "Delete keys",
        ),
      ),
  ),
);
setRefreshing(config.refreshing);
