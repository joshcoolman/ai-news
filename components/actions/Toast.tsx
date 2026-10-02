"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { dismissToast, useActions } from "./store";

const SHOWN_MS = 7000;

/** The one toast (contract in store.ts). Leaves by itself unless busy or hovered; a done toast opens home on click. */
export function Toast() {
  const { toast } = useActions();
  const router = useRouter();
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!toast || toast.kind === "busy" || held) return;
    const timer = setTimeout(dismissToast, SHOWN_MS);
    return () => clearTimeout(timer);
  }, [toast, held]);
  if (!toast) return null;
  const hold = { onMouseEnter: () => setHeld(true), onMouseLeave: () => setHeld(false) };
  return (
    <div className="toast-wrap" role={toast.kind === "error" ? "alert" : "status"}>
      {toast.kind === "done" ? (
        <button
          key={toast.id}
          className="toast done"
          type="button"
          onClick={() => {
            dismissToast();
            router.push("/");
          }}
          {...hold}
        >
          {toast.text}
        </button>
      ) : (
        <div key={toast.id} className={`toast ${toast.kind}`} {...hold}>
          {toast.kind === "busy" && <span className="pulse" aria-hidden="true" />}
          {toast.text}
        </div>
      )}
    </div>
  );
}
