import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { SemanticIndexFile } from "../src/lib/semantic";
import type { ComicRecord } from "../src/lib/types";
import {
  SEMANTIC_DIMENSIONS,
  SEMANTIC_MODEL_ID,
  SEMANTIC_SCALE,
  semanticTextHash,
} from "./lib/semantic-index.ts";

describe("build-semantic-index", () => {
  it("reuses previous vectors when semantic text hashes match", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "relevantxkcd-semantic-"));
    const previousRecordsPath = path.join(directory, "search.previous.json");
    const recordsPath = path.join(directory, "search.json");
    const previousIndexPath = path.join(directory, "semantic.previous.json");
    const outputPath = path.join(directory, "semantic.json");
    const records = [
      record(1205, "Is It Worth the Time?", "The general answer is no."),
      record(1319, "Automation", "The argument against automation is fixing automation."),
    ];
    const vectors = new Int8Array(records.length * SEMANTIC_DIMENSIONS);

    vectors.fill(7, 0, SEMANTIC_DIMENSIONS);
    vectors.fill(-11, SEMANTIC_DIMENSIONS);
    writeJson(previousRecordsPath, records);
    writeJson(recordsPath, records);
    writeJson(previousIndexPath, {
      model: SEMANTIC_MODEL_ID,
      dimensions: SEMANTIC_DIMENSIONS,
      scale: SEMANTIC_SCALE,
      nums: records.map((item) => item.num),
      vectors: Buffer.from(vectors.buffer).toString("base64"),
    } satisfies SemanticIndexFile);

    const output = execFileSync(
      "node",
      [
        "scripts/build-semantic-index.ts",
        "--records",
        recordsPath,
        "--output",
        outputPath,
        "--previous-records",
        previousRecordsPath,
        "--previous-index",
        previousIndexPath,
      ],
      {
        cwd: path.resolve(import.meta.dirname, ".."),
        encoding: "utf8",
      },
    );
    const semantic = JSON.parse(readFileSync(outputPath, "utf8")) as SemanticIndexFile;

    expect(output).toContain("Reused 2 semantic vectors; embedding 0 new or changed records.");
    expect(semantic.nums).toEqual([1205, 1319]);
    expect(semantic.contentHashes).toEqual(records.map(semanticTextHash));
    expect(semantic.vectors).toBe(Buffer.from(vectors.buffer).toString("base64"));
  });
});

function record(num: number, title: string, alt: string): ComicRecord {
  return {
    num,
    slug: title.toLowerCase().replace(/\W+/g, "-"),
    title,
    published: "2024-01-01",
    imageUrl: `https://imgs.xkcd.com/comics/${num}.png`,
    canonicalUrl: `https://xkcd.com/${num}/`,
    alt,
    transcript: "",
    communityTranscript: "",
    explainUrl: `https://www.explainxkcd.com/wiki/index.php/${num}`,
    sourceFlags: ["xkcd"],
  };
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value)}\n`);
}
