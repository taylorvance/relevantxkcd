import { describe, expect, it } from "vitest";

import comic303 from "../../fixtures/xkcd/303.json";
import comic754 from "../../fixtures/xkcd/754.json";
import comic927 from "../../fixtures/xkcd/927.json";
import comic936 from "../../fixtures/xkcd/936.json";
import comic1205 from "../../fixtures/xkcd/1205.json";
import comic1319 from "../../fixtures/xkcd/1319.json";
import comic1597 from "../../fixtures/xkcd/1597.json";
import { normalizeXkcdRecord } from "./normalize";
import { searchComics, tokenize } from "./search";
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
