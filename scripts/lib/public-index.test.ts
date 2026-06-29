import { describe, expect, it } from "vitest";

import type { ComicRecord } from "../../src/lib/types";
import { formatPublicRecords, publicRecordChangeLabel } from "./public-index.ts";

describe("formatPublicRecords", () => {
  it("writes valid JSON with one comic record per line", () => {
    const formatted = formatPublicRecords([record(1), record(2)]);

    expect(formatted).toBe(
      `[\n${JSON.stringify(record(1))},\n${JSON.stringify(record(2))}\n]\n`,
    );
    expect(JSON.parse(formatted)).toEqual([record(1), record(2)]);
  });

  it("formats an empty public index as an empty array", () => {
    expect(formatPublicRecords([])).toBe("[]\n");
  });
});

describe("publicRecordChangeLabel", () => {
  it("labels missing baseline records as added", () => {
    expect(publicRecordChangeLabel()).toBe("Added");
  });

  it("labels changed baseline records as updated", () => {
    expect(publicRecordChangeLabel(record(3264))).toBe("Updated");
  });
});

function record(num: number): ComicRecord {
  return {
    num,
    slug: `xkcd-${num}`,
    title: `Comic ${num}`,
    published: "",
    imageUrl: "",
    canonicalUrl: `https://xkcd.com/${num}/`,
    alt: "",
    transcript: "",
    communityTranscript: "",
    explainUrl: `https://www.explainxkcd.com/wiki/index.php/${num}`,
    sourceFlags: ["xkcd"],
  };
}
