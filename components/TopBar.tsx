import Link from "next/link";
import { HeaderActions } from "./actions/HeaderActions";

type Page = "home" | "favorites" | "creators" | "settings";

/** Icon buttons, drawn on a 24px grid in the current text colour. */
const ICONS: Record<Page, React.ReactNode> = {
  home: <path d="M3.5 11 12 4l8.5 7M5.5 9.5V20h4.5v-5.5h4V20h4.5V9.5" />,
  favorites: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  creators: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
      <path d="M10 9.5v5l4.2-2.5z" fill="currentColor" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
};

const ICON_PAGES: { href: string; name: string; key: Page }[] = [
  { href: "/", name: "Home", key: "home" },
  { href: "/favorites", name: "Favorites", key: "favorites" },
  { href: "/creators", name: "Creators", key: "creators" },
  { href: "/settings", name: "Settings", key: "settings" },
];

const svg = (key: Page) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICONS[key]}
  </svg>
);

/**
 * Shared header: home, Favorites and Creators on the left, then a divider and
 * refresh / add creator / search (every page), Settings on the right.
 */
export function TopBar({ current = "home" }: { current?: Page }) {
  const link = (p: (typeof ICON_PAGES)[number]) => (
    <Link
      key={p.key}
      href={p.href}
      className="icon-btn"
      aria-label={p.name}
      title={p.name}
      aria-current={p.key === current ? "page" : undefined}
    >
      {svg(p.key)}
    </Link>
  );
  return (
    <header className="top">
      <nav>{ICON_PAGES.filter((p) => p.key !== "settings").map(link)}</nav>
      <span className="divider" aria-hidden="true" />
      <HeaderActions />
      <nav className="end">{ICON_PAGES.filter((p) => p.key === "settings").map(link)}</nav>
    </header>
  );
}
