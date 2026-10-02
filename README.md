# AI News

A local Next.js app that replaces a morning scroll through YouTube and X: one finite page of cards, each an entry point to something new in AI. Taste comes from a hand-picked list of YouTube creators and a short set of editorial guidelines; an agent (Anthropic API) does the searching.

- The spec is issue #1.
- `docs/reference/prototype.html` is the working prototype of the feed page. Open it in a browser; it is the look and behaviour to match.

## Run it

`pnpm install`, put `ANTHROPIC_API_KEY` in `.env.local` (see `.env.example`), `pnpm dev`. Data lives in `data/` (git-ignored). `pnpm test` runs the URL-parsing, feed-merge and display-order tests.

## Status

**Focus:** open issue #3 and do it on a new branch from `main`: restructure so the code speaks the app's language, with no behaviour change. After #3: tune story quality (the last run found only 3 stories, two citing news sites instead of maker pages).

**Last shipped**
- v1 merged to `main` (#1 and #2).
- Streaming refresh (#2): placeholders on click, creator slots resolve in about 1s, 4 parallel story lanes filling as each finishes, live activity line, stop button, summary with time and cost.
- Story lanes moved to Sonnet 5.5 with the plain search tools: Fable 5.1 ran 4 lanes one after another (6m12s, $8.58); Sonnet ran them in parallel (46s, $0.97).
- v1 of issue #1 works end to end; all 10 done-when checks pass.

**Up next**
- Open issues.
