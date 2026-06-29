import { describe, expect, it } from "vitest";

import type { ComicRecord } from "../../src/lib/types";
import { publicRecordChangeLabel } from "./public-index.ts";

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
