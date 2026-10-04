import { promises as fs } from "node:fs";
import path from "node:path";

/*
  All persistence goes through this module so a hosted version can swap the
  JSON files for a database. Every change is read-modify-write through one
  in-process queue, so a refresh that runs for minutes cannot overwrite a
  removal made while it ran. DATA_DIR moves the files (a mounted volume when
  hosted); the default is ./data.
*/

const DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

/** @type {Creator[]} */
const DEFAULT_CREATORS = [
  ["Matthew Berman", "UCawZsQWqfGSbCI5yjkdVkTA", ""],
  ["Riley Brown", "UCMcoud_ZW7cfxeIugBflSBw", ""],
  ["Fast Hours", "UCxkOnB_ojDRWywB2W1fGCdg", ""],
  ["OpenAI", "UCXZCJLdBC09xxGZ6gcdrc6A", "Only announcement videos."],
  ["Anthropic", "UCrDwWp7EBBv4NwvScIpBDOA", "Only announcement videos."],
].map(([name, channelId, guidance]) => ({
  channelId,
  name,
  channelUrl: `https://www.youtube.com/channel/${channelId}`,
  avatarUrl: "",
  guidance,
}));

/** One JSON file per key of Data, with what a missing file starts as. */
/** @type {{ [K in keyof Data]: () => Data[K] }} */
const FILES = {
  creators: () => DEFAULT_CREATORS,
  items: () => [],
  favorites: () => [],
  settings: () => ({ onFavorite: "ask" }),
};
const KEYS = /** @type {(keyof Data)[]} */ (Object.keys(FILES));

/**
 * @param {string} file
 * @param {() => unknown} fallback
 */
async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(path.join(DIR, file), "utf8"));
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code !== "ENOENT") throw err;
    const value = fallback();
    await writeJson(file, value);
    return value;
  }
}

/**
 * @param {string} file
 * @param {unknown} value
 */
async function writeJson(file, value) {
  await fs.mkdir(DIR, { recursive: true });
  const target = path.join(DIR, file);
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + "\n");
  await fs.rename(tmp, target);
}

/** @returns {Promise<Data>} */
async function load() {
  const values = await Promise.all(KEYS.map((k) => readJson(`${k}.json`, FILES[k])));
  return /** @type {Data} */ (Object.fromEntries(KEYS.map((k, i) => [k, values[i]])));
}

/** @type {Promise<unknown>} */
let queue = Promise.resolve();

/**
 * @template T
 * @param {() => Promise<T>} job
 * @returns {Promise<T>}
 */
function enqueue(job) {
  const run = queue.then(job, job);
  queue = run.catch(() => {});
  return run;
}

/** A consistent snapshot of everything. */
export function read() {
  return enqueue(load);
}

/**
 * Apply a change. `fn` mutates the loaded data in place and may return a value;
 * only the files whose contents changed are written.
 * @template T
 * @param {(data: Data) => T | Promise<T>} fn
 * @returns {Promise<T>}
 */
export function mutate(fn) {
  return enqueue(async () => {
    const data = await load();
    const before = KEYS.map((k) => JSON.stringify(data[k]));
    const result = await fn(data);
    for (const [i, k] of KEYS.entries()) {
      if (JSON.stringify(data[k]) !== before[i]) await writeJson(`${k}.json`, data[k]);
    }
    return result;
  });
}
