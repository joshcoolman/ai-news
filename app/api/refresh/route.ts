import { RefreshBusyError, startRefresh } from "@/lib/refresh/run";
import { fail, json } from "@/lib/http";

/** Start a refresh. Progress arrives on /api/refresh/events. */
export async function POST() {
  try {
    startRefresh();
    return json({ started: true });
  } catch (err) {
    if (err instanceof RefreshBusyError) return fail(err.message, 409);
    throw err;
  }
}
