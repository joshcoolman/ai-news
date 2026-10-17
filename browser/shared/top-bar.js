import { addCreatorDialog } from "./add-creator-dialog.js";
import { h, icon, ICONS } from "./dom.js";
import { toast } from "./toast.js";

/** @typedef {"creators" | "favorites" | "settings"} Page */

/** The list of creators changed: Creators reads it and their videos again. */
export const CREATORS_CHANGED_EVENT = "ainews:creators-changed";

/** @type {{ href: string, name: string, key: Page, shapes: string }[]} */
const PAGES = [
  { href: "/creators", name: "Creators", key: "creators", shapes: '<rect x="2.5" y="5.5" width="19" height="13" rx="4" /><path d="M10 9.5v5l4.2-2.5z" fill="currentColor" />' },
  { href: "/favorites", name: "Favorites", key: "favorites", shapes: ICONS.star },
  {
    href: "/settings",
    name: "Settings",
    key: "settings",
    shapes:
      '<circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />',
  },
];

const ADD_ICON = '<circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.5-3.6 3.2-5.5 6.5-5.5s6 1.9 6.5 5.5" /><path d="M19 8v6M16 11h6" />';

/**
 * The shared header: Creators and Favorites on the left, then a divider and
 * Add creator, Settings on the right.
 * @param {Page} current
 */
export function topBar(current) {
  const link = (/** @type {(typeof PAGES)[number]} */ p) =>
    h("a", { class: "icon-btn", href: p.href, "aria-label": p.name, title: p.name, "aria-current": p.key === current ? "page" : undefined }, icon(p.shapes));

  const add = h(
    "button",
    {
      class: "icon-btn",
      type: "button",
      "aria-label": "Add creator",
      title: "Add creator",
      onclick: () =>
        addCreatorDialog((result) => {
          if (!result) return;
          window.dispatchEvent(new Event(CREATORS_CHANGED_EVENT));
          toast("done", `Added ${result.name}`);
        }),
    },
    icon(ADD_ICON),
  );

  return h(
    "header",
    { class: "top" },
    h("nav", {}, PAGES.filter((p) => p.key !== "settings").map(link)),
    h("span", { class: "divider", "aria-hidden": true }),
    add,
    h("nav", { class: "end" }, PAGES.filter((p) => p.key === "settings").map(link)),
  );
}
