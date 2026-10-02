import { moreLikeThis, NotFoundError } from "@/lib/more-like-this/run";
import { fail, json, type Ctx } from "@/lib/http";

/** "More like this" on a favorite: results go into Favorites only. */
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    return json(await moreLikeThis(id, "favorites"));
  } catch (err) {
    if (err instanceof NotFoundError) return fail("No such favorite.", 404);
    console.error(err);
    return fail("Search failed.", 500);
  }
}
