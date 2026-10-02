import { refreshRunning } from "@/lib/refresh/run";
import { searchFromVideo } from "@/lib/search/run";
import { body, fail, json } from "@/lib/http";

/** Search from a video's topic (Creators page magnifier). Same refusal as /api/search while a refresh runs. */
export async function POST(req: Request) {
  const { title, channel } = await body<{ title: string; channel: string }>(req);
  if (typeof title !== "string" || !title.trim()) return fail("Missing video title.", 400);
  if (refreshRunning()) return fail("A refresh is running.", 409);
  try {
    return json(await searchFromVideo({ title, channel: typeof channel === "string" ? channel : "" }));
  } catch (err) {
    console.error(err);
    return fail("Search failed", 500);
  }
}
