import { mutate } from "@/lib/store";
import { grabRecent } from "@/lib/creators/grab";
import { refreshRunning } from "@/lib/refresh/run";
import { resolveCreator, UserInputError } from "@/lib/sources/youtube";
import { body, fail, json } from "@/lib/http";

export async function POST(req: Request) {
  const { url, guidance, grab } = await body<{ url: string; guidance: string; grab: boolean }>(req);
  if (typeof url !== "string" || !url.trim()) return fail("Paste a YouTube video or channel URL.", 400);
  let info;
  try {
    info = await resolveCreator(url);
  } catch (err) {
    if (err instanceof UserInputError) return fail(err.message, 400);
    console.error(err);
    return fail("Could not read that channel from YouTube.", 502);
  }
  const creator = { ...info, guidance: typeof guidance === "string" ? guidance.trim() : "" };
  const added = await mutate((d) => {
    if (d.creators.some((c) => c.channelId === info.channelId)) return false;
    d.creators.push(creator);
    return true;
  });
  // The quick grab claims the next batch number, so it waits out a running refresh (the next refresh picks the videos up).
  let grabbed: number | undefined;
  if (added && grab && !refreshRunning()) {
    try {
      grabbed = await grabRecent(creator);
    } catch (err) {
      console.error(err);
    }
  }
  return json({ added, creator: info, grabbed });
}
