import { it } from "node:test";

/**
 * One test per row: `each(rows)("reads %s", (a, b) => ...)`. Each `%s` in the name takes the next value of the row;
 * a row that is not a list is a single value.
 * @param {unknown[]} rows
 * @returns {(name: string, fn: (...row: any[]) => void) => void}
 */
export const each = (rows) => (name, fn) => {
  for (const row of rows) {
    const values = Array.isArray(row) ? row : [row];
    let n = 0;
    it(name.replace(/%[sj]/g, () => JSON.stringify(values[n++])), () => fn(...values));
  }
};
