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
