import { read } from "@/lib/store";
import { topicsFor } from "@/lib/creators/topics";
import { fail, json } from "@/lib/http";

/** Topics across the Creators page's videos. Slow (a model call) the first time, so the page asks for it after it renders. */
export async function GET() {
  try {
    return json({ topics: await topicsFor((await read()).creators) });
  } catch (err) {
    console.error(err);
    return fail("Could not group topics.", 500);
  }
}
