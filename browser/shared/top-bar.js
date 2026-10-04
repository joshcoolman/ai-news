import { addCreatorDialog } from "./add-creator-dialog.js";
import { h, icon, ICONS } from "./dom.js";
import { CREATORS_CHANGED_EVENT, FEED_CHANGED_EVENT, handToHome, REFRESH_EVENT, SEARCH_EVENT } from "./handoff.js";
import { toast } from "./toast.js";

/** @typedef {"home" | "favorites" | "creators" | "settings"} Page */

/** @type {{ href: string, name: string, key: Page, shapes: string }[]} */
const PAGES = [
  { href: "/", name: "Home", key: "home", shapes: '<path d="M3.5 11 12 4l8.5 7M5.5 9.5V20h4.5v-5.5h4V20h4.5V9.5" />' },
  { href: "/favorites", name: "Favorites", key: "favorites", shapes: ICONS.star },
  { href: "/creators", name: "Creators", key: "creators", shapes: '<rect x="2.5" y="5.5" width="19" height="13" rx="4" /><path d="M10 9.5v5l4.2-2.5z" fill="currentColor" />' },
  {
    href: "/settings",
    name: "Settings",
    key: "settings",
    shapes:
      '<circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />',
  },
];

const REFRESH_ICON = '<path d="M20 12a8 8 0 0 1-13.7 5.6" /><path d="M4 12a8 8 0 0 1 13.7-5.6" /><path d="M18 3v4h-4" /><path d="M6 21v-4h4" />';
const ADD_ICON = '<circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.5-3.6 3.2-5.5 6.5-5.5s6 1.9 6.5 5.5" /><path d="M19 8v6M16 11h6" />';

/** The buttons that follow a running refresh, on whichever page drew the header. */
/** @type {((on: boolean) => void)[]} */
const followers = [];

/** Home reports whether its refresh is running; other pages learn it once, from /api/config. */
export function setRefreshing(/** @type {boolean} */ on) {
  for (const follow of followers) follow(on);
}

/**
 * The shared header: home, Favorites and Creators on the left, then a divider and
 * refresh / add creator / search (every page), Settings on the right. On home
 * the actions reach the feed in place; elsewhere refresh and search go home first.
 * @param {Page} current
 */
export function topBar(current) {
  const home = current === "home";
  const link = (/** @type {(typeof PAGES)[number]} */ p) =>
    h("a", { class: "icon-btn", href: p.href, "aria-label": p.name, title: p.name, "aria-current": p.key === current ? "page" : undefined }, icon(p.shapes));

  const refresh = h(
    "button",
    {
      class: "icon-btn",
      type: "button",
      onclick: () => (home ? window.dispatchEvent(new Event(REFRESH_EVENT)) : handToHome({ kind: "refresh" })),
    },
    icon(REFRESH_ICON),
  );
  const search = searchPill((query) =>
    home ? window.dispatchEvent(new CustomEvent(SEARCH_EVENT, { detail: { query } })) : handToHome({ kind: "search", query }),
  );
  followers.push((on) => {
    refresh.disabled = on;
    refresh.classList.toggle("spinning", on);
    refresh.title = on ? "Refreshing" : "Refresh";
    refresh.setAttribute("aria-label", refresh.title);
    search.button.disabled = on;
  });
  setRefreshing(false);

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
          const { name, grabbed } = result;
          const notice =
            grabbed === undefined
              ? `Added ${name}; their videos arrive with the next refresh`
              : `Added ${name}${grabbed ? ` and ${grabbed} recent ${grabbed === 1 ? "video" : "videos"}` : ", nothing recent to grab"}`;
          if (home) window.dispatchEvent(new CustomEvent(FEED_CHANGED_EVENT, { detail: { notice } }));
          else toast("done", `Added ${name}. Home page updated`);
        }),
    },
    icon(ADD_ICON),
  );

  return h(
    "header",
    { class: "top" },
    h("nav", {}, PAGES.filter((p) => p.key !== "settings").map(link)),
    h("span", { class: "divider", "aria-hidden": true }),
    refresh,
    add,
    search.form,
    h("nav", { class: "end" }, PAGES.filter((p) => p.key === "settings").map(link)),
  );
}

/**
 * A magnifier button that opens in place into the search input. Enter runs the search and it folds back, cleared.
 * @param {(query: string) => void} onSearch
 */
function searchPill(onSearch) {
  const label = "Search YouTube, last month";
  const input = h("input", { type: "text", placeholder: label, "aria-label": label, tabIndex: -1 });
  const button = h("button", { class: "icon-btn", type: "button", "aria-label": label, title: label }, icon(ICONS.search));
  const form = h("form", { class: "search-pill", role: "search" }, button, input);

  const open = (/** @type {boolean} */ on) => {
    form.classList.toggle("open", on);
    button.tabIndex = on ? -1 : 0;
    input.tabIndex = on ? 0 : -1;
    if (on) input.focus();
    else input.value = "";
  };
  button.onclick = () => open(true);
  // Listeners, not `on…` properties: a property handler that returns false cancels the event, and that swallowed Enter.
  input.addEventListener("blur", () => !input.value.trim() && open(false));
  input.addEventListener("keydown", (e) => e.key === "Escape" && open(false));
  form.onsubmit = (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    open(false);
    input.blur();
    onSearch(q);
  };
  return { form, button };
}
