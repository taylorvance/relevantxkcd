import { describe, expect, it } from "vitest";

import {
  blendSearchResults,
  type DecodedSemanticIndex,
  rankSemantic,
} from "./semantic";
import type { ComicRecord, SearchResult } from "./types";

const records: ComicRecord[] = [
  record(1205, "Is It Worth the Time?"),
  record(1319, "Automation"),
  record(927, "Standards"),
];

describe("rankSemantic", () => {
  it("ranks vectors by cosine-like dot product", () => {
    const index: DecodedSemanticIndex = {
      model: "test",
      dimensions: 2,
      scale: 127,
      nums: [1205, 1319],
      vectors: new Int8Array([127, 0, 0, 127]),
    };

    expect(rankSemantic(index, new Float32Array([1, 0]), 2)).toEqual([
      { num: 1205, score: 1 },
      { num: 1319, score: 0 },
    ]);
  });
});

describe("blendSearchResults", () => {
  it("keeps lexical hits while allowing semantic-only candidates", () => {
    const lexical: SearchResult[] = [
      {
        ...records[1],
        score: 1200,
        excerpt: "Automation",
        excerptSource: "title",
        matchSource: "title",
        matchedFields: ["title"],
      },
    ];

    const blended = blendSearchResults(
      records,
      lexical,
      [
        { num: 1205, score: 0.88 },
        { num: 1319, score: 0.7 },
      ],
      3,
    );

    expect(blended.map((result) => result.num)).toContain(1205);
    expect(blended.map((result) => result.num)).toContain(1319);
  });

  it("keeps the strongest lexical result above fuzzy semantic promotions", () => {
    const lexical: SearchResult[] = [
      searchResult(records[0], 400),
      searchResult(records[1], 220),
    ];

    const blended = blendSearchResults(
      records,
      lexical,
      [
        { num: 1319, score: 1 },
        { num: 927, score: 0.98 },
      ],
      3,
    );

    expect(blended[0]?.num).toBe(1205);
    expect(blended.map((result) => result.num)).toContain(927);
  });

  it("does not anchor weak lexical leaders", () => {
    const lexical: SearchResult[] = [
      searchResult(records[0], 200),
      searchResult(records[1], 180),
    ];

    const blended = blendSearchResults(
      records,
      lexical,
      [{ num: 1319, score: 1 }],
      3,
    );

    expect(blended[0]?.num).toBe(1319);
  });
});

function record(num: number, title: string): ComicRecord {
  return {
    num,
    slug: title.toLowerCase().replace(/\W+/g, "-"),
    title,
    published: "",
    imageUrl: "",
    canonicalUrl: `https://xkcd.com/${num}/`,
    alt: "",
    transcript: "",
    communityTranscript: "",
    explainUrl: `https://www.explainxkcd.com/wiki/index.php/${num}`,
    searchText: title,
    sourceFlags: ["xkcd"],
  };
}

function searchResult(record: ComicRecord, score: number): SearchResult {
  return {
    ...record,
    score,
    excerpt: record.title,
    excerptSource: "title",
    matchSource: "title",
    matchedFields: ["title"],
  };
}
