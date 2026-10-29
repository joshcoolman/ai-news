import { mutate, read } from "../store.js";
import { channelXUrl } from "../youtube.js";

/*
  A creator's X link (#91): only the one their YouTube About page lists, never a
  guessed handle. Read once a creator, the first time the list is asked for
  after they are added (saved creators from before #91 included); a read that
  fails is tried again on the next ask. Deleting and re-adding reads it again.
*/

/** @type {Promise<Creator[]> | null} */
let reading = null;

/** The saved creators, every one's About links read. Asks running together share one read. */
export function creatorsWithLinks() {
  return (reading ??= readMissing().finally(() => (reading = null)));
}

async function readMissing() {
  const unread = (await read()).creators.filter((c) => !c.linksReadAt);
  if (!unread.length) return (await read()).creators;
  const found = await Promise.all(
    unread.map(async (c) => {
      try {
        return { channelId: c.channelId, xUrl: await channelXUrl(c.channelId) };
      } catch (err) {
        console.error(`[links] ${c.channelId}:`, err instanceof Error ? err.message : err);
        return null;
      }
    }),
  );
  const readAt = new Date().toISOString();
  return mutate((d) => {
    for (const f of found) {
      const c = f && d.creators.find((c) => c.channelId === f.channelId);
      if (!c) continue;
      c.linksReadAt = readAt;
      if (f.xUrl) c.xUrl = f.xUrl;
      else delete c.xUrl;
    }
    return d.creators;
  });
}
