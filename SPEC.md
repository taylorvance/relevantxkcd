# Relevant xkcd Spec

## Purpose

Build a fast, web-first tool for finding and sharing relevant xkcd comics from
short conversational queries.

The first product question is:

> If I remember the concept, can I find the comic I want to send?

The product should optimize for quickly finding a plausible comic and copying
the canonical xkcd link. Some vague queries will legitimately match several
comics; the app should show useful alternatives instead of pretending every
query has one exact answer.

## Non-Goals for MVP

- iMessage extension
- user accounts
- ratings, personalization, or history sync
- hosted vector database before baseline search quality is measured
- mandatory LLM calls
- public API
- commercial monetization
- bundled comic images

## UX Contract

Primary flow:

1. Open the site.
2. Type a phrase such as `standards`, `dependency graph`, `automation`, or
   `password strength`.
3. See ranked plausible comics.
4. Open a result.
5. Copy the canonical xkcd link.

MVP UI:

- focused search input on load
- ranked result list
- selected comic detail view
- comic image loaded from xkcd remote image URL
- title, comic number, alt text, and canonical link
- copy-link button
- clear attribution/source note

## Technical Direction

Use TypeScript for the web app, ranking code, and tests.

Recommended structure:

- `src/` for app, ranking, and shared types
- `scripts/` for repeatable corpus/index generation
- `public/` or build assets for the generated search index
- `tests/` or colocated tests for normalization and ranking
- `fixtures/` for a small committed raw corpus subset

Recommended stack:

- Vite
- React
- TypeScript
- a test runner appropriate to the final scaffold

Keep Python only as temporary corpus tooling unless it is cheaper to retain a
specific script during migration.

## Search Architecture Posture

Start with static client-side search because it has the lowest maintenance
burden and best deployment story. This is a baseline to test, not a hard product
constraint.

Escalate only if the baseline fails measured quality or performance targets:

- static lexical search over a generated index
- improved lexical ranking, such as BM25 or a compact inverted index
- offline-generated embeddings loaded statically, if size remains acceptable
- search API backed by a stronger index
- hosted vector database only if simpler options cannot produce good relevance

Before adding a server or vector database, document:

- what queries the static approach fails
- what quality improvement the new approach provides
- hosting and maintenance cost
- deployment story
- whether search still works locally or offline during development
- any privacy implications of sending queries to a service

## Corpus Inputs

Existing local data:

- `raw_data/xkcd/*.json`: xkcd metadata snapshots
- `raw_data/explainxkcd/*.json`: explainxkcd wiki API snapshots

`raw_data/` stays ignored and should be treated as local/generated input, not
source code.

Commit only a small fixture subset for deterministic tests. Good fixture cases:

- a normal comic, such as `303`
- a comic with unusual title punctuation
- a comic missing explainxkcd data
- a comic where transcript text is important for relevance

## Public Index Policy

Do not publish the raw corpus as app assets.

Publish a generated, minimized search index that contains only what the app
needs. For MVP, prefer xkcd-provided fields:

- comic number
- title
- publish date
- image URL
- canonical URL
- alt text
- transcript if useful
- compact search text derived from those fields

explainxkcd-derived text can improve recall, but public redistribution has
extra attribution and share-alike requirements. Before shipping it in the public
index, implement:

- source attribution in the app
- links back to explainxkcd article pages
- clear license notice for CC BY-SA 3.0 content
- an explicit decision about whether the generated index is licensed separately
  from the app code

## Normalized Record

Target record shape:

```json
{
  "num": 303,
  "slug": "compiling",
  "title": "Compiling",
  "published": "2007-08-15",
  "imageUrl": "https://imgs.xkcd.com/comics/compiling.png",
  "canonicalUrl": "https://xkcd.com/303/",
  "alt": "...",
  "transcript": "...",
  "searchText": "...",
  "sourceFlags": ["xkcd"]
}
```

If explainxkcd content is later included, add separate fields instead of hiding
its provenance inside `searchText`.

## Ranking Baseline

Start with explainable lexical ranking before adding clever retrieval.

Suggested behavior:

- tokenize query and record text
- exact title match gets a strong bonus
- title token matches get strong weight
- alt text and transcript matches get medium weight
- quoted phrases get an exact phrase bonus
- recency does not affect ranking unless added deliberately later

