# AI News

A local Next.js app that replaces a morning scroll through YouTube and X: one finite page of cards, each an entry point to something new in AI. Taste comes from a hand-picked list of YouTube creators and a short set of editorial guidelines; an agent (Anthropic API) does the searching.

- The spec is issue #1.
- `docs/reference/prototype.html` is the working prototype of the feed page. Open it in a browser; it is the look and behaviour to match.

## Run it

`pnpm install`, put `ANTHROPIC_API_KEY` in `.env.local` (see `.env.example`), `pnpm dev`. Data lives in `data/` (git-ignored). `pnpm test` runs the URL-parsing, feed-merge and display-order tests.

## Status

**Focus:** use the player window from daily browsing; #17 (now-playing highlight, next/previous, snap back) is next if it earns it. Otherwise the next issue in `gh issue list`. Story quality (prompts in `prompts/`) needs an issue first.

**Last shipped**
- Card dates read as an age while recent ("9 hours ago", "2 days ago", up to 28 days), then the date.
- Members-only videos are skipped everywhere the app finds videos (refresh, Creators page, searches); Settings has "Skip members-only content", on by default. Cards already in the feed are not touched.
- Player resumes (sidecar): switching videos and coming back picks each one up where this window left it; History is an always-showing column right of the video that keeps its order when you replay from it; its rows have a remove ×. Add creator is a green button in the bar. Positions live in sessionStorage beside History; the embed reports its time over postMessage, no YouTube script loaded.
- Creator videos come from the channel's Videos tab via youtubei.js (#18): YouTube's RSS feed stopped answering for most channels, so it only upgrades dates and descriptions when it does. Dates are day-accurate when it does not.
- Player window (#14): thumbnails play in our own `/player` page (one reused window, right half), with a bar for creator / Add creator, and a favorite star that follows settings and undoes its own removal, plus a History list that lives only as long as the window; Home and Favorites update live.
- Searches feel instant: the Creators magnifier and header search/refresh from any page go home at once and run there; searches show placeholders where results land (8 at top, 4 after a "more like this" card, also on Favorites) and new cards animate in.

**Up next**
- Open issues.
