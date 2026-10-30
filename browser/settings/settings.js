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
    note: "The app opens as one browser window with the Player beside it. Clicks queue and play in the right half exactly as with two windows. Drag the strip between the halves to resize them. The Player button in the top bar hides or shows the Player; hidden stays hidden while you queue and play. An empty History hides it. Keys go to whichever half has focus; only that half shows its green marks, and the other keeps its place for when you come back. The windowed Player still works.",
    moves: [
      [["Shift", "←"], "Give the keys to the left half: Creators, Favorites or Settings."],
      [["Shift", "→"], "Give the keys to the Player, while it shows."],
      [["F"], "From either half, while the Player shows: fill the display with the video. ← and → skip 10 seconds; C opens Chapters beside it, T the Transcript, and ↑ ↓ walk whichever is open; Delete removes the video and the next plays in the normal view; every other key does nothing until F again, or Esc, comes back."],
      [["I"], "From either half, while a video is in the Player: shrink it to a small video in the lower right over the left half, which takes the keyboard; hover it for back 10 seconds and Next. I again puts back the view you left, filled display and Chapters included, with the keyboard in the Player."],
      [["[", "]"], "From either half: slide the split left or right a step, between the left half alone, both, and the Player alone. The arrows on the strip between the halves do the same."],
    ],
  },
  {
    where: "Player",
    note: "The keys work while the player's own page has the keyboard. YouTube's own controls work on the video; after a click there the keyboard comes back to the app by itself.",
    moves: [
      [["↑", "↓"], "Play the video above or below in History. The playing one stays at the column's middle; the list slides. Each video picks up where you left it."],
      [["Delete"], "Remove the playing video from History and move on to the one below it."],
      [["Space"], "Pause or play. Works on Creators and Favorites too (not in a box), whichever window has the keyboard."],
      [["←", "→"], "Back or forward 10 seconds."],
      [["click"], "On the black around the video: pause or play."],
      [["double-click"], "On the black around the video, or F: fill the display with it. Esc comes back."],
      [["C"], "Open or close Chapters, for a video that has them. While the video fills the display it opens as a sidebar beside it."],
      [["↑", "↓"], "With Chapters or the Transcript open: the previous or next chapter, or paragraph."],
      [["T"], "Open or close the Transcript, for a video YouTube has one for: asked for once when the video is queued or played, and a green T on the History row says it is here. Readable paragraphs, a timestamp on each that plays from there; the paragraph playing is marked and scrolls to the top as the video goes, unless you have just scrolled it yourself. Chapters and Transcript take turns in the same place."],
      [["Esc"], "Close Chapters or the Transcript."],
    ],
  },
  {
    where: "Creators",
    note: "Each creator's list is read from YouTube at most twice a day; the status line says when. A reload asks for nothing new. A creator added just now is read at once.",
    moves: [
      [["click"], "On a video, while the player is playing: queue it right under the one playing, and the card says Queued (the one playing says Playing). The first click, with nothing playing, plays. Click a Queued one again to take it out; the Playing one ignores clicks."],
      [["Shift", "click"], "On a queued video: take it out of the queue again, as its click. On the playing one: the same as its Delete, the next one plays."],
      [["click"], "On a creator in the sidebar: pick them. The grid shows their latest 30 videos whatever the day slider says. Click again, All creators at the top of the list, or an empty part of the page, to let go. A creator just added is picked."],
      [["↑", "↓"], "With a creator picked: move the pick up or down the list. Wraps at both ends."],
      [["←"], "Highlight the video beside the picked creator, the nearest one on screen. From then on the arrows walk the grid, stopping at its edges; → off the right edge, or Esc, goes back to the creator list."],
      [["Enter"], "On the highlighted video: queue or play, as its click; on a Queued or Playing one: take it out again, as shift-click."],
      [["Esc"], "With a creator picked and no video highlighted: let go, back to everyone's videos. Not while a dialog is open or the video fills the display."],
      [["C"], "Pick the first creator, from the top. With a creator picked: let go and go back to the video highlighted before, else the first."],
    ],
  },
  {
    where: "Favorites",
    moves: [
      [["click"], "On a video: as on Creators, queue or play, and the card says Queued or Playing while it is in the player's History; click a Queued one again to take it out. It stays a favorite."],
      [["Shift", "click"], "On a queued video: take it out of the queue again. On the playing one: the next plays."],
      [["←", "→", "↑", "↓"], "Highlight the first video, then walk the grid, stopping at its edges. Esc lets go."],
      [["Enter"], "On the highlighted video: queue or play, as its click; on a Queued or Playing one: take it out again, as shift-click."],
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
