# AI News

A local Next.js app that replaces a morning scroll through YouTube and X: one finite page of cards, each an entry point to something new in AI. Taste comes from a hand-picked list of YouTube creators and a short set of editorial guidelines; an agent (Anthropic API) does the searching.

- The spec is issue #1.
- `docs/reference/prototype.html` is the working prototype of the feed page. Open it in a browser; it is the look and behaviour to match.

## Run it

`pnpm install`, put `ANTHROPIC_API_KEY` in `.env.local` (see `.env.example`), `pnpm dev`. Data lives in `data/` (git-ignored). `pnpm test` runs the URL-parsing, feed-merge and display-order tests.

## Status

**Focus:** tune story quality. Prompts are now files in `prompts/` (start with `stories.md` and `stories-lane.md`); judge changes against captured lane outputs, not one run. File an issue for it first if none exists.

**Last shipped**
- Favorites (#6): star copies a card to `/favorites` (popup offers delete-from-home; `/settings` holds the choice); "more like this" on a favorite adds to Favorites only.
- "More like this" queries are now the thing's name only, with a retry on the card label when a first search finds nothing.
- × now only removes the card; the "Why?" popup and its avoid-entry path are gone. Existing avoid entries still apply.
- Restructure (#3), no behaviour change: `prompts/` holds every prompt word for word; `lib/` split into `ai/`, `sources/youtube/`, `store/`, `feed/`, `refresh/`, `more-like-this/`; `Feed.tsx` split into `components/feed/*`.
- `server-only` on every server module: a browser import of `lib/store` now fails the build (verified).
- `CLAUDE.md` now carries the 6 rules and the glossary (a lane is one parallel story search).

**Up next**
- Open issues.
