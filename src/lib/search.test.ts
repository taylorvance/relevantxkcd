import { describe, expect, it } from "vitest";

import comic303 from "../../fixtures/xkcd/303.json";
import comic754 from "../../fixtures/xkcd/754.json";
import comic927 from "../../fixtures/xkcd/927.json";
import comic936 from "../../fixtures/xkcd/936.json";
import comic1205 from "../../fixtures/xkcd/1205.json";
import comic1319 from "../../fixtures/xkcd/1319.json";
import comic1597 from "../../fixtures/xkcd/1597.json";
import { normalizeXkcdRecord } from "./normalize";
import { buildResultExcerpt, searchComics, tokenize } from "./search";
import type { ComicRecord } from "./types";

const records = [
  comic303,
  comic754,
  comic927,
  comic936,
  comic1205,
  comic1319,
  comic1597,
]
  .map((raw) => normalizeXkcdRecord(raw))
  .filter((record) => record !== null);

describe("searchComics", () => {
  it.each([
    ["standards", 927],
    ["password strength", 936],
    ["compiling", 303],
    ["automation", 1319],
    ["git", 1597],
  ])("puts the canonical result first for %s", (query, expectedNum) => {
    expect(searchComics(records, query)[0]?.num).toBe(expectedNum);
  });

  it.each(["#936", "936"])("supports comic-number lookup for %s", (query) => {
    const [result] = searchComics(records, query);

    expect(result?.num).toBe(936);
    expect(result?.matchSource).toBe("number");
  });

  it("handles vague multi-token queries by combining evidence", () => {
    const results = searchComics(records, "dependency graph");

    expect(results[0]?.num).toBe(754);
    expect(results.map((result) => result.num)).toContain(1597);
  });

  it("supports quoted phrase matching", () => {
    expect(searchComics(records, '"correct horse battery staple"')[0]?.num).toBe(
      936,
    );
  });

  it("uses hover text as the title-match excerpt instead of transcript text", () => {
    const [result] = searchComics(
      [
        record({
          num: 1,
          title: "Needle",
          alt: "Useful hover context.",
          transcript: "Needle appears in a long transcript.",
        }),
      ],
      "needle",
    );

    expect(result).toMatchObject({
      matchSource: "title",
      excerpt: "Useful hover context.",
      excerptSource: "alt",
    });
  });

  it("falls back to the displayed title for title matches without hover text", () => {
    const [result] = searchComics(
      [
        record({
          num: 1,
          title: "Needle",
          transcript: "Needle appears in a long transcript.",
        }),
      ],
      "needle",
    );

    expect(result).toMatchObject({
      matchSource: "title",
      excerpt: "Needle",
      excerptSource: "title",
    });
  });

  it("uses hover text then title for contextual excerpts without a lexical source", () => {
    expect(
      buildResultExcerpt(
        record({
          title: "Context Title",
          alt: "Context hover text.",
          transcript: "Transcript should not be the default context.",
        }),
      ),
    ).toMatchObject({
      excerpt: "Context hover text.",
      excerptSource: "alt",
    });

    expect(
      buildResultExcerpt(
        record({
          title: "Context Title",
          transcript: "Transcript should not be the default context.",
        }),
      ),
    ).toMatchObject({
      excerpt: "Context Title",
      excerptSource: "title",
    });
  });

  it("uses quoted phrase terms when choosing non-title excerpts", () => {
    const [result] = searchComics(
      [
        record({
          num: 1,
          title: "Password Strength",
          alt: "Hover text without the phrase.",
          transcript: "Correct horse battery staple is shown as the stronger password.",
        }),
      ],
      '"correct horse battery staple"',
    );

    expect(result).toMatchObject({
      matchSource: "transcript",
      excerptSource: "transcript",
    });
    expect(result?.excerpt).toContain("Correct horse battery staple");
  });

  it("uses the matched hover text field even when transcript also contains query terms", () => {
    const [result] = searchComics(
      [
        record({
          num: 1,
          title: "Unrelated",
          alt: "Alpha appears in hover text.",
          transcript: "Alpha appears in transcript text.",
        }),
      ],
      "alpha",
    );

    expect(result).toMatchObject({
      matchSource: "alt",
      excerpt: "Alpha appears in hover text.",
      excerptSource: "alt",
    });
  });

  it("uses the matched community transcript field when it drives the match", () => {
    const [result] = searchComics(
      [
        record({
          num: 1,
          title: "Unrelated",
          alt: "Different hover text.",
          transcript: "",
          communityTranscript: "Needle appears in community transcript.",
        }),
      ],
      "needle",
    );

    expect(result).toMatchObject({
      matchSource: "communityTranscript",
      excerpt: "Needle appears in community transcript.",
      excerptSource: "communityTranscript",
    });
  });

  it("promotes community transcript weight when official transcript is missing", () => {
    const results = searchComics(
      [
        record({
          num: 1,
          title: "Official present",
          transcript: "Official words.",
          communityTranscript: "sharedneedle",
        }),
        record({
          num: 2,
          title: "Official missing",
          communityTranscript: "sharedneedle",
        }),
      ],
      "sharedneedle",
    );

    expect(results.map((result) => result.num)).toEqual([2, 1]);
  });

  it("stems simple plurals", () => {
    expect(tokenize("standards dependencies")).toEqual([
      "standard",
      "dependency",
    ]);
  });
});

function record(overrides: Partial<ComicRecord>): ComicRecord {
  return {
    num: 0,
    slug: "",
    title: "",
    published: "",
    imageUrl: "",
    canonicalUrl: "",
    alt: "",
    transcript: "",
    communityTranscript: "",
    explainUrl: "",
    searchText: "",
    sourceFlags: ["xkcd"],
    ...overrides,
  };
}
