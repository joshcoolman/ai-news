import type { HiddenCard } from "@/lib/feed/cards";

/** Videos the last refresh held back, each with why and a way to show it anyway. */
export function HiddenPanel({ hidden, onShow }: { hidden: HiddenCard[]; onShow: (id: string) => void }) {
  return (
    <details className="hidden-panel">
      <summary>{hidden.length} hidden</summary>
      <ul>
        {hidden.map((h) => (
          <li key={h.id}>
            <span>{h.title}</span>
            <span className="why">
              {h.channel} · {h.why}
            </span>
            <button className="link-btn" type="button" onClick={() => onShow(h.id)}>
              Show anyway
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
