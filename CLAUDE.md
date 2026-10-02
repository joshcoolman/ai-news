@AGENTS.md

## Rules

1. **The outside world goes through one module each:** YouTube `lib/sources/youtube/`, data `lib/store/`, models `lib/ai/`. Scraping breaks without notice; the store and the model provider are meant to be swappable.
2. **Every prompt is a file in `prompts/`,** loaded at call time by `lib/ai/prompts.ts`. Guidance is passed word for word, never rewritten into rules.
3. **Rules that could silently corrupt the feed stay pure and tested** (`lib/feed/rules.ts`, `lib/refresh/live.ts`).
4. **Server modules start with `import "server-only"`,** so a browser import is a build error, not a leaked API key. Browser code imports from them with `import type` only.
5. **Every write goes through `store.mutate`:** a refresh that runs for minutes must not overwrite a removal made while it ran.
6. **Names follow the UI's words.** Glossary:
   - **Card**: one tile in the feed, a video or a story.
   - **Batch**: the cards one refresh added; the newest batch carries the New tag.
   - **Held back**: a creator video that missed its creator's guidance. Stored so it is not re-judged, never shown, no panel.
   - **Favorite**: a copy of a card on the Favorites page; deleting it and deleting the feed card are independent.
   - **Guidance**: per-creator text saying which of their videos to keep.
   - **Lane**: one parallel story search (the progress line calls them "searches").
   - **Search**: the home-page box; a YouTube search of the last month whose first 8 unseen results land at the top as a new batch (meta line `Search: <query> ·`).
   - **More like this**: a YouTube search seeded by one card, its results placed after it.
   - **Player**: the one window thumbnails play in (`/player`, named `ainews-player`), with its bar: creator or Add creator, a favorite star that follows the on-favorite setting (unstar undoes its own removal). Never loads youtube.com itself: that wipes the window name and the next click opens a second window. It tells open pages what it changed over a BroadcastChannel.
