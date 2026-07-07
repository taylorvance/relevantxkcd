import { describe, expect, it } from "vitest";

import comic303 from "../../fixtures/xkcd/303.json";
import comic1205 from "../../fixtures/xkcd/1205.json";
import { cleanText, normalizeXkcdRecord, parseExplainXkcdPage } from "./normalize";

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

  it("preserves transcript line breaks for display", () => {
    const record = normalizeXkcdRecord(comic1205);

    expect(record?.transcript).toContain(
      "How long can you work on making a routine task more efficient before you're spending more time than you save? (Across five years)\n\n[[A table",
    );
    expect(record?.searchText).toContain("\n\n[[A table");
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

  it("keeps cleaned explainxkcd transcript separate from official transcript", () => {
    const record = normalizeXkcdRecord(comic1205, {
      parse: {
        wikitext: {
          "*": "==Explanation==\nWiki-only explanation phrase.\n\n==Transcript==\n:A table about time saved. <!-- editor note --> <!-- malformed note -> {{comic discussion}} <noinclude>[[Category:Time management]]</noinclude>",
        },
      },
    });

    expect(record).toMatchObject({
      communityTranscript: "A table about time saved.",
      explainUrl: "https://www.explainxkcd.com/wiki/index.php/1205",
      sourceFlags: ["xkcd", "explainxkcd"],
    });
    expect(record?.searchText).toContain("A table about time saved.");
    expect(record?.searchText).not.toContain("Wiki-only explanation phrase");
    expect(record?.searchText).not.toContain("comic discussion");
    expect(record?.searchText).not.toContain("editor note");
    expect(record?.searchText).not.toContain("malformed note");
  });

  it("falls back to a cleaned explainxkcd transcript", () => {
    const record = normalizeXkcdRecord(
      {
        num: 99999,
        title: "Sparse Comic",
        year: "2026",
        month: "6",
        day: "17",
        img: "https://imgs.xkcd.com/comics/sparse.png",
      },
      {
        parse: {
          wikitext: {
            "*": "==Transcript==\n:A table about time saved. <noinclude>[[Category:Time management]]</noinclude>",
          },
        },
      },
    );

    expect(record).toMatchObject({
      communityTranscript: "A table about time saved.",
      sourceFlags: ["xkcd", "explainxkcd"],
    });
    expect(record?.searchText).toContain("A table about time saved.");
  });

  it("preserves unknown transcript templates as visible markup", () => {
    const record = normalizeXkcdRecord(
      {
        num: 99999,
        title: "Sparse Comic",
        year: "2026",
        month: "6",
        day: "17",
        img: "https://imgs.xkcd.com/comics/sparse.png",
      },
      {
        parse: {
          wikitext: {
            "*": "==Transcript==\n{{incomplete transcript|Don't remove this notice too soon.}}\n:A table about time saved.",
          },
        },
      },
    );

    expect(record?.communityTranscript).toBe(
      "{{incomplete transcript|Don't remove this notice too soon.}}\nA table about time saved.",
    );
  });

  it("does not mark MediaWiki API errors as explainxkcd sources", () => {
    const record = normalizeXkcdRecord(
      {
        num: 1913,
        title: "A \ufffd",
        year: "2017",
        month: "11",
        day: "8",
        img: "https://imgs.xkcd.com/comics/i.png",
      },
      {
        error: {
          code: "invalidtitle",
          info: 'Bad title "1913:_A_\ufffd".',
        },
      },
    );

    expect(record).toMatchObject({
      communityTranscript: "",
      sourceFlags: ["xkcd"],
    });
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
