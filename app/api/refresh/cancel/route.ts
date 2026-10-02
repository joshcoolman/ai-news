import { cancelRefresh } from "@/lib/refresh/run";
import { json } from "@/lib/http";

/** Stop the story lanes that are still running. Everything already found is kept. */
export async function POST() {
  return json({ cancelled: cancelRefresh() });
}
