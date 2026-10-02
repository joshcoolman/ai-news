"use client";

import { useSyncExternalStore } from "react";

/*
  Header actions (refresh, add creator, search) work from every page. The home
  page owns the feed, so on home they hand off to it through window events;
  anywhere else they do the work here and say so with a toast (contract below).
  State lives at module level so it survives navigating between pages.
*/

export const REFRESH_EVENT = "ainews:refresh";
export const SEARCH_EVENT = "ainews:search";
export const FEED_CHANGED_EVENT = "ainews:feed-changed";

/*
  One toast contract, so every message looks and behaves alike:
  - done:  something changed on home. Text ends "Home page updated" (or "refreshed"); clicking goes home.
  - info:  nothing changed, nothing to open ("Nothing new in the last month for X").
  - error: it did not work; its own colour, so it never reads as success.
  - busy:  still running; stays until the next toast replaces it.
  One at a time, newest replaces. done / info / error leave by themselves, and hovering holds them.
*/
export type ToastKind = "done" | "info" | "error" | "busy";
export type Toast = { id: number; kind: ToastKind; text: string };
type State = { refreshing: boolean; searching: boolean; toast: Toast | null };

let state: State = { refreshing: false, searching: false, toast: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const useActions = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );

/** The home page reports whether its refresh is running, so every page's button agrees. */
export const setRefreshing = (refreshing: boolean) => set({ refreshing });

let toastId = 0;
export const toast = (kind: ToastKind, text: string) => set({ toast: { id: ++toastId, kind, text } });
export const dismissToast = () => set({ toast: null });

const onHome = () => window.location.pathname === "/";

/** Start a refresh from another page and follow it to the end. */
export async function refreshElsewhere() {
  if (state.refreshing) return;
  set({ refreshing: true });
  try {
    const res = await fetch("/api/refresh", { method: "POST" });
    if (!res.ok && res.status !== 409) throw new Error();
  } catch {
    set({ refreshing: false });
    return toast("error", "Refresh failed to start");
  }
  const es = new EventSource("/api/refresh/events");
  es.onmessage = (msg) => {
    const e = JSON.parse(msg.data) as { type: string };
    if (e.type !== "done" && e.type !== "idle") return;
    es.close();
    set({ refreshing: false });
    if (!onHome()) toast("done", "Home page refreshed");
  };
  es.onerror = () => {
    es.close();
    set({ refreshing: false });
  };
}

/** Run a YouTube search from another page. Results land on home. */
export async function searchElsewhere(query: string) {
  if (state.searching || state.refreshing) return;
  set({ searching: true });
  toast("busy", `Searching for ${query}`);
  try {
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    if (!res.ok) toast("error", data.error ?? "Search failed");
    else if (!data.added) toast("info", data.message ?? "Nothing found");
    else toast("done", "Home page updated");
  } catch {
    toast("error", "Search failed");
  }
  set({ searching: false });
}
