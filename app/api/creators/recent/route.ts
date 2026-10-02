import { read } from "@/lib/store";
import { recentVideos } from "@/lib/creators/recent";
import { fail, json } from "@/lib/http";

/** The Creators page's videos. Feeds are cached for the day; `?fresh=1` (a reload of the page) reads them again. */
export async function GET(req: Request) {
  try {
    const fresh = new URL(req.url).searchParams.has("fresh");
    return json(await recentVideos((await read()).creators, fresh));
  } catch (err) {
    console.error(err);
    return fail("Could not read creator feeds.", 500);
  }
}
