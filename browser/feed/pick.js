/*
  The two rules of the highlight on Home, pure so they are tested directly:
  which card wears it after the highlighted one leaves, and where an arrow key
  moves it. `ids` is the grid in reading order, as drawn.
*/

/**
 * The card to highlight once `picked` leaves the grid: the one after it, the
 * first from the last, nothing when it was the only card. Called with the
 * grid as it was, `picked` still in it.
 * @param {string[]} ids
 * @param {string} picked
 */
export function nextPick(ids, picked) {
  const at = ids.indexOf(picked);
  if (at < 0) return undefined;
  const next = ids[(at + 1) % ids.length];
  return next === picked ? undefined : next;
}

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
 * Whether the highlighted card is the last in its row (or the last card): on
 * Creators, Right from there leaves the grid for the sidebar.
 * @param {string[]} ids
 * @param {string} picked
 * @param {number} columns
 */
export function atRightEdge(ids, picked, columns) {
  const at = ids.indexOf(picked);
  return at >= 0 && (at === ids.length - 1 || at % columns === columns - 1);
}
