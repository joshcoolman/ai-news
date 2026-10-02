import { moreLikeThis, NotFoundError } from "@/lib/more";
import { fail, json, type Ctx } from "@/lib/http";

export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    return json(await moreLikeThis(id));
  } catch (err) {
    if (err instanceof NotFoundError) return fail("No such card.", 404);
    console.error(err);
    return fail("Search failed.", 500);
  }
}
