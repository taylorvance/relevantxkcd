import { describe, expect, it } from "vitest";

import { buildSearchQueryUrl, readUrlSearchQuery } from "./urlQuery";

describe("readUrlSearchQuery", () => {
  it("reads and trims the shared search query parameter", () => {
    expect(readUrlSearchQuery("?q=%20password%20strength%20")).toBe(
      "password strength",
    );
  });

  it("returns an empty string when the query parameter is absent", () => {
    expect(readUrlSearchQuery("?comic=936")).toBe("");
  });
});

describe("buildSearchQueryUrl", () => {
  it("sets the shared search query parameter while preserving other URL state", () => {
    expect(
      buildSearchQueryUrl("https://example.test/app?theme=dark#results", "  git "),
    ).toBe("/app?theme=dark&q=git#results");
  });

  it("removes the shared search query parameter when the query is empty", () => {
    expect(
      buildSearchQueryUrl(
        "https://example.test/app?q=standards&theme=dark#results",
        "",
      ),
    ).toBe("/app?theme=dark#results");
  });
});
