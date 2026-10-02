# AI News

A local Next.js app that replaces a morning scroll through YouTube and X: one finite page of cards, each an entry point to something new in AI. Taste comes from a hand-picked list of YouTube creators and a short set of editorial guidelines; an agent (Anthropic API) does the searching.

- The spec is issue #1.
- `docs/reference/prototype.html` is the working prototype of the feed page. Open it in a browser; it is the look and behaviour to match.

## Run it

`pnpm install`, put `ANTHROPIC_API_KEY` in `.env.local` (see `.env.example`), `pnpm dev`. Data lives in `data/` (git-ignored). `pnpm test` runs the URL-parsing, feed-merge and display-order tests.

## Status

**Focus:** use the player window from daily browsing; "Later" in #14 (now-playing highlight, next/previous, snap back) is next if it earns it. Otherwise the next issue in `gh issue list`. Story quality (prompts in `prompts/`) needs an issue first.

**Last shipped**
- Player window (#14): thumbnails play in our own `/player` page (one reused window, right half), with a bar for creator / Add creator, and a favorite star that follows settings and undoes its own removal; Home and Favorites update live.
- Searches feel instant: the Creators magnifier and header search/refresh from any page go home at once and run there; searches show placeholders where results land (8 at top, 4 after a "more like this" card, also on Favorites) and new cards animate in.
- Creators page opens instantly: creators from the store, videos/topics/counts as same-size placeholders that fill in. Feeds cached for the day; the tab keeps the last result; reloading /creators fetches fresh.
- Creators page topic badges (`prompts/topics.md`): one small-model call groups the 28 days into named products, each badge its own colour; click to filter, combines with the creator sidebar.
- Header is icons only (home, favorites, creators | refresh, add creator, search | settings). Refresh, add and search work from every page; off home they report with a toast that links home (contract in `components/actions/store.ts`).
- Creators page: recent videos from your creators (5-28 day slider, default 7) with a creator sidebar, per-creator counts and a toggle filter; the magnifier on a video searches its topic on home.

**Up next**
- Open issues.
