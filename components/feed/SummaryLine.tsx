import type { Summary } from "@/lib/refresh/live";
import { clock, plural } from "./format";

/** What the last refresh did, shown once it ends. */
export function SummaryLine({ s }: { s: Summary }) {
  const added = [s.videos && plural(s.videos, "video"), s.stories && plural(s.stories, "story", "stories")].filter(Boolean);
  const head = added.length ? `Added ${added.join(" and ")}` : "Nothing new since the last refresh";
  const tail = [
    s.cancelled && "stopped early",
    s.hidden && `${s.hidden} hidden`,
    s.failed.length && `could not fetch ${s.failed.join(", ")}`,
    s.error && "something failed; see the server log",
  ].filter(Boolean);
  return (
    <>
      <b>{head}.</b> {clock(s.seconds)} · ${s.usd.toFixed(2)}
      {tail.length > 0 && ` · ${tail.join(" · ")}`}
    </>
  );
}
