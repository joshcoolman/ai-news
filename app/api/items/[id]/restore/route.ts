import { mutate } from "@/lib/store";
import { fail, json, type Ctx } from "@/lib/http";

/** Undo a removal: the player's star puts back a card its own favoriting removed. */
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const found = await mutate((d) => {
    const item = d.items.find((i) => i.id === id);
    if (!item) return false;
    delete item.removedAt;
    return true;
  });
  return found ? json({ ok: true }) : fail("No such card.", 404);
}
