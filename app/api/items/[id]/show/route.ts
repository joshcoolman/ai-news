import { mutate } from "@/lib/store";
import { fail, json, type Ctx } from "@/lib/http";

/** "Show anyway": put a held-back video into the feed. */
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const found = await mutate((d) => {
    const item = d.items.find((i) => i.id === id);
    if (!item) return false;
    delete item.hiddenBy;
    return true;
  });
  return found ? json({ ok: true }) : fail("No such card.", 404);
}
