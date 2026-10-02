import { favoriteVideo } from "@/lib/player/video";
import { body, fail, json } from "@/lib/http";

/** Favorite the video playing in the player window, by video id (Creators-page videos have no card). */
export async function POST(req: Request) {
  const { videoId } = await body<{ videoId: string }>(req);
  if (typeof videoId !== "string" || !videoId) return fail("Missing video id.", 400);
  return (await favoriteVideo(videoId)) ? json({ ok: true }) : fail("No such video.", 404);
}
