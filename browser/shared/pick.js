/*
  The rules of the keyboard highlight on Creators, pure so they are tested
  directly: where an arrow key moves it, when it is at the grid's right edge,
  and where Left from the sidebar lands. `ids` is the grid in reading order, as drawn.
*/

/**
 * Where an arrow moves the highlight: left and right one card through reading
 * order, up and down one row (`columns` cards), stopping at the grid's ends.
 * Nothing picked: the first card.
 * @param {string[]} ids
 * @param {string | null} picked
 * @param {"ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown"} key
 * @param {number} columns
 */
export function movePick(ids, picked, key, columns) {
  if (ids.length === 0) return undefined;
  const at = picked ? ids.indexOf(picked) : -1;
  if (at < 0) return ids[0];
  const by = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : key === "ArrowUp" ? -columns : columns;
  const to = at + by;
  return to < 0 || to >= ids.length ? ids[at] : ids[to];
}

/**
 * Whether the highlighted card is the last in its row (or the last card):
 * Right from there leaves the grid for the sidebar.
 * @param {string[]} ids
 * @param {string} picked
 * @param {number} columns
 */
export function atRightEdge(ids, picked, columns) {
  const at = ids.indexOf(picked);
  return at >= 0 && (at === ids.length - 1 || at % columns === columns - 1);
}

/**
 * Where Left from the Creators sidebar lands: among the cards at the right
 * edge of their row (nearest the sidebar), the one whose vertical middle is
 * closest to `y`, so the highlight appears beside what the eye is on and the
 * page need not scroll. `cards` is the grid in reading order with each card's
 * top and bottom on screen.
 * @param {number} y
 * @param {{ id: string, top: number, bottom: number }[]} cards
 * @param {number} columns
 */
export function nearestPick(y, cards, columns) {
  const edge = cards.filter((c, i) => i === cards.length - 1 || i % columns === columns - 1);
  let best;
  for (const c of edge) {
    const d = Math.abs((c.top + c.bottom) / 2 - y);
    if (!best || d < best.d) best = { id: c.id, d };
  }
  return best?.id;
}
