# Relevant xkcd

Relevant xkcd is a web-first search and sharing tool for finding the xkcd comic
that fits a conversation.

The product goal is simple:

> If I remember the concept, can I find the comic I want to send?

The first version should be a static web app with a fast search box, ranked
results, comic detail, and a copy-link action. Direct iMessage integration is
out of scope until search quality is useful.

## Current State

This repo currently contains rough corpus tooling:

- `fetcher.py` downloads xkcd metadata and explainxkcd wiki pages into
  `raw_data/`.
- `collater.py` sketches a normalized comic record from those raw files.
- `raw_data/` and `processed_data/` are local/generated data and are ignored by
  git.

The local corpus is useful prior work, but the scripts are not the target
architecture. See `SPEC.md` for the implementation plan.

## MVP Direction

- Build a Vite + React + TypeScript static app.
- Generate a minimized search index from local corpus data.
- Keep search client-side unless measured relevance, index size, or latency
  proves that a server/API is needed.
- Display xkcd images from their remote image URLs (or iframes).
- Share by copying the canonical `https://xkcd.com/<num>/` link for MVP.
- Attribute xkcd and link back to canonical comic pages.

Static search is the first implementation target, not a permanent constraint.
If a tested lexical baseline cannot find the right comic often enough, a search
API, offline embeddings, or a hosted vector database can be revisited with an
explicit maintenance and deployment tradeoff.

## Development

Install dependencies:

```sh
npm install
```

Run tests:

```sh
npm test
```

Run the full local verification path:

```sh
npm run verify
```

Check local corpus status without network:

```sh
npm run corpus:status -- --offline
```

Check local corpus status against the current xkcd API:

```sh
npm run corpus:status
```

Fetch missing recent comics with respectful, resumable requests:

```sh
npm run corpus:fetch -- --recent
```

Fetch an explicit bounded range:

```sh
npm run corpus:fetch -- --range 3025-3035
```

Build the static app:

```sh
npm run build
```

Generate the public search index:

```sh
npm run generate:index
```

The generator uses `raw_data/xkcd` when the local corpus is present. If the raw
corpus is absent but `public/search-index.json` already exists, it keeps that
checked-in public index. If neither exists, it falls back to the committed
fixture set in `fixtures/xkcd`.

Corpus fetch commands are foreground-only and safe to interrupt. They write
ignored progress logs under `raw_data/runs/`, update `raw_data/manifest.json`,
and skip files that already exist unless `--refresh` is passed. Fetching is
single-threaded by default and waits at least 1500 ms between requests to the
same source.

## Corpus Policy

Do not commit the full raw corpus by default.

Recommended approach:

- keep `raw_data/` ignored as local source snapshots
- commit a small fixture set for tests
- commit/publish only the generated app assets and the minimized public search
  index
- keep explainxkcd-derived fields provenance-aware and attributed when included
  in the public index

The full raw corpus is around tens of megabytes and changes over time. Keeping
it out of git avoids noisy vendor-data churn and reduces the chance of
accidentally redistributing source text without the correct attribution/license
surface.

## Licensing

Original project code is MIT licensed. See `LICENSE.md`.

This does not relicense third-party content or generated data derived from
third-party content. See `THIRD_PARTY_NOTICES.md` for the full notice.

xkcd comics and accompanying text are licensed under Creative Commons
Attribution-NonCommercial 2.5:

- https://xkcd.com/license.html
- https://creativecommons.org/licenses/by-nc/2.5/

explainxkcd wiki content is generally licensed under Creative Commons
Attribution-ShareAlike 3.0:

- https://www.explainxkcd.com/wiki/index.php/explain_xkcd:Copyrights
- https://creativecommons.org/licenses/by-sa/3.0/

This project should treat license compliance as an implementation requirement,
not an afterthought. For MVP, the safest public index is based on xkcd-provided
metadata and links. explainxkcd content can be used locally while the public
redistribution plan is made explicit.

Because public indexes currently include xkcd-derived and explainxkcd-derived
fields, public use of the app and repository should remain noncommercial and
should preserve attribution, source links, and upstream license notices.

## Reference

This project was incubated in the sibling Idealog repo:

- `../idealog/specs/relevant-xkcd.md`
