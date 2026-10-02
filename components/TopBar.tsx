import Link from "next/link";

/** Shared header: app name on the left, page links on the right, page-specific actions in between. */
export function TopBar({ current, children }: { current?: "creators" | "avoid"; children?: React.ReactNode }) {
  return (
    <header className="top">
      <h1>
        <Link href="/">AI News</Link>
      </h1>
      {children}
      <nav>
        <Link href="/" aria-current={current ? undefined : "page"}>Feed</Link>
        <Link href="/creators" aria-current={current === "creators" ? "page" : undefined}>Creators</Link>
        <Link href="/avoid" aria-current={current === "avoid" ? "page" : undefined}>Avoid</Link>
      </nav>
    </header>
  );
}
