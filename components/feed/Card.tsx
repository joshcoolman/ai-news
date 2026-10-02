import type { Card as CardData } from "@/lib/feed/cards";

export function Card({
  card,
  note,
  searching,
  checking,
  arriving,
  onRemove,
  onMore,
  onFavorite,
}: {
  card: CardData;
  note?: string;
  searching?: boolean;
  checking?: boolean;
  arriving?: boolean;
  /** Absent on the Creators page, where cards are read-only. */
  onRemove?: () => void;
  onMore?: () => void;
  /** Feed only; Favorites has no star. */
  onFavorite?: () => void;
}) {
  return (
    <div className={`card${arriving ? " arrive" : ""}${checking ? " checking" : ""}`}>
      <div className="thumb" style={{ "--h": hue(card.id) } as React.CSSProperties}>
        {card.thumbUrl ? <img src={card.thumbUrl} alt="" loading="lazy" /> : <span>{card.label}</span>}
        <a
          className="hit"
          href={card.link}
          target="_blank"
          rel="noopener"
          onClick={(e) => {
            // A plain click on the thumbnail plays in the player window; modified clicks keep the browser's own behaviour.
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            openInPlayer(card.link);
          }}
          aria-label={`Open: ${card.title}`} />
        {card.isNew && <span className="new-tag">New</span>}
        {checking ? (
          <span className="card-note checking-note">Checking guidance</span>
        ) : (
          <>
            {onRemove && (
              <button className="remove" type="button" onClick={onRemove} aria-label={`Remove: ${card.title}`} title="Remove">
                &times;
              </button>
            )}
            {onFavorite && (
              <button
                className={`fav${card.favorited ? " on" : ""}`}
                type="button"
                onClick={onFavorite}
                disabled={card.favorited}
                aria-label={card.favorited ? `In favorites: ${card.title}` : `Favorite: ${card.title}`}
                title={card.favorited ? "In favorites" : "Favorite"}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill={card.favorited ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
                </svg>
              </button>
            )}
            {onMore && (
              <button
                className="more"
                type="button"
                onClick={onMore}
                disabled={searching}
                aria-label={`More like this: ${card.title}`}
                title="More like this"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <circle cx="10.5" cy="10.5" r="6.5" />
                  <path d="M15.5 15.5 21 21" />
                </svg>
              </button>
            )}
            {(searching || note) && <span className="card-note">{searching ? "Searching" : note}</span>}
          </>
        )}
        {card.duration && <span className="badge">{card.duration}</span>}
      </div>
      <div className="title">
        <a href={card.link} target="_blank" rel="noopener">
          {card.title}
        </a>
      </div>
      <div className="meta">{card.meta}</div>
    </div>
  );
}

/*
  One named window for watching: the first click opens it on the right half of
  the screen, later clicks load into it wherever you have put it (the browser
  ignores size and position for a window that already exists). No noopener: it
  would stop the name from finding the open window.
*/
function openInPlayer(link: string) {
  const s = screen as Screen & { availLeft?: number; availTop?: number };
  const width = Math.round(s.availWidth / 2);
  const left = (s.availLeft ?? 0) + s.availWidth - width;
  const features = `popup,left=${left},top=${s.availTop ?? 0},width=${width},height=${s.availHeight}`;
  window.open(link, "ainews-player", features)?.focus();
}

function hue(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
