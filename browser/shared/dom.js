/*
  The three helpers every page builds its DOM with. There is no framework under
  them: a component is a function that returns an element, and a page redraws
  by calling `sync` with the tiles it wants on screen.
*/

/**
 * Build an element: `h("button", { class: "btn", onclick: save, disabled: busy }, "Save")`.
 * `class` and `style` (an object, CSS variables included) are set as such, `on…`
 * props are listeners, `aria-…` props are written out even when false, and the
 * rest are properties where the element has one and attributes otherwise.
 * False, null and undefined props and children are skipped.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Record<string, any>} [props]
 * @param {...(Node | string | number | false | null | undefined | (Node | string | false | null | undefined)[])} children
 * @returns {HTMLElementTagNameMap[K]}
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (value == null) continue;
    if (name.startsWith("aria-")) el.setAttribute(name, String(value));
    else if (value === false) continue;
    else if (name === "class") el.className = value;
    else if (name === "style") for (const [p, v] of Object.entries(value)) el.style.setProperty(p, String(v));
    else if (name.startsWith("on")) el.addEventListener(name.slice(2), value);
    else if (name in el) /** @type {any} */ (el)[name] = value;
    else el.setAttribute(name, value === true ? "" : String(value));
  }
  for (const child of children.flat()) {
    if (child !== false && child != null && child !== "") el.append(typeof child === "number" ? String(child) : child);
  }
  return el;
}

/**
 * An icon drawn on a 24px grid in the current text colour. `shapes` is trusted
 * markup written in this codebase, never text from outside.
 * @param {string} shapes
 */
export function icon(shapes, { size = 18, stroke = 2, fill = "none" } = {}) {
  const t = document.createElement("template");
  t.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${fill}" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes}</svg>`;
  return /** @type {SVGElement} */ (t.content.firstElementChild);
}

export const ICONS = {
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />',
  search: '<circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" />',
};

/** @typedef {{ key: string, sig: string, make: (replacing: boolean) => HTMLElement }} Tile */

/** @type {WeakMap<Element, Map<string, { sig: string, el: HTMLElement }>>} */
const drawn = new WeakMap();

/**
 * Make `parent`'s children match `tiles`, in order. A tile whose `sig` is
 * unchanged keeps its element untouched (so its animation and image do not
 * restart); one whose `sig` changed is rebuilt in place; `make` is told when it
 * is replacing an element already on screen.
 * @param {Element} parent
 * @param {Tile[]} tiles
 */
export function sync(parent, tiles) {
  const before = drawn.get(parent) ?? new Map();
  const keys = new Set(tiles.map((t) => t.key));
  for (const [key, { el }] of before) if (!keys.has(key)) el.remove();
  const after = new Map();
  tiles.forEach((t, i) => {
    const old = before.get(t.key);
    const el = old && old.sig === t.sig ? old.el : t.make(!!old);
    if (old && old.el !== el) old.el.replaceWith(el);
    if (parent.children[i] !== el) parent.insertBefore(el, parent.children[i] ?? null);
    after.set(t.key, { sig: t.sig, el });
  });
  drawn.set(parent, after);
}
