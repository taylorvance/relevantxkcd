# Third-Party Notices

Relevant xkcd is an unofficial, noncommercial search and sharing tool. This
project is not affiliated with, endorsed by, or sponsored by xkcd or
explainxkcd.

Third-party content remains under its original license. The project license in
`LICENSE.md` does not relicense third-party content or generated data derived
from third-party content.

## xkcd

Source:

- https://xkcd.com/
- https://xkcd.com/license.html

License:

- Creative Commons Attribution-NonCommercial 2.5
- https://creativecommons.org/licenses/by-nc/2.5/

This applies to xkcd comic content used by this project, including comic
metadata, titles, alt text, transcripts, canonical URLs, and image URLs where
present in local fixtures or generated indexes. Comic images are loaded from
xkcd image URLs rather than bundled in this repository.

Use of xkcd-derived content must remain noncommercial and include appropriate
attribution and license links.

## explainxkcd

Source:

- https://www.explainxkcd.com/wiki/
- https://www.explainxkcd.com/wiki/index.php/explain_xkcd:Copyrights

License:

- Creative Commons Attribution-ShareAlike 3.0
- https://creativecommons.org/licenses/by-sa/3.0/

This applies to explainxkcd wiki content used by this project, including
community transcripts or other wiki-derived fields where present in local
fixtures or generated indexes.

Use of explainxkcd-derived content requires appropriate attribution, license
links, and ShareAlike handling for adapted material. The explainxkcd copyright
notice also states that xkcd comic content reused on the wiki remains under the
xkcd Creative Commons Attribution-NonCommercial 2.5 license.

## Repository Assets

The following paths may contain third-party content or generated data derived
from third-party content:

- `fixtures/xkcd/*.json`
- `public/search-index.json`
- `public/semantic-index.json`
- ignored local files under `raw_data/`

The generated search index is intended to preserve source provenance through
record fields and `sourceFlags`. Do not treat these generated assets as MIT
licensed project code.
