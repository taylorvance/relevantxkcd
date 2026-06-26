import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  INDEX_MANIFEST_SCHEMA,
  SEARCH_INDEX_SCHEMA,
  SEMANTIC_INDEX_SCHEMA,
  isSupportedIndexManifest,
  type IndexManifestFile,
  type IndexAsset,
  type SemanticIndexAsset,
} from "../src/lib/indexManifest.ts";
import type { SemanticIndexFile } from "../src/lib/semantic.ts";
import type { ComicRecord } from "../src/lib/types.ts";

const DEFAULT_SEARCH = "public/search-index.json";
const DEFAULT_SEMANTIC = "public/semantic-index.json";
const DEFAULT_OUTPUT = "public/index-manifest.json";

async function main(): Promise<void> {
  const searchPath = process.argv[2] ?? DEFAULT_SEARCH;
  const semanticPath = process.argv[3] ?? DEFAULT_SEMANTIC;
  const outputPath = process.argv[4] ?? DEFAULT_OUTPUT;

  if (!existsSync(searchPath)) {
    throw new Error(`Search index not found at ${searchPath}`);
  }

  const searchContent = await readFile(searchPath, "utf8");
  const records = JSON.parse(searchContent) as ComicRecord[];
  const nums = records.map((record) => record.num);
  const latestNum = Math.max(0, ...nums);
  const contentHash = sha256(searchContent);
  const numsHash = hashNums(nums);
  const semantic = existsSync(semanticPath)
    ? await readSemanticAsset(semanticPath, records, numsHash)
    : null;
  const corpus = {
    latestNum,
    recordCount: records.length,
    contentHash,
    numsHash,
  };
  const search: IndexAsset = {
    schema: SEARCH_INDEX_SCHEMA,
    url: publicUrl(searchPath),
    sha256: contentHash,
    bytes: statSync(searchPath).size,
    recordCount: records.length,
  };
  const assets: IndexManifestFile["assets"] = {
    search,
    ...(semantic ? { semantic } : {}),
  };
  const existing = await readExistingManifest(outputPath);
  const reuseBuild = existing && manifestPayloadMatches(existing, corpus, assets);
  const generatedAt = reuseBuild ? existing.generatedAt : new Date().toISOString();
  const buildId = reuseBuild
    ? existing.buildId
    : [
        generatedAt.replace(/[-:.]/g, "").slice(0, 15),
        latestNum,
        contentHash.slice(7, 15),
      ].join("-");

  const manifest: IndexManifestFile = {
    schema: INDEX_MANIFEST_SCHEMA,
    buildId,
    generatedAt,
    corpus,
    assets,
  };

  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `Wrote ${outputPath} for ${records.length} records` +
      (semantic ? " with semantic asset" : " without semantic asset"),
  );
}

async function readSemanticAsset(
  semanticPath: string,
  records: ComicRecord[],
  numsHash: string,
): Promise<SemanticIndexAsset | null> {
  const semanticContent = await readFile(semanticPath, "utf8");
  const semantic = JSON.parse(semanticContent) as SemanticIndexFile;
  const expectedNums = records.map((record) => record.num);

  if (!arraysEqual(semantic.nums, expectedNums)) {
    console.warn(`Omitting semantic asset from manifest; ${semanticPath} nums do not match search index.`);
    return null;
  }

  const vectorLength = Buffer.from(semantic.vectors, "base64").byteLength;
  const expectedVectorLength = semantic.nums.length * semantic.dimensions;

  if (vectorLength !== expectedVectorLength) {
    console.warn(
      `Omitting semantic asset from manifest; vector length ${vectorLength} != ${expectedVectorLength}.`,
    );
    return null;
  }

  return {
    schema: SEMANTIC_INDEX_SCHEMA,
    url: publicUrl(semanticPath),
    sha256: sha256(semanticContent),
    bytes: statSync(semanticPath).size,
    recordCount: semantic.nums.length,
    numsHash,
    model: semantic.model,
    dimensions: semantic.dimensions,
    scale: semantic.scale,
  };
}

async function readExistingManifest(filePath: string): Promise<IndexManifestFile | null> {
  if (!existsSync(filePath)) {
    return null;
  }

  const manifest = JSON.parse(await readFile(filePath, "utf8")) as unknown;

  return isSupportedIndexManifest(manifest) ? manifest : null;
}

function manifestPayloadMatches(
  manifest: IndexManifestFile,
  corpus: IndexManifestFile["corpus"],
  assets: IndexManifestFile["assets"],
): boolean {
  return JSON.stringify(manifest.corpus) === JSON.stringify(corpus) &&
    JSON.stringify(manifest.assets) === JSON.stringify(assets);
}

export function sha256(content: string): string {
  return `sha256-${createHash("sha256").update(content).digest("hex")}`;
}

export function hashNums(nums: number[]): string {
  return sha256(JSON.stringify(nums));
}

function publicUrl(filePath: string): string {
  const normalized = filePath.split(path.sep).join("/");

  return normalized.startsWith("public/")
    ? `/${normalized.slice("public/".length)}`
    : normalized;
}

function arraysEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
