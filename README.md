# AI News

A small web app that replaces a morning scroll through YouTube and X: one finite page of cards, each an entry point to something new in AI. Taste comes from a hand-picked list of YouTube creators and a short set of editorial guidelines; an agent (Anthropic API) does the searching.

It is also an experiment in building without frameworks (#21): a Node server and plain HTML, JS and CSS, with no runtime dependencies and no build step. `package.json`, `server.js` and `routes.js` are the three files to read first.

![The Creators page: recent videos from the creators you follow, grouped by topic](docs/screenshots/creators.png)

- The spec is issue #1.
- `docs/reference/prototype.html` is the working prototype of the feed page. Open it in a browser; it is the look and behaviour to match.

## Run it

Put `ANTHROPIC_API_KEY` and `YOUTUBE_API_KEY` in `.env.local` (see `.env.example`), then `node server.js` and open http://localhost:3000. Node 22.13 or newer; nothing to install. With no keys in the environment, the app asks for them in the browser and keeps them there.

- `pnpm dev` restarts the server when a file changes.
- `pnpm install` once, then `pnpm check` (types) and `pnpm test`. Both are for working on the code, not for running it.
- Data lives in `data/` (git-ignored); `DATA_DIR` moves it. `PORT` changes the port.
- Hosting (Railway): no Dockerfile; set the two keys or leave them out, and mount a volume at `DATA_DIR`. One instance only: refresh progress and the write queue live in memory.

## How TypeScript is used

Every file is plain JavaScript and runs exactly as written, in Node and in the browser. TypeScript never compiles anything here; it only reads the code and reports mistakes.

- **The shapes live in `types.d.ts`** (`Card`, `Creator`, `Settings` and the rest), written in ordinary TypeScript. They are global, so no file imports them.
- **A `.js` file points at a shape in a comment**, such as `@param {Card} card`. Most other types are inferred.
- **`pnpm check` runs the checker** over `server/`, `browser/` and `test/` (settings in `jsconfig.json`). Editors that understand TypeScript show the same errors as you type.
- **`typescript` and `@types/node` are the only packages**, and only the check needs them. Running the app needs neither.

## Status

**Focus:** judge the first topic-only refresh (#33). Home was emptied on 2026-10-15 for it; run Refresh, then compare the names that came back against the Creators page's Topics chips and its titles. Tune `prompts/extract-names.md` (what counts as a name) and `prompts/define.md` (when to return nothing) from what you see, not from the prompt text. If it works, the follow-up is More like this on a story card seeding a YouTube search from its label and source.

**Last shipped**
- Home is topic cards only (#33): a refresh reads the week's creator titles for the named things they are about, searches each name for its maker's page, and adds a story per name that has one. Videos, the guidance filter, held-back videos and the quick grab on Add creator are gone from Home; the Creators page is unchanged. A video reaches Home only through a search.
- Home, Favorites and Creators fill the viewport (#34).
- Sidecar History is a fixed-center carousel (#30): the playing row sits at the column's middle, larger than the rest, and up and down slide the list under it, stopping at the ends. Delete (or Backspace) removes the playing video and moves on to the one below.
- Sidecar and Creators power moves, all listed in the guide on the Settings page: shift-click on Home queues a video under the one playing; a finished video starts the next unfinished row; up and down switch videos, left and right skip 10 seconds; a Chapters button (and C) lists chapters over History, with up and down walking them; on Creators, up and down cycle the picked creator.
- Cheaper story search: each search caches what it read, so each step re-reads earlier results at a tenth of the price, and a fetched page is capped at 8,000 tokens. The server log line `[stories]` shows the cached and uncached cost after every refresh.
- No frameworks, no runtime dependencies, no build (#21): `server.js` + `routes.js` + `server/` serve plain pages from `browser/`. Keys come from `.env.local`, or from the browser when the server has none. `pnpm check` and `pnpm test` are the gate.

**Up next**
- Open issues.
