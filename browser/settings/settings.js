import { boot, load, patch } from "../shared/api.js";
import { h } from "../shared/dom.js";
import { deleteKeys } from "../shared/keys.js";
import { topBar } from "../shared/top-bar.js";

/*
  The guide at the foot of the page: everything the app does that no button
  shows. Each entry is the keys (or the click) and what they do, in the app's
  own words. A new shortcut is not done until it is listed here.
*/
/** @type {{ where: string, note?: string, moves: [keys: string[], does: string][] }[]} */
const GUIDE = [
  {
    where: "One window",
    note: "The app opens as one browser window with the Player beside it. Clicks queue and play in the right half exactly as with two windows; F on the video fills the whole display. Drag the strip between the halves to resize them. The Player button in the top bar hides or shows the Player; hidden stays hidden while you queue and play. An empty History hides it. Keys go to whichever half has focus. The windowed Player still works.",
    moves: [],
  },
  {
    where: "Player",
    note: "The keys work while the player's own page has the keyboard. After a click on the video they go to YouTube; click the bar or the History column to get them back.",
    moves: [
      [["↑", "↓"], "Play the video above or below in History. The playing one stays at the column's middle; the list slides. Each video picks up where you left it."],
      [["Delete"], "Remove the playing video from History and move on to the one below it."],
      [["Space"], "Pause or play. Works on Creators and Favorites too (not in a box), whichever window has the keyboard."],
      [["←", "→"], "Back or forward 10 seconds."],
      [["C"], "Open or close Chapters, for a video that has them."],
      [["↑", "↓"], "With Chapters open: the previous or next chapter."],
      [["Esc"], "Close Chapters."],
    ],
  },
  {
    where: "Creators",
    note: "Each creator's list is read from YouTube at most twice a day; the status line says when. A reload asks for nothing new. A creator added just now is read at once.",
    moves: [
      [["click"], "On a video, while the player is playing: queue it right under the one playing, and the card says Queued (the one playing says Playing). The first click, with nothing playing, plays. A marked card ignores further clicks."],
      [["Shift", "click"], "On a queued video: take it out of the queue again. On the playing one: the same as its Delete, the next one plays."],
      [["click"], "On a creator in the sidebar: pick them. The grid shows their latest 30 videos whatever the day slider says. Click again, or an empty part of the page, to let go."],
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

/** Only where this browser holds the key: on a server with its own, there is nothing here to delete. */
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
        h("legend", {}, "API key"),
        h("p", {}, "Your key is saved in this browser only. Deleting it brings back the Add your key step."),
        h(
          "button",
          {
            class: "btn",
            type: "button",
            onclick: () => {
              deleteKeys();
              location.href = "/creators";
            },
          },
          "Delete key",
        ),
      ),
  ),
);
