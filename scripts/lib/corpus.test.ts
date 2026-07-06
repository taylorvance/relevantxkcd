import { describe, expect, it } from "vitest";

import { assertValidExplainXkcdPage } from "./corpus.ts";

describe("assertValidExplainXkcdPage", () => {
  it("rejects MediaWiki API error payloads", () => {
    expect(() =>
      assertValidExplainXkcdPage(
        {
          error: {
            code: "invalidtitle",
            info: 'Bad title "1913:_A_\ufffd".',
          },
        },
        "explainxkcd 1913",
      ),
    ).toThrow('explainxkcd 1913 returned API error invalidtitle');
  });

  it("rejects missing parse wikitext", () => {
    expect(() => assertValidExplainXkcdPage({}, "explainxkcd 1913")).toThrow(
      "explainxkcd 1913 returned no parse wikitext.",
    );
  });

  it("accepts parse wikitext", () => {
    expect(() =>
      assertValidExplainXkcdPage(
        {
          parse: {
            title: "1913: A ?",
            wikitext: {
              "*": "==Transcript==\n:Text",
            },
          },
        },
        "explainxkcd 1913",
      ),
    ).not.toThrow();
  });
});
