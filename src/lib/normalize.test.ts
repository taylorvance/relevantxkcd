import { describe, expect, it } from "vitest";

import comic303 from "../../fixtures/xkcd/303.json";
import comic1205 from "../../fixtures/xkcd/1205.json";
import { cleanText, normalizeXkcdRecord } from "./normalize";

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
});
