import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";

import {
  INDEX_MANIFEST_SCHEMA,
  SEARCH_INDEX_SCHEMA,
  SEMANTIC_INDEX_SCHEMA,
  isSupportedIndexManifest,
} from "../src/lib/indexManifest.ts";
import type { IndexManifestFile } from "../src/lib/indexManifest.ts";
import type { SemanticIndexFile } from "../src/lib/semantic.ts";
import type { ComicRecord } from "../src/lib/types.ts";
import { semanticTextHash } from "./lib/semantic-index.ts";

const DEFAULT_MANIFEST = "public/index-manifest.json";

async function main(): Promise<void> {
  const requireSemantic = process.argv.includes("--require-semantic");
  const manifestPath = process.argv.find((arg) => arg.endsWith(".json")) ?? DEFAULT_MANIFEST;

  if (!existsSync(manifestPath)) {
    throw new Error(`Index manifest not found at ${manifestPath}`);
  }

  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;

  if (!isSupportedIndexManifest(manifest)) {
    throw new Error(`Unsupported or invalid ${INDEX_MANIFEST_SCHEMA} file at ${manifestPath}`);
  }

  await validateSearch(manifest);

  if (manifest.assets.semantic) {
    await validateSemantic(manifest);
  } else if (requireSemantic) {
    throw new Error("Manifest does not include a semantic asset.");
  }

  console.log(
    `Validated ${manifestPath}: ${manifest.corpus.recordCount} records` +
      (manifest.assets.semantic ? " with semantic asset" : " without semantic asset"),
  );
}

async function validateSearch(manifest: IndexManifestFile): Promise<ComicRecord[]> {
  const asset = manifest.assets.search;

  if (asset.schema !== SEARCH_INDEX_SCHEMA) {
    throw new Error(`Unsupported search schema ${asset.schema}`);
  }

  const searchPath = publicPath(asset.url);
  const searchContent = await readFile(searchPath, "utf8");
  const records = JSON.parse(searchContent) as ComicRecord[];
  const nums = records.map((record) => record.num);

  assertEqual(asset.sha256, sha256(searchContent), "search sha256");
  assertEqual(asset.bytes, statSync(searchPath).size, "search bytes");
  assertEqual(asset.recordCount, records.length, "search recordCount");
  assertEqual(manifest.corpus.recordCount, records.length, "corpus recordCount");
  assertEqual(manifest.corpus.latestNum, Math.max(0, ...nums), "corpus latestNum");
  assertEqual(manifest.corpus.numsHash, hashNums(nums), "corpus numsHash");

  for (let index = 1; index < nums.length; index += 1) {
    if (nums[index] <= nums[index - 1]) {
      throw new Error(`Search records are not strictly sorted at index ${index}`);
    }
  }

  for (const record of records) {
    if (!record.num || !record.title || !record.canonicalUrl || !record.sourceFlags.length) {
      throw new Error(`Record ${record.num || "unknown"} is missing required public fields.`);
    }
  }

  return records;
}

async function validateSemantic(manifest: IndexManifestFile): Promise<void> {
  const asset = manifest.assets.semantic;

  if (!asset) {
    return;
  }

  if (asset.schema !== SEMANTIC_INDEX_SCHEMA) {
    throw new Error(`Unsupported semantic schema ${asset.schema}`);
  }

  const searchPath = publicPath(manifest.assets.search.url);
  const semanticPath = publicPath(asset.url);
  const records = JSON.parse(await readFile(searchPath, "utf8")) as ComicRecord[];
  const semanticContent = await readFile(semanticPath, "utf8");
  const semantic = JSON.parse(semanticContent) as SemanticIndexFile;
  const nums = records.map((record) => record.num);

  assertEqual(asset.sha256, sha256(semanticContent), "semantic sha256");
  assertEqual(asset.bytes, statSync(semanticPath).size, "semantic bytes");
  assertEqual(asset.recordCount, semantic.nums.length, "semantic recordCount");
  assertEqual(asset.numsHash, hashNums(semantic.nums), "semantic numsHash");
  assertEqual(asset.model, semantic.model, "semantic model");
  assertEqual(asset.dimensions, semantic.dimensions, "semantic dimensions");
  assertEqual(asset.scale, semantic.scale, "semantic scale");

  if (!arraysEqual(semantic.nums, nums)) {
    throw new Error("Semantic nums do not match search-record nums.");
  }

  const vectorLength = Buffer.from(semantic.vectors, "base64").byteLength;
  const expectedVectorLength = semantic.nums.length * semantic.dimensions;

  assertEqual(vectorLength, expectedVectorLength, "semantic vector byte length");

  if (semantic.contentHashes !== undefined) {
    assertEqual(semantic.contentHashes.length, records.length, "semantic contentHashes length");

    records.forEach((record, index) => {
      assertEqual(semantic.contentHashes?.[index], semanticTextHash(record), `semantic content hash #${record.num}`);
    });
  }
}

function publicPath(url: string): string {
  return url.startsWith("/") ? `public/${url.slice(1)}` : url;
}

function sha256(content: string): string {
  return `sha256-${createHash("sha256").update(content).digest("hex")}`;
}

function hashNums(nums: number[]): string {
  return sha256(JSON.stringify(nums));
}

function arraysEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: ${String(actual)} != ${String(expected)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
