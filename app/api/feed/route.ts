import { read } from "@/lib/store";
import { buildFeed } from "@/lib/view";
import { refreshRunning } from "@/lib/refresh";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({ ...buildFeed(await read()), refresh: { running: refreshRunning() } });
}
