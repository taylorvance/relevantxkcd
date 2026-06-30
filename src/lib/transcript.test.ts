import { describe, expect, it } from "vitest";

import { formatTranscript, getTranscript } from "./transcript";
import type { ComicRecord } from "./types";

describe("formatTranscript", () => {
  it("strips title text footers and breaks up speaker labels", () => {
    expect(
      formatTranscript(
        "Cueball: We need a universal standard. Fellow Geek: Yeah! Soon: SITUATION: There are 15 competing standards. {{Title text: Hover joke.}}",
      ),
    ).toBe(
      [
        "Cueball: We need a universal standard.",
        "Fellow Geek: Yeah!",
        "Soon: SITUATION: There are 15 competing standards.",
      ].join("\n"),
    );
  });

  it("formats panel descriptions and simple transcript HTML as readable text", () => {
    expect(
      formatTranscript(
        "[Caption below the panel:]<br>After learning Tethys is 1/12<sup>th</sup> the size of Earth, they write 10<sup>13</sup> in H<sub>2</sub>O.",
      ),
    ).toBe(
      [
        "[Caption below the panel:]",
        "After learning Tethys is 1/12th the size of Earth, they write 10^13 in H_2O.",
      ].join("\n"),
    );
  });

  it("keeps inline stage directions with their speaker", () => {
    expect(
      formatTranscript(
        "Character #1 [[Raising his hands]]: We are the knights who say... Ni!! Two guys and a girl: hahaha",
      ),
    ).toBe(
      [
        "Character #1 [Raising his hands]: We are the knights who say... Ni!!",
        "Two guys and a girl: hahaha",
      ].join("\n"),
    );
  });
});

describe("getTranscript", () => {
  it("prefers official xkcd transcript text and falls back to community transcript", () => {
    expect(
      getTranscript(
        record({
          transcript: "Cueball: Official transcript.",
          communityTranscript: "Cueball: Community transcript.",
        }),
      ),
    ).toBe("Cueball: Official transcript.");

    expect(
      getTranscript(
        record({
          transcript: "",
          communityTranscript: "[Caption below the panel:]<br>Community transcript.",
        }),
      ),
    ).toBe("[Caption below the panel:]\nCommunity transcript.");
  });
});

function record(overrides: Partial<ComicRecord>): ComicRecord {
  return {
    num: 1,
    slug: "test",
    title: "Test",
    published: "2006-01-01",
    imageUrl: "https://imgs.xkcd.com/comics/test.png",
    canonicalUrl: "https://xkcd.com/1/",
    alt: "",
    transcript: "",
    communityTranscript: "",
    explainUrl: "https://www.explainxkcd.com/wiki/index.php/1",
    sourceFlags: ["xkcd"],
    ...overrides,
  };
}
