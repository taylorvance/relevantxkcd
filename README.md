# Relevant xkcd

Relevant xkcd is an unofficial, noncommercial web app for finding the xkcd
comic that fits a conversation.

Search by a remembered phrase, idea, title, alt text, or visible comic text,
then open or share the canonical comic page.

## Attribution

Relevant xkcd is an independent project and is not affiliated with xkcd or
explainxkcd.

xkcd comics and accompanying text are created by Randall Munroe and licensed
under Creative Commons Attribution-NonCommercial 2.5. Some supplemental search
text may come from explainxkcd, which is generally licensed under Creative
Commons Attribution-ShareAlike 3.0.

The app links back to canonical xkcd pages, loads comic images from xkcd image
URLs, and preserves source links for community transcript data when present. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the full third-party
notice.

## Features

- Client-side search across xkcd titles, alt text, transcripts, and visible
  comic text.
- Search runs entirely in the browser; there is no app server.
- Ranked results with comic images, publication dates, and source links.
- Comic detail view with the canonical xkcd URL ready to copy or open.
- Links back to xkcd and explainxkcd where applicable.

## Development

```sh
npm install
npm run dev
npm test
npm run verify
npm run build
```

Routine development, builds, verification, CI, and deployment use the checked-in
public search assets under `public/`.

Useful maintenance scripts:

```sh
npm run validate:index
npm run update:index
npm run generate:semantic
```

## Licensing

Original project code is MIT licensed. See [LICENSE.md](LICENSE.md).

That license does not relicense third-party content or generated data derived
from third-party content. Public use of this project should remain
noncommercial while it includes xkcd-derived content.
