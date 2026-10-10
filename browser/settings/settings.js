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
    moves: [[["Shift", "click"], "On a video, while the player is playing: queue it right under the one playing. The card leaves Home. With no player playing, nothing happens."]],
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
    moves: [[["↑", "↓"], "With a creator picked: move the pick up or down the list. Wraps at both ends. Click the picked creator again, or an empty part of the page, to let go."]],
  },
];

function guide() {
  return h(
    "fieldset",
    { class: "setting guide" },
    h("legend", {}, "Keys and power moves"),
    h("p", {}, "None of these has a button. When a video ends in the player, the next one down that you have not finished starts by itself."),
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
    { class: "wrap" },
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
