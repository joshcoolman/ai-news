import { subscribe } from "@/lib/refresh";
import type { RefreshEvent } from "@/lib/refresh-events";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events for the running refresh: the whole log so far, then each
 * new event, closing after "done". Sends a lone "idle" event when nothing runs.
 */
export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        controller.close();
      };
      const send = (e: RefreshEvent | { type: "idle" }) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        if (e.type === "done" || e.type === "idle") queueMicrotask(close);
      };
      unsubscribe = subscribe(send);
      if (!unsubscribe) send({ type: "idle" });
      req.signal.addEventListener("abort", close);
    },
    cancel() {
      unsubscribe?.();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
