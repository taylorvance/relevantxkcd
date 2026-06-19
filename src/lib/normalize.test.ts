import { describe, expect, it } from "vitest";

import comic303 from "../../fixtures/xkcd/303.json";
import comic1205 from "../../fixtures/xkcd/1205.json";
import {
  cleanText,
  extractExplainReferences,
  normalizeXkcdRecord,
  parseExplainXkcdPage,
} from "./normalize";

describe("normalizeXkcdRecord", () => {
  it("normalizes a standard xkcd record", () => {
    const record = normalizeXkcdRecord(comic303);

    expect(record).toMatchObject({
      num: 303,
      slug: "compiling",
      title: "Compiling",
      published: "2007-08-15",
      imageUrl: "https://imgs.xkcd.com/comics/compiling.png",
      canonicalUrl: "https://xkcd.com/303/",
      sourceFlags: ["xkcd"],
    });
    expect(record?.searchText).toContain("Compiling");
  });

  it("handles title punctuation when creating slugs", () => {
    const record = normalizeXkcdRecord(comic1205);

    expect(record?.title).toBe("Is It Worth the Time?");
    expect(record?.slug).toBe("is-it-worth-the-time");
  });

  it("does not require transcript or explainxkcd data", () => {
    const record = normalizeXkcdRecord({
      num: 99999,
      title: "Sparse Comic",
      year: "2026",
      month: "6",
      day: "17",
      img: "https://imgs.xkcd.com/comics/sparse.png",
    });

    expect(record).toMatchObject({
      num: 99999,
      transcript: "",
      alt: "",
      sourceFlags: ["xkcd"],
    });
  });

  it("repairs common mojibake from old corpus snapshots", () => {
    expect(cleanText("Oh dear\u00e2\u0080\u0094did he break something?")).toBe(
      "Oh dear-did he break something?",
    );
  });

  it("keeps explainxkcd text separate and provenance-marked", () => {
    const record = normalizeXkcdRecord(comic1205, {
      parse: {
        wikitext: {
          "*": "==Explanation==\nThis chart is about making a routine task more efficient.\n\n==Transcript==\n:A table about time saved.",
        },
      },
    });

    expect(record).toMatchObject({
      communityTranscript: "A table about time saved.",
      explanation: "This chart is about making a routine task more efficient.",
      explainReferences: "",
      explainUrl: "https://www.explainxkcd.com/wiki/index.php/1205",
      sourceFlags: ["xkcd", "explainxkcd"],
    });
    expect(record?.searchText).toContain("routine task");
  });
});

describe("extractExplainReferences", () => {
  it("extracts related comic titles and categories", () => {
    expect(
      extractExplainReferences(
        "See [[1319: Automation]] and [[951: Working|insufficient economy]]. [[Category:Time management]]",
      ),
    ).toBe("Automation. insufficient economy. Time management");
  });
});

describe("parseExplainXkcdPage", () => {
  it("extracts multiline top-level sections", () => {
    expect(
      parseExplainXkcdPage({
        parse: {
          wikitext: {
            "*": "intro\n\n==Explanation==\none\n\ntwo\n==Transcript==\nthree",
          },
        },
      }).sections,
    ).toEqual({
      Explanation: "one\n\ntwo",
      Transcript: "three",
    });
  });
});
