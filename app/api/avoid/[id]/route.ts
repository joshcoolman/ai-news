import { mutate } from "@/lib/store";
import { json, type Ctx } from "@/lib/http";

/** Stops the entry applying to later refreshes. Does not bring back what it already hid. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await mutate((d) => {
    d.avoid = d.avoid.filter((a) => a.id !== id);
  });
  return json({ ok: true });
}
