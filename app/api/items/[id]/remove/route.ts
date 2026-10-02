import { mutate } from "@/lib/store";
import { fail, json, type Ctx } from "@/lib/http";

/** Remove a card. It stays stored with `removedAt`, so a later refresh never adds it back. */
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const found = await mutate((d) => {
    const item = d.items.find((i) => i.id === id);
    if (!item) return false;
    item.removedAt ??= new Date().toISOString();
    return true;
  });
  return found ? json({ ok: true }) : fail("No such card.", 404);
}
