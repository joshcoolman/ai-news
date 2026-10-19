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

The free Data API quota is 10,000 units a day and every call the app makes costs 1. Each creator's list costs 2 and is read at most twice a day (`LIST_TTL_HOURS` in `server/creators/recent.js`); video lengths are read once ever, and chapters are parsed from the descriptions the lists already carry (a video found in no list costs one unit, once). All of it is kept in `data/cache.json`, so a restart or a reload costs nothing. The server logs `[youtube] <call>: N units today` on every call, so when the quota runs out the log says what spent it.

## How TypeScript is used

Every file is plain JavaScript and runs exactly as written, in Node and in the browser. TypeScript never compiles anything here; it only reads the code and reports mistakes.

- **The shapes live in `types.d.ts`** (`Card`, `Creator`, `Settings` and the rest), written in ordinary TypeScript. They are global, so no file imports them.
- **A `.js` file points at a shape in a comment**, such as `@param {Card} card`. Most other types are inferred.
- **`pnpm check` runs the checker** over `server/`, `browser/` and `test/` (settings in `jsconfig.json`). Editors that understand TypeScript show the same errors as you type.
- **`typescript` and `@types/node` are the only packages**, and only the check needs them. Running the app needs neither.

## Status

**Focus:** #17 (Player: now-playing highlight, next/previous, snap back) is the only open issue; check it is still wanted before building it, much of it may have shipped since.

**Last shipped**
- Keyboard across the one window (#74): Shift+Left/Right moves the keyboard between halves and green marks show only in the half that has it; the video never takes the keyboard (click pauses, F or double-click fills the display from either half, other keys blocked while full); C on Creators toggles the first creator; Favorites gets the arrow highlight; the Player hiding hands the keyboard left. Cards no longer show the chapters C; History rows still do.
- Creators fits a narrow frame: thumbnails stay beside the list, shrinking to no fewer than two columns; under 640px the list is avatars only; the per-creator counts are gone, a creator with nothing in the window is still grayed.
- One window (#72): an empty History hides the Player, a Player button in the top bar shows or hides it (hidden stays hidden), the top bar is fixed, the rail drags the split and remembers it.
- Chapters: a green C on History thumbnails whose description lists chapters, parsed from the cached lists at no YouTube cost (#70, #71). The playing History row ignores clicks.
- The app is Creators, the Player and Favorites (#68): Home, Refresh, stories, every search and every model call are gone, and with them the Anthropic key. The Creators window is 3 to 14 days. `/` is the one-window app with Creators on the left.
- YouTube optimization (#67): creator lists are read at most twice a day, lengths and chapters once ever, all kept in `data/cache.json` across restarts; the status line on Creators says when the lists were read; the server log counts the day's units.

**Up next**
- Open issues.
