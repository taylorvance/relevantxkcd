import { describe, expect, it } from "vitest";

import calibration from "../../search-calibration.json";
import publicRecords from "../../public/search-index.json";
import { createSearchIndex, searchComics } from "./search";
import type { ComicRecord } from "./types";

interface CalibrationCase {
  query: string;
  expectedTop?: number[];
  tier?: "canonical" | "calibration";
}

const records = publicRecords as ComicRecord[];
const searchIndex = createSearchIndex(records);
const canonicalCases = (calibration.cases as CalibrationCase[]).filter(
  (calibrationCase) => calibrationCase.tier === "canonical",
);

describe("canonical search calibration", () => {
  it("has at least one canonical case", () => {
    expect(canonicalCases.length).toBeGreaterThan(0);
  });

  it.each(canonicalCases)(
    "puts an expected result first for $query",
    ({ query, expectedTop }) => {
      expect(expectedTop?.length).toBeGreaterThan(0);
      expect(searchComics(searchIndex, query)[0]?.num).toSatisfy((num: number) =>
        expectedTop?.includes(num) ?? false,
      );
    },
  );
});
