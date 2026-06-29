import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { env, pipeline } from "@huggingface/transformers";

import type { SemanticIndexFile } from "../src/lib/semantic.ts";
import type { ComicRecord } from "../src/lib/types.ts";
import {
  SEMANTIC_DIMENSIONS,
  SEMANTIC_MODEL_ID,
  SEMANTIC_SCALE,
  quantizeSemanticValue,
  semanticText,
  semanticTextHash,
} from "./lib/semantic-index.ts";

const DEFAULT_RECORDS = "public/search-index.json";
const DEFAULT_OUTPUT = "public/semantic-index.json";
const BATCH_SIZE = Number.parseInt(process.env.SEMANTIC_BATCH_SIZE ?? "16", 10);

env.allowLocalModels = false;
env.cacheDir = path.join(process.env.HOME ?? ".", ".cache", "xkcd-transformers");

interface BuildOptions {
  recordsPath: string;
  outputPath: string;
  previousRecordsPath?: string;
  previousIndexPath?: string;
}

interface ReusableSemanticRow {
  contentHash: string;
  vector: Int8Array;
}

interface PendingEmbedding {
  record: ComicRecord;
  targetIndex: number;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));

  if (!existsSync(options.recordsPath)) {
    throw new Error(`Search index not found at ${options.recordsPath}. Run npm run update:index first.`);
  }

  const records = JSON.parse(await readFile(options.recordsPath, "utf8")) as ComicRecord[];
  const existingRows = await readReusableRows(options);
  const contentHashes = records.map(semanticTextHash);
  const vectors = new Int8Array(records.length * SEMANTIC_DIMENSIONS);
  const pending: PendingEmbedding[] = [];
  let reused = 0;

  records.forEach((record, targetIndex) => {
    const existing = existingRows.get(record.num);

    if (existing?.contentHash === contentHashes[targetIndex]) {
      vectors.set(existing.vector, targetIndex * SEMANTIC_DIMENSIONS);
      reused += 1;
      return;
    }

    pending.push({ record, targetIndex });
  });

  console.log(
    `Reused ${reused} semantic vectors; embedding ${pending.length} new or changed records.`,
  );

  if (pending.length > 0) {
    const extractor = await pipeline("feature-extraction", SEMANTIC_MODEL_ID, { dtype: "q8" });

    for (let start = 0; start < pending.length; start += BATCH_SIZE) {
      const batch = pending.slice(start, start + BATCH_SIZE);
      const output = await extractor(batch.map((item) => semanticText(item.record)), {
        pooling: "mean",
        normalize: true,
      });

      if (output.dims.at(-1) !== SEMANTIC_DIMENSIONS) {
        throw new Error(`Expected ${SEMANTIC_DIMENSIONS} dimensions, got ${output.dims.join("x")}`);
      }

      for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
        const item = batch[batchIndex];

        for (let dim = 0; dim < SEMANTIC_DIMENSIONS; dim += 1) {
          const sourceOffset = batchIndex * SEMANTIC_DIMENSIONS + dim;
          const targetOffset = item.targetIndex * SEMANTIC_DIMENSIONS + dim;
          vectors[targetOffset] = quantizeSemanticValue(Number(output.data[sourceOffset]));
        }
      }

      console.log(`Embedded ${Math.min(start + batch.length, pending.length)} / ${pending.length}`);
    }
  }

  const index: SemanticIndexFile = {
    model: SEMANTIC_MODEL_ID,
    dimensions: SEMANTIC_DIMENSIONS,
    scale: SEMANTIC_SCALE,
    nums: records.map((record) => record.num),
    contentHashes,
    vectors: Buffer.from(vectors.buffer).toString("base64"),
  };

  await mkdir(path.dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, `${JSON.stringify(index)}\n`);
  console.log(`Wrote ${records.length} semantic vectors to ${options.outputPath}`);
}

async function readReusableRows(options: BuildOptions): Promise<Map<number, ReusableSemanticRow>> {
  const indexPath = options.previousIndexPath ?? options.outputPath;

  if (!existsSync(indexPath)) {
    return new Map();
  }

  const semantic = JSON.parse(await readFile(indexPath, "utf8")) as SemanticIndexFile;

  if (
    semantic.model !== SEMANTIC_MODEL_ID ||
    semantic.dimensions !== SEMANTIC_DIMENSIONS ||
    semantic.scale !== SEMANTIC_SCALE
  ) {
    console.warn(`Ignoring reusable semantic index at ${indexPath}; model metadata changed.`);
    return new Map();
  }

  const vectorBytes = Buffer.from(semantic.vectors, "base64");
  const expectedVectorLength = semantic.nums.length * SEMANTIC_DIMENSIONS;

  if (vectorBytes.byteLength !== expectedVectorLength) {
    console.warn(
      `Ignoring reusable semantic index at ${indexPath}; vector length ${vectorBytes.byteLength} != ${expectedVectorLength}.`,
    );
    return new Map();
  }

  const contentHashes = await resolveReusableContentHashes(semantic, options.previousRecordsPath);

  if (!contentHashes) {
    console.warn(`Ignoring reusable semantic index at ${indexPath}; no per-record content hashes available.`);
    return new Map();
  }

  const rows = new Map<number, ReusableSemanticRow>();
  const previousVectors = new Int8Array(
    vectorBytes.buffer,
    vectorBytes.byteOffset,
    vectorBytes.byteLength,
  );

  semantic.nums.forEach((num, rowIndex) => {
    const start = rowIndex * SEMANTIC_DIMENSIONS;
    const vector = previousVectors.slice(start, start + SEMANTIC_DIMENSIONS);

    rows.set(num, {
      contentHash: contentHashes[rowIndex],
      vector,
    });
  });

  return rows;
}

async function resolveReusableContentHashes(
  semantic: SemanticIndexFile,
  previousRecordsPath?: string,
): Promise<string[] | null> {
  if (semantic.contentHashes?.length === semantic.nums.length) {
    return semantic.contentHashes;
  }

  if (!previousRecordsPath || !existsSync(previousRecordsPath)) {
    return null;
  }

  const previousRecords = JSON.parse(await readFile(previousRecordsPath, "utf8")) as ComicRecord[];
  const previousHashesByNum = new Map(
    previousRecords.map((record) => [record.num, semanticTextHash(record)]),
  );
  const hashes = semantic.nums.map((num) => previousHashesByNum.get(num));

  return hashes.every((hash): hash is string => Boolean(hash)) ? hashes : null;
}

function parseOptions(argv: string[]): BuildOptions {
  const positional: string[] = [];
  const flags = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const [key, inlineValue] = arg.slice(2).split("=", 2);
    const next = argv[index + 1];

    if (inlineValue !== undefined) {
      flags.set(key, inlineValue);
    } else if (next && !next.startsWith("--")) {
      flags.set(key, next);
      index += 1;
    } else {
      throw new Error(`Missing value for --${key}`);
    }
  }

  return {
    recordsPath: flags.get("records") ?? positional[0] ?? DEFAULT_RECORDS,
    outputPath: flags.get("output") ?? positional[1] ?? DEFAULT_OUTPUT,
    previousRecordsPath: flags.get("previous-records"),
    previousIndexPath: flags.get("previous-index"),
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
