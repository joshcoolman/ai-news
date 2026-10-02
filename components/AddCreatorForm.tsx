"use client";

import { useState } from "react";

/** Paste a video, Shorts, youtu.be, /@handle or /channel/UC… URL; optional guidance for that creator. */
export function AddCreatorForm({ onAdded, autoFocus }: { onAdded?: () => void; autoFocus?: boolean }) {
  const [url, setUrl] = useState("");
  const [guidance, setGuidance] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOk("");
    try {
      const res = await fetch("/api/creators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, guidance }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "Could not add that creator.");
      setOk(data.added ? `Added ${data.creator.name}.` : `${data.creator.name} is already listed.`);
      setUrl("");
      setGuidance("");
      onAdded?.();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="add-form" onSubmit={submit}>
      <input
        className="field url"
        placeholder="Paste a YouTube video or channel URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        aria-label="YouTube URL"
        autoFocus={autoFocus}
      />
      <input
        className="field guide"
        placeholder="Guidance (optional), e.g. only announcement videos"
        value={guidance}
        onChange={(e) => setGuidance(e.target.value)}
        aria-label="Guidance for this creator"
      />
      <button className="btn primary" type="submit" disabled={busy || !url.trim()}>
        {busy ? "Adding" : "Add creator"}
      </button>
      {error && <p className="error">{error}</p>}
      {ok && <p className="ok">{ok}</p>}
    </form>
  );
}
