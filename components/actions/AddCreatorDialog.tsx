"use client";

import { useEffect, useRef, useState } from "react";

type Found = { name: string; avatarUrl: string; listed: boolean };

/**
 * Add a creator from home. Paste a URL and the dialog says who it found; Add
 * then saves the creator and grabs their recent videos into the feed.
 */
export function AddCreatorDialog({ onClose }: { onClose: (result?: { name: string; grabbed?: number }) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState("");
  const [guidance, setGuidance] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => ref.current?.showModal(), []);

  // Look the URL up shortly after typing or pasting stops.
  useEffect(() => {
    setFound(null);
    setError("");
    if (!url.trim()) return;
    let stale = false;
    setLooking(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/creators/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (stale) return;
        if (!res.ok) setError(data.error ?? "Could not read that URL.");
        else setFound({ ...data.creator, listed: data.listed });
      } catch {
        if (!stale) setError("Could not reach the server.");
      }
      if (!stale) setLooking(false);
    }, 450);
    return () => {
      stale = true;
      clearTimeout(timer);
      setLooking(false);
    };
  }, [url]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!found || found.listed || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/creators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, guidance, grab: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not add that creator.");
        setBusy(false);
        return;
      }
      onClose({ name: data.creator.name, grabbed: data.grabbed });
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="prompt add-dialog" onClose={() => onClose()} onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <form onSubmit={add}>
        <h2>Add creator</h2>
        <input
          className="field"
          placeholder="Paste a YouTube video or channel URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-label="YouTube URL"
          autoFocus
        />
        <p className="found" role="status">
          {looking ? (
            "Looking"
          ) : error ? (
            <span className="error">{error}</span>
          ) : found ? (
            <>
              {found.avatarUrl && <img className="avatar" src={found.avatarUrl} alt="" referrerPolicy="no-referrer" />}
              <span>{found.listed ? `${found.name} is already listed` : `Found ${found.name}`}</span>
            </>
          ) : null}
        </p>
        <input
          className="field"
          placeholder="Guidance (optional), e.g. only announcement videos"
          value={guidance}
          onChange={(e) => setGuidance(e.target.value)}
          aria-label="Guidance for this creator"
        />
        <div className="prompt-actions">
          <button className="btn" type="button" onClick={() => ref.current?.close()}>
            Cancel
          </button>
          <button className="btn primary" type="submit" disabled={!found || found.listed || busy}>
            {busy ? "Adding" : "Add"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
