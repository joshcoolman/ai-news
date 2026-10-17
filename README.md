# AI News

Personal software: YouTube's subscriptions and Watch Later without the noise. A Creators page of the latest videos from a hand-picked list of channels, a Player beside it with a queue, and Favorites. Everything on it is two weeks old at most.

It is also an experiment in building without frameworks (#21): a Node server and plain HTML, JS and CSS, with no runtime dependencies and no build step. `package.json`, `server.js` and `routes.js` are the three files to read first.

![The Creators page: recent videos from the creators you follow](docs/screenshots/creators.png)

## Run it

Put `YOUTUBE_API_KEY` in `.env.local` (see `.env.example`), then `node server.js` and open http://localhost:3000. Node 22.13 or newer; nothing to install. With no key in the environment, the app asks for it in the browser and keeps it there.

- `pnpm dev` restarts the server when a file changes.
- `pnpm install` once, then `pnpm check` (types) and `pnpm test`. Both are for working on the code, not for running it.
- Data lives in `data/` (git-ignored); `DATA_DIR` moves it. `PORT` changes the port.
- Hosting (Railway): no Dockerfile; set the key or leave it out, and mount a volume at `DATA_DIR`. One instance only: the write queue lives in memory.

## YouTube quota

The free Data API quota is 10,000 units a day and every call the app makes costs 1. Each creator's list costs 2 and is read at most twice a day (`LIST_TTL_HOURS` in `server/creators/recent.js`); video lengths and chapters are read once ever. All of it is kept in `data/cache.json`, so a restart or a reload costs nothing. The server logs `[youtube] <call>: N units today` on every call, so when the quota runs out the log says what spent it.

## How TypeScript is used

Every file is plain JavaScript and runs exactly as written, in Node and in the browser. TypeScript never compiles anything here; it only reads the code and reports mistakes.

- **The shapes live in `types.d.ts`** (`Card`, `Creator`, `Settings` and the rest), written in ordinary TypeScript. They are global, so no file imports them.
- **A `.js` file points at a shape in a comment**, such as `@param {Card} card`. Most other types are inferred.
- **`pnpm check` runs the checker** over `server/`, `browser/` and `test/` (settings in `jsconfig.json`). Editors that understand TypeScript show the same errors as you type.
- **`typescript` and `@types/node` are the only packages**, and only the check needs them. Running the app needs neither.

## Status

**Focus:** live with the simplified app (#68) for a month before adding anything. The one candidate in the box is a Sync button against the YouTube account (noted on #68); it needs an OAuth client and is worth building only if it is still missed in mid-November.

**Last shipped**
- The app is Creators, the Player and Favorites (#68): Home, Refresh, stories, every search and every model call are gone, and with them the Anthropic key. The Creators window is 3 to 14 days. `/` is the one-window app with Creators on the left.
- YouTube optimization (#67): creator lists are read at most twice a day, lengths and chapters once ever, all kept in `data/cache.json` across restarts; the status line on Creators says when the lists were read; the server log counts the day's units.
- One window: `/` with the app and the Player in two frames (#60).
- Creators keyboard (#56, #58): Left from the sidebar highlights the video beside the picked creator's row, arrows walk the grid, Right off the edge or Escape goes back to the creator list, Enter queues, plays, or unqueues.
- Creators: a picked creator shows their latest 30 videos whatever the day slider says (#54).
- Favorites: a click plays or queues, the card stays and says Playing or Queued (#52).

**Up next**
- Open issues.
