import { read } from "@/lib/store";
import { resolveCreator, UserInputError } from "@/lib/sources/youtube";
import { body, fail, json } from "@/lib/http";

/** Look up what a pasted URL points at, without adding anything. Feeds the "Found ..." line in the Add creator popup. */
export async function POST(req: Request) {
  const { url } = await body<{ url: string }>(req);
  if (typeof url !== "string" || !url.trim()) return fail("Paste a YouTube video or channel URL.", 400);
  try {
    const creator = await resolveCreator(url);
    const listed = (await read()).creators.some((c) => c.channelId === creator.channelId);
    return json({ creator, listed });
  } catch (err) {
    if (err instanceof UserInputError) return fail(err.message, 400);
    console.error(err);
    return fail("Could not read that channel from YouTube.", 502);
  }
}
