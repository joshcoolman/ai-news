"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AddCreatorDialog } from "./AddCreatorDialog";
import { FEED_CHANGED_EVENT, REFRESH_EVENT, SEARCH_EVENT, handToHome, toast, useActions, type HomeTask } from "./store";

const ICON = { viewBox: "0 0 24 24", width: 18, height: 18, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

/** Refresh, add creator and search: on every page. On home they act on the feed in place; elsewhere refresh and search go home first. */
export function HeaderActions() {
  const home = usePathname() === "/";
  const router = useRouter();
  const { refreshing } = useActions();
  const [adding, setAdding] = useState(false);

  function goHome(task: HomeTask) {
    handToHome(task);
    router.push("/");
  }

  function refresh() {
    if (home) window.dispatchEvent(new Event(REFRESH_EVENT));
    else goHome({ kind: "refresh" });
  }

  function search(query: string) {
    if (home) window.dispatchEvent(new CustomEvent(SEARCH_EVENT, { detail: { query } }));
    else goHome({ kind: "search", query });
  }

  function added(result?: { name: string; grabbed?: number }) {
    setAdding(false);
    if (!result) return;
    router.refresh();
    const notice =
      result.grabbed === undefined
        ? `Added ${result.name}; their videos arrive with the next refresh`
        : `Added ${result.name}${result.grabbed ? ` and ${result.grabbed} recent ${result.grabbed === 1 ? "video" : "videos"}` : ", nothing recent to grab"}`;
    if (home) window.dispatchEvent(new CustomEvent(FEED_CHANGED_EVENT, { detail: { notice } }));
    else toast("done", `Added ${result.name}. Home page updated`);
  }

  return (
    <>
      <button
        className={`icon-btn${refreshing ? " spinning" : ""}`}
        type="button"
        onClick={refresh}
        disabled={refreshing}
        aria-label={refreshing ? "Refreshing" : "Refresh"}
        title={refreshing ? "Refreshing" : "Refresh"}
      >
        <svg {...ICON}>
          <path d="M20 12a8 8 0 0 1-13.7 5.6" />
          <path d="M4 12a8 8 0 0 1 13.7-5.6" />
          <path d="M18 3v4h-4" />
          <path d="M6 21v-4h4" />
        </svg>
      </button>
      <button className="icon-btn" type="button" onClick={() => setAdding(true)} aria-label="Add creator" title="Add creator">
        <svg {...ICON}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2.5 20c.5-3.6 3.2-5.5 6.5-5.5s6 1.9 6.5 5.5" />
          <path d="M19 8v6M16 11h6" />
        </svg>
      </button>
      <SearchPill onSearch={search} disabled={refreshing} />
      {adding && <AddCreatorDialog onClose={added} />}
    </>
  );
}

/** A magnifier button that opens in place into the search input. Enter runs the search and it folds back, cleared. */
function SearchPill({ onSearch, disabled }: { onSearch: (query: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    close();
    onSearch(q);
  }

  return (
    <form className={`search-pill${open ? " open" : ""}`} onSubmit={submit} role="search">
      <button
        className="icon-btn"
        type="button"
        onClick={() => (open ? input.current?.focus() : setOpen(true))}
        disabled={disabled}
        aria-label="Search YouTube, last month"
        title="Search YouTube, last month"
        tabIndex={open ? -1 : 0}
      >
        <svg {...ICON}>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M15.5 15.5 21 21" />
        </svg>
      </button>
      <input
        ref={input}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => !query.trim() && setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && close()}
        placeholder="Search YouTube, last month"
        aria-label="Search YouTube, last month"
        tabIndex={open ? 0 : -1}
      />
    </form>
  );
}
