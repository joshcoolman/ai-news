"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shown after favoriting when the setting is "ask". Escape counts as Cancel.
 * With "Don't ask again" ticked, the choice becomes the setting.
 */
export function FavoritePrompt({ title, onDone }: { title: string; onDone: (removeFromHome: boolean, dontAsk: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [dontAsk, setDontAsk] = useState(false);
  useEffect(() => ref.current?.showModal(), []);
  return (
    <dialog ref={ref} className="prompt" onCancel={() => onDone(false, dontAsk)}>
      <p>
        Saved <b>{title}</b> to favorites. Delete from home?
      </p>
      <label className="check">
        <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} />
        Don&apos;t ask again
      </label>
      <div className="prompt-actions">
        <button className="btn" type="button" onClick={() => onDone(false, dontAsk)}>
          Cancel
        </button>
        <button className="btn primary" type="button" autoFocus onClick={() => onDone(true, dontAsk)}>
          Yes
        </button>
      </div>
    </dialog>
  );
}
