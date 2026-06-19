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

  it("stems simple plurals", () => {
    expect(tokenize("standards dependencies")).toEqual([
      "standard",
      "dependency",
    ]);
  });
});
