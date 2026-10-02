import { mutate } from "@/lib/store";
import { json, type Ctx } from "@/lib/http";

/** Delete from Favorites only; the feed is untouched. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await mutate((d) => {
    d.favorites = d.favorites.filter((f) => f.item.id !== id);
  });
  return json({ ok: true });
}
