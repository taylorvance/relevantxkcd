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

## Corpus Policy

Do not commit the full raw corpus by default.

Recommended approach:

- keep `raw_data/` ignored as local source snapshots
- commit a small fixture set for tests
- publish only the generated app assets and the minimized public search index
- avoid shipping explainxkcd-derived text in the public index until attribution
  and license handling are implemented deliberately

The full raw corpus is around tens of megabytes and changes over time. Keeping
it out of git avoids noisy vendor-data churn and reduces the chance of
accidentally redistributing source text without the correct attribution/license
surface.

## License Notes

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

## Reference

This project was incubated in the sibling Idealog repo:

- `../idealog/specs/relevant-xkcd.md`
