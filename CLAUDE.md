## What this is

A Node server and plain HTML, JS and CSS, with no runtime dependencies and no build step. Every file runs exactly as written: `node server.js`. The reading path is `package.json`, `server.js`, `routes.js`.

## Rules

1. **The outside world goes through one module each:** YouTube `server/youtube.js`, data `server/store.js`, Claude `server/ai/client.js`. The YouTube module leans on two undocumented playlist ids (its header says which); the store and the model provider are meant to be swappable.
2. **Every prompt is a file in `prompts/`,** loaded at call time by `server/ai/prompts.js`. Guidance is passed word for word, never rewritten into rules.
3. **Rules that could silently corrupt the feed stay pure and tested** (`server/feed/rules.js`, `browser/feed/live.js`).
4. **The folder says where code runs.** Only `browser/` is ever served, so nothing in `server/` can reach a page. Neither side imports the other: shapes they share are in `types.d.ts`, numbers they share arrive in `/api/config`.
5. **Every write goes through `store.mutate`:** a refresh that runs for minutes must not overwrite a removal made while it ran.
6. **`dependencies` stays empty and nothing is compiled.** That is the experiment (#21). A new need is written here, in the open, or argued in an issue first. `typescript` and `@types/node` only check the code: `pnpm check` and `pnpm test` are the gate where another repo would run a production build.
7. **A page is one state object and a `draw` function.** Components are functions that return elements built with `h` (`browser/shared/dom.js`); an action changes the state and calls `draw`; lists go through `sync` so unchanged cards are not touched. Attach handlers through `h` or `addEventListener`, not `el.onkeydown = ...`: a property handler that returns false cancels the event, which once swallowed Enter in the search box.
8. **A shortcut is listed where the user can find it.** Keys and clicks that have no button are described in the guide on the Settings page (`GUIDE` in `browser/settings/settings.js`); adding or changing one means updating it there.
9. **Names follow the UI's words.** Glossary:
   - **Card**: one tile in the feed, a video or a story.
   - **Batch**: the cards one refresh added; the newest batch carries the New tag.
   - **Held back**: a creator video that missed its creator's guidance. Stored so it is not re-judged, never shown, no panel.
   - **Favorite**: a copy of a card on the Favorites page; deleting it and deleting the feed card are independent.
   - **Guidance**: per-creator text saying which of their videos to keep.
   - **Lane**: one parallel story search (the progress line calls them "searches").
   - **Search**: the home-page box; a YouTube search of the last month whose first 8 unseen results land at the top as a new batch (meta line `Search: <query> ·`).
   - **More like this**: a YouTube search seeded by one card, its results placed after it.
   - **Members only**: a video only a channel's paying members can play. Left out of everything the app finds (refresh, Creators page, searches) unless Settings turns that off; the one rule is `playable` in `server/feed/rules.js`.
   - **Player** (Josh says "sidecar"): the one window thumbnails play in (`/player`, named `ainews-player`), with its bar: creator or a green Add creator, a favorite star that follows the on-favorite setting (unstar undoes its own removal), and a History column right of the video, always showing, of what this window has played and what is queued (a new video joins at the top, replaying one keeps the order; each row has a remove ×; removing the one playing moves to the next). Coming back to a video picks it up where this window left it. History and positions are sessionStorage, gone when the window closes. Never loads youtube.com itself: that wipes the window name and the next click opens a second window. It tells open pages what it changed over a BroadcastChannel.
   - **Queue**: shift-click a video on Home while the Player is playing. The card leaves Home for good and the video lands in History right under the one playing; when a video ends, the Player starts the next row not yet watched to the end (`browser/player/queue.js`). No setting, no button. With no Player playing, the click does nothing.
   - **Player keys**: bare arrows, in the Player (`browser/player/player.js`). Up and down play the row above or below in History, wrapping at both ends. Left and right skip 10 seconds back or forward.
   - **Picked creator**: the creator chosen in the Creators sidebar, outlined in green; the grid shows only their videos. While one is picked, up and down move the pick through the list, wrapping; with none picked the arrows do nothing. Clicking it again, or empty page, drops the pick (`browser/creators/creators.js`).
   - **Chapters**: a button in the Player's bar (and the C key), shown only when the video's description lists chapters. It opens a list over the History column; picking one jumps there and the list stays open until ×, Escape or a click elsewhere; while it is open, up and down walk the chapters instead of the videos (`browser/player/chapters.js`, `parseChapters` in `server/youtube-parse.js`).
   - **Add your keys**: the first screen when the server has no keys of its own (`browser/shared/keys.js`). Keys live in this browser's local storage and ride each request as headers; Settings has Delete keys.
