import { randomUUID } from "node:crypto";
import { mutate } from "@/lib/store";
import { body, fail, json, type Ctx } from "@/lib/http";

/**
 * Remove a card. Called once on ×, and again with `reason` if the owner gives
 * one; only a stated reason goes on the avoid list.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const { reason } = await body<{ reason: string }>(req);
  const text = typeof reason === "string" ? reason.trim() : "";
  const found = await mutate((d) => {
    const item = d.items.find((i) => i.id === id);
    if (!item) return false;
    item.removedAt ??= new Date().toISOString();
    if (text && !item.reason) {
      item.reason = text;
      d.avoid.push({ id: randomUUID(), reason: text, fromItemId: item.id, fromTitle: item.title, addedAt: new Date().toISOString() });
    }
    return true;
  });
  return found ? json({ ok: true }) : fail("No such card.", 404);
}
