import { refreshRunning } from "@/lib/refresh/run";
import { searchHome } from "@/lib/search/run";
import { body, fail, json } from "@/lib/http";

/** Search YouTube from home. Refused while a refresh runs: both claim the next batch number. */
export async function POST(req: Request) {
  const { query } = await body<{ query: string }>(req);
  const q = typeof query === "string" ? query.trim() : "";
  if (!q) return fail("Type something to search for.", 400);
  if (refreshRunning()) return fail("A refresh is running.", 409);
  try {
    return json(await searchHome(q));
  } catch (err) {
    console.error(err);
    return fail("Search failed", 500);
  }
}
