# AI News

A small web app that replaces a morning scroll through YouTube and X: one finite page of cards, each an entry point to something new in AI. Taste comes from a hand-picked list of YouTube creators and a short set of editorial guidelines; an agent (Anthropic API) does the searching.

It is also an experiment in building without frameworks (#21): a Node server and plain HTML, JS and CSS, with no runtime dependencies and no build step. `package.json`, `server.js` and `routes.js` are the three files to read first.

- The spec is issue #1.
- `docs/reference/prototype.html` is the working prototype of the feed page. Open it in a browser; it is the look and behaviour to match.

## Run it

Put `ANTHROPIC_API_KEY` and `YOUTUBE_API_KEY` in `.env.local` (see `.env.example`), then `node server.js` and open http://localhost:3000. Node 22.13 or newer; nothing to install. With no keys in the environment, the app asks for them in the browser and keeps them there.

- `pnpm dev` restarts the server when a file changes.
- `pnpm install` once, then `pnpm check` (types) and `pnpm test`. Both are for working on the code, not for running it.
- Data lives in `data/` (git-ignored); `DATA_DIR` moves it. `PORT` changes the port.
- Hosting (Railway): no Dockerfile; set the two keys or leave them out, and mount a volume at `DATA_DIR`. One instance only: refresh progress and the write queue live in memory.

## Status

**Focus:** use the rebuilt app day to day and note anything that behaves differently from before the rebuild (#21); fix those first. Then #17 (player follow-ups) if it earns it, otherwise the next issue in `gh issue list`. Story quality (prompts in `prompts/`) needs an issue first.

**Last shipped**
- Player power moves: shift-click a video on Home to queue it under the one playing (the card leaves Home); when a video ends, the next unwatched row plays by itself; the up and down arrows step through the History column, wrapping at both ends; Ctrl or Option with left and right jump between a video's chapters.
- No frameworks, no runtime dependencies, no build (#21): Next, React, zod, the Anthropic SDK and vitest are gone. `server.js` + `routes.js` + `server/` serve plain pages from `browser/`. Keys come from `.env.local`, or from the browser when the server has none (Add your keys; Delete keys in Settings). `pnpm check` and `pnpm test` are the gate.
- YouTube comes from the official Data API (#21 stage 1): `YOUTUBE_API_KEY` is now required. Creator lists have exact dates and full descriptions; `youtubei.js` and the RSS feed are gone. A search costs 100 of the day's 10,000 units, everything else 1.
- Card dates read as an age while recent ("9 hours ago", "2 days ago", up to 28 days), then the date.
- Members-only videos are skipped everywhere the app finds videos (refresh, Creators page, searches); Settings has "Skip members-only content", on by default. Cards already in the feed are not touched.
- Player resumes (sidecar): switching videos and coming back picks each one up where this window left it; History is an always-showing column right of the video that keeps its order when you replay from it; its rows have a remove ×. Add creator is a green button in the bar. Positions live in sessionStorage beside History; the embed reports its time over postMessage, no YouTube script loaded.

**Up next**
- Open issues.
