import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { env, pipeline } from "@huggingface/transformers";

import type { SemanticIndexFile } from "../src/lib/semantic";
import type { ComicRecord } from "../src/lib/types";

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const DEFAULT_RECORDS = "public/search-index.json";
const DEFAULT_OUTPUT = "public/semantic-index.json";
const DIMENSIONS = 384;
const SCALE = 127;
const BATCH_SIZE = Number.parseInt(process.env.SEMANTIC_BATCH_SIZE ?? "16", 10);

env.allowLocalModels = false;
env.cacheDir = path.join(process.env.HOME ?? ".", ".cache", "xkcd-transformers");

function semanticText(record: ComicRecord): string {
  return [
    record.title,
    record.alt,
    record.transcript,
    record.communityTranscript,
    record.explainReferences ?? "",
    record.explanation ?? "",
  ]
    .filter(Boolean)
    .join(". ")
    .slice(0, 3200);
}

function quantize(value: number): number {
  return Math.max(-SCALE, Math.min(SCALE, Math.round(value * SCALE)));
}

async function main(): Promise<void> {
  const recordsPath = process.argv[2] ?? DEFAULT_RECORDS;
  const outputPath = process.argv[3] ?? DEFAULT_OUTPUT;

  if (!existsSync(recordsPath)) {
    throw new Error(`Search index not found at ${recordsPath}. Run npm run generate:index first.`);
  }

  const records = JSON.parse(await readFile(recordsPath, "utf8")) as ComicRecord[];
  const extractor = await pipeline("feature-extraction", MODEL_ID, { dtype: "q8" });
  const vectors = new Int8Array(records.length * DIMENSIONS);

  for (let start = 0; start < records.length; start += BATCH_SIZE) {
    const batch = records.slice(start, start + BATCH_SIZE);
    const output = await extractor(batch.map(semanticText), {
      pooling: "mean",
      normalize: true,
    });

    if (output.dims.at(-1) !== DIMENSIONS) {
      throw new Error(`Expected ${DIMENSIONS} dimensions, got ${output.dims.join("x")}`);
    }

    for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
      for (let dim = 0; dim < DIMENSIONS; dim += 1) {
        const sourceOffset = batchIndex * DIMENSIONS + dim;
        const targetOffset = (start + batchIndex) * DIMENSIONS + dim;
        vectors[targetOffset] = quantize(Number(output.data[sourceOffset]));
      }
    }

    console.log(`Embedded ${Math.min(start + batch.length, records.length)} / ${records.length}`);
  }

  const index: SemanticIndexFile = {
    model: MODEL_ID,
    dimensions: DIMENSIONS,
    scale: SCALE,
    nums: records.map((record) => record.num),
    vectors: Buffer.from(vectors.buffer).toString("base64"),
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(index)}\n`);
  console.log(`Wrote ${records.length} semantic vectors to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
