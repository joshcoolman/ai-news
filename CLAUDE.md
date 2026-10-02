@AGENTS.md

## Rules

1. **The outside world goes through one module each:** YouTube `lib/sources/youtube/`, data `lib/store/`, models `lib/ai/`. Scraping breaks without notice; the store and the model provider are meant to be swappable.
2. **Every prompt is a file in `prompts/`,** loaded at call time by `lib/ai/prompts.ts`. Guidance and avoid entries are passed word for word, never rewritten into rules.
3. **Rules that could silently corrupt the feed stay pure and tested** (`lib/feed/rules.ts`, `lib/refresh/live.ts`).
4. **Server modules start with `import "server-only"`,** so a browser import is a build error, not a leaked API key. Browser code imports from them with `import type` only.
5. **Every write goes through `store.mutate`:** a refresh that runs for minutes must not overwrite a removal made while it ran.
6. **Names follow the UI's words.** Glossary:
   - **Card**: one tile in the feed, a video or a story.
   - **Batch**: the cards one refresh added; the newest batch carries the New tag.
   - **Hidden**: held back by guidance or an avoid entry; shown in the hidden panel with "Show anyway".
   - **Avoid entry**: something the reader does not want, from anyone; applies to creator videos and stories. No UI adds them now; existing ones still apply.
   - **Guidance**: per-creator text saying which of their videos to keep.
   - **Lane**: one parallel story search (the progress line calls them "searches").
   - **More like this**: a YouTube search seeded by one card, its results placed after it.
