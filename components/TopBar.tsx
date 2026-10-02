import Link from "next/link";

const PAGES = [
  { href: "/", name: "Feed", key: undefined },
  { href: "/favorites", name: "Favorites", key: "favorites" },
  { href: "/creators", name: "Creators", key: "creators" },
  { href: "/avoid", name: "Avoid", key: "avoid" },
  { href: "/settings", name: "Settings", key: "settings" },
] as const;

type Page = Exclude<(typeof PAGES)[number]["key"], undefined>;

/** Shared header: app name on the left, page links on the right, page-specific actions in between. */
export function TopBar({ current, children }: { current?: Page; children?: React.ReactNode }) {
  return (
    <header className="top">
      <h1>
        <Link href="/">AI News</Link>
      </h1>
      {children}
      <nav>
        {PAGES.map((p) => (
          <Link key={p.href} href={p.href} aria-current={p.key === current ? "page" : undefined}>
            {p.name}
          </Link>
        ))}
      </nav>
    </header>
  );
}
