import { read } from "@/lib/store";
import { buildFeed } from "@/lib/feed/cards";
import { refreshRunning } from "@/lib/refresh/run";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({ ...buildFeed(await read()), refresh: { running: refreshRunning() } });
}
