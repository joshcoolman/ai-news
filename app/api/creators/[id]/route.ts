import { mutate } from "@/lib/store";
import { body, fail, json, type Ctx } from "@/lib/http";

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const { guidance } = await body<{ guidance: string }>(req);
  if (typeof guidance !== "string") return fail("guidance is required.", 400);
  const found = await mutate((d) => {
    const c = d.creators.find((x) => x.channelId === id);
    if (c) c.guidance = guidance.trim();
    return !!c;
  });
  return found ? json({ ok: true }) : fail("No such creator.", 404);
}

/** Stops future fetches. Their existing cards stay in the feed. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await mutate((d) => {
    d.creators = d.creators.filter((c) => c.channelId !== id);
  });
  return json({ ok: true });
}