Calibration queries:

- `standards` should surface "Standards" near the top
- `password strength` should surface "Password Strength" near the top
- `compiling` should surface "Compiling" near the top
- `automation` should surface automation-related comics
- `dependency graph` should surface dependency- or graph-related comics
- `git` should surface git/version-control-related comics

These are test fixtures, not a permanent truth table for every ranking decision.

## Search Enhancement TODOs

Treat semantic search as an automatic enhancement to fast lexical search, not as
the only retrieval mode. The app should remain useful when semantic assets,
model loading, browser WASM support, or runtime embedding fail.

Target behavior:

- Show lexical results immediately for each query.
- Start semantic refinement only for non-empty queries.
- Discard semantic responses for stale queries.
- Apply at most one semantic merge per query.
- Never auto-change the selected comic after initial load.
- Never reset result-list scroll or focus when refined results arrive.
- Keep strong lexical matches stable near the top.
- Insert semantic-only results only when their score clears a measured
  threshold.
- Prefer promotion over broad reshuffling: overlapping lexical+semantic matches
  can move modestly, but exact title/phrase matches should not be displaced by
  fuzzy semantic matches.
- Show clear status states such as `Searching`, `Refining`, and briefly
  `Refined` without replacing stable count or result context.
- Preserve result-card explanation: every visible excerpt should identify
  whether it came from title, alt text, transcript, community text, explainxkcd,
  or semantic-only evidence.

Merge model TODOs:

- Normalize lexical and semantic scores onto comparable ranges before blending.
- Define "strong lexical match" by observed score and match type, not by a hard
  top-N rule alone.
- Define a semantic-only inclusion threshold from calibration queries.
- Add an overlap bonus for records that appear in both lexical and semantic
  candidate sets.
- Keep blend weights explicit and test-covered.
- Consider a simple initial formula:

```ts
finalScore =
  lexicalNormalized * 0.55 +
  semanticNormalized * 0.35 +
  overlapBonus * 0.10
```

This formula is a starting hypothesis, not a committed tuning decision.

Interaction stability TODOs:

- Apply lexical updates on input changes.
- Apply semantic refinement only once the current query's embedding and ranking
  finish.
- If the user is actively scrolling, hovering, or keyboard-focusing the results
  list, hold the semantic merge until a short idle window.
- Start with simple stability protections before building complex interaction
  detection: stale-response discard, one semantic merge per query, no selection
  changes, no scroll reset, and conservative promotion thresholds.
- Add regression tests for selection stability and stale semantic responses.

Calibration TODOs:

- Exact/title queries such as `standards`, `password strength`, `compiling`, and
  quoted phrases should remain dominated by lexical evidence.
- Concept queries such as `dependency graph`, `automation`, and future
  user-observed misses should demonstrate whether semantic refinement improves
  recall.
- Keep a small query evaluation list with expected top results, acceptable
  alternatives, and notes explaining why a result should or should not move
  after semantic refinement.
- Revisit thresholds and weights only after measuring this calibration list.

## Acceptance Criteria

Phase 1: normalization

- every valid xkcd raw record becomes one normalized record
- missing explainxkcd data does not block inclusion
- records have stable ids and canonical URLs
- generated output can be reproduced without network access
- tests cover fixture records

Phase 2: search

- ranking is covered by tests independent of UI
- query latency is acceptable on laptop and phone
- result cards show enough context to choose between plausible comics
- search runs fully client-side in a static build
- any move to an API/vector backend is justified by measured relevance or
  performance failures

Phase 3: app

- `npm test` passes
- `npm run build` creates a static site
- a fresh clone can run tests using committed fixtures
- app can display remote xkcd images
- user can copy a canonical xkcd link
- mobile layout can search, inspect, and copy without overlap

## Open Decisions

- Exact fixture set.
- Whether the first public index includes xkcd transcript text or only title and
  alt text.
- Whether explainxkcd text is excluded from public assets or included with full
  CC BY-SA attribution handling.
- Whether the generated public index should be checked in or produced only as a
  build artifact.
- What relevance threshold would justify moving beyond static client-side
  search.
