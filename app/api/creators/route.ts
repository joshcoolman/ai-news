import { mutate } from "@/lib/store";
import { resolveCreator, UserInputError } from "@/lib/sources/youtube";
import { body, fail, json } from "@/lib/http";

export async function POST(req: Request) {
  const { url, guidance } = await body<{ url: string; guidance: string }>(req);
  if (typeof url !== "string" || !url.trim()) return fail("Paste a YouTube video or channel URL.", 400);
  let info;
  try {
    info = await resolveCreator(url);
  } catch (err) {
    if (err instanceof UserInputError) return fail(err.message, 400);
    console.error(err);
    return fail("Could not read that channel from YouTube.", 502);
  }
  const added = await mutate((d) => {
    if (d.creators.some((c) => c.channelId === info.channelId)) return false;
    d.creators.push({ ...info, guidance: typeof guidance === "string" ? guidance.trim() : "" });
    return true;
  });
  return json({ added, creator: info });
}
