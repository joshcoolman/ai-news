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

**Focus:** judge the first chapters-as-signal refresh (#36). Home was emptied on 2026-10-15 for it; run Refresh and look at three things: how many names came back (cap is 30), how many are "no source yet" and whether those are real things, and whether repos and announcements still link to the real page. Tune `prompts/extract-names.md` (what counts as a name) and `prompts/define.md` (how hard to look) from what you see. The cap (`MAX_NAMES`) is the cost knob.

**Last shipped**
- Creators keyboard (#56, #58): Left from the sidebar highlights the video beside the picked creator's row (nearest on screen, no jump), arrows walk the grid, Right off the edge or Escape goes back to the creator list, Enter queues, plays, or unqueues. Rules in `browser/feed/pick.js`.
- Creators: a picked creator shows their latest 30 videos whatever the day slider says, label Latest 30, topic chips hidden (#54). Zero extra YouTube quota: the server already had the lists.
- Favorites: a click plays or queues, the card stays and says Playing or Queued (#52). Same as Creators, and the favorite is untouched. Both pages now read the Queued mark from the Player's History in localStorage (`browser/shared/history-link.js`), so the Player's own × and Delete, and rows queued before the page opened, count.
- Home keyboard triage (#50): arrows move a green highlight through the grid, Enter on a topic is its More like this and × (results land where it was), Enter on a video queues or plays it, Delete is its ×. The highlight moves to the next card, the first from the last. Listed in the Settings guide; rules in `browser/feed/pick.js`.
- Home click queues, History is kept, Earlier divider (#46, #47, #48). A plain click on a Home video queues it under the one playing, or plays it when nothing is, and the card leaves either way; shift-click on Home is gone. History, finished marks and positions are localStorage: a row leaves only by its ×, no cap. Each opening of the Player is a session, and an "Earlier" line sits above the rows a previous one left.
- Creators: a click queues while the Player is playing (#38). The first click plays; after that each click puts the video right under the one playing and the card says Queued. The Player now announces "playing" and "closed", and answers a page's "ping", so pages know.

**Up next**
- Open issues.
