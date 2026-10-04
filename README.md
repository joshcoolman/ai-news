# AI News

A local Next.js app that replaces a morning scroll through YouTube and X: one finite page of cards, each an entry point to something new in AI. Taste comes from a hand-picked list of YouTube creators and a short set of editorial guidelines; an agent (Anthropic API) does the searching.

- The spec is issue #1.
- `docs/reference/prototype.html` is the working prototype of the feed page. Open it in a browser; it is the look and behaviour to match.

## Run it

`pnpm install`, put `ANTHROPIC_API_KEY` and `YOUTUBE_API_KEY` in `.env.local` (see `.env.example`), `pnpm dev`. Data lives in `data/` (git-ignored). `pnpm test` runs the URL-parsing, feed-merge and display-order tests.

## Status

**Focus:** open #21 and build its stage 2: `server.js`, `routes.js` and `server/` beside the Next app, answering the same API in plain `.js` checked against `types.d.ts`. Stage 1 (YouTube Data API) is done; stage 3 (the pages, then the cut-over) follows. #21 is the spec; #17 (player follow-ups) waits until after.

**Last shipped**
- YouTube comes from the official Data API (#21 stage 1): `YOUTUBE_API_KEY` is now required. Creator lists have exact dates and full descriptions; `youtubei.js` and the RSS feed are gone. A search costs 100 of the day's 10,000 units, everything else 1.
- Card dates read as an age while recent ("9 hours ago", "2 days ago", up to 28 days), then the date.
- Members-only videos are skipped everywhere the app finds videos (refresh, Creators page, searches); Settings has "Skip members-only content", on by default. Cards already in the feed are not touched.
- Player resumes (sidecar): switching videos and coming back picks each one up where this window left it; History is an always-showing column right of the video that keeps its order when you replay from it; its rows have a remove ×. Add creator is a green button in the bar. Positions live in sessionStorage beside History; the embed reports its time over postMessage, no YouTube script loaded.
- Player window (#14): thumbnails play in our own `/player` page (one reused window, right half), with a bar for creator / Add creator, and a favorite star that follows settings and undoes its own removal, plus a History list that lives only as long as the window; Home and Favorites update live.
- Searches feel instant: the Creators magnifier and header search/refresh from any page go home at once and run there; searches show placeholders where results land (8 at top, 4 after a "more like this" card, also on Favorites) and new cards animate in.

**Up next**
- Open issues.
