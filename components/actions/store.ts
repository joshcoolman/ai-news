"use client";

import { useSyncExternalStore } from "react";

/*
  Header actions (refresh, add creator, search) work from every page. The home
  page owns the feed, so on home they hand off to it through window events.
  From another page, refresh and search go home and run there (handToHome);
  add creator works in place and says so with a toast (contract below).
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
type State = { refreshing: boolean; toast: Toast | null };

let state: State = { refreshing: false, toast: null };
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

/*
  Work another page hands to home. Home opens at once and runs it behind
  placeholders, rather than the other page waiting on it and then navigating.
*/
export type VideoSearch = { title: string; channel: string };
export type HomeTask = { kind: "refresh" } | { kind: "search"; query: string } | ({ kind: "video" } & VideoSearch);
let handoff: HomeTask | null = null;
export const handToHome = (task: HomeTask) => void (handoff = task);
export function takeHandoff(): HomeTask | null {
  const v = handoff;
  handoff = null;
  return v;
}
