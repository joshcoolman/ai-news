import { mutate } from "@/lib/store";
import { fail, json, type Ctx } from "@/lib/http";

/** Copy a feed card into Favorites. Idempotent. The copy drops feed-only state, so it stands on its own. */
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const found = await mutate((d) => {
    const item = d.items.find((i) => i.id === id);
    if (!item) return false;
    if (d.favorites.some((f) => f.item.id === id)) return true;
    const { batch, after, removedAt, hiddenBy, moreQuery, moreSeen, ...copy } = item;
    void [batch, after, removedAt, hiddenBy, moreQuery, moreSeen];
    d.favorites.push({ item: copy, favoritedAt: new Date().toISOString() });
    return true;
  });
  return found ? json({ ok: true }) : fail("No such card.", 404);
}
