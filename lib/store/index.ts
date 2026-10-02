import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Data } from "./types";

export type * from "./types";

/*
  All persistence goes through this module so a hosted version can swap the
  JSON files for a database. Every change is read-modify-write through one
  in-process queue on globalThis, so a refresh that runs for minutes cannot
  overwrite a removal made while it ran.
*/

const DIR = path.join(process.cwd(), "data");

const DEFAULT_CREATORS: Data["creators"] = [
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

const g = globalThis as typeof globalThis & { __storeQueue?: Promise<unknown> };

async function readJson<T>(file: string, fallback: () => T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(path.join(DIR, file), "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    const value = fallback();
    await writeJson(file, value);
    return value;
  }
}

async function writeJson(file: string, value: unknown) {
  await fs.mkdir(DIR, { recursive: true });
  const target = path.join(DIR, file);
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + "\n");
  await fs.rename(tmp, target);
}

/** One JSON file per key of Data, with what a missing file starts as. */
const FILES: { [K in keyof Data]: () => Data[K] } = {
  creators: () => DEFAULT_CREATORS,
  items: () => [],
  favorites: () => [],
  settings: () => ({ onFavorite: "ask" }),
};
const KEYS = Object.keys(FILES) as (keyof Data)[];

async function load(): Promise<Data> {
  const values = await Promise.all(KEYS.map((k) => readJson<unknown>(`${k}.json`, FILES[k])));
  return Object.fromEntries(KEYS.map((k, i) => [k, values[i]])) as unknown as Data;
}

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = (g.__storeQueue ?? Promise.resolve()).then(job, job);
  g.__storeQueue = run.catch(() => {});
  return run;
}

/** A consistent snapshot of everything. */
export function read(): Promise<Data> {
  return enqueue(load);
}

/**
 * Apply a change. `fn` mutates the loaded data in place and may return a value;
 * only the files whose contents changed are written.
 */
export function mutate<T>(fn: (data: Data) => T | Promise<T>): Promise<T> {
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
