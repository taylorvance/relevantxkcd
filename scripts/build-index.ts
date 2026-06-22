import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { normalizeXkcdRecord } from "../src/lib/normalize.ts";
import type { ComicRecord, ExplainXkcdRawPage, XkcdRawComic } from "../src/lib/types.ts";

const DEFAULT_RAW_DIR = "raw_data/xkcd";
const DEFAULT_EXPLAIN_DIR = "raw_data/explainxkcd";
const DEFAULT_FIXTURE_DIR = "fixtures/xkcd";
const DEFAULT_OUTPUT = "public/search-index.json";

async function loadRecords(sourceDir: string): Promise<ComicRecord[]> {
  const entries = await readdir(sourceDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));

  const records: ComicRecord[] = [];

  for (const file of files) {
    const filePath = path.join(sourceDir, file);
    const raw = JSON.parse(await readFile(filePath, "utf8")) as XkcdRawComic;
    const explainRaw = await readExplainRecord(Number.parseInt(file, 10));
    const record = normalizeXkcdRecord(raw, explainRaw);

    if (record) {
      records.push(record);
    }
  }

  return records;
}

async function readExplainRecord(num: number): Promise<ExplainXkcdRawPage | null> {
  if (!existsSync(DEFAULT_EXPLAIN_DIR)) {
    return null;
  }

  const explainPath = path.join(DEFAULT_EXPLAIN_DIR, `${num}.json`);

  if (!existsSync(explainPath)) {
    return null;
  }

  return JSON.parse(await readFile(explainPath, "utf8")) as ExplainXkcdRawPage;
}

async function main(): Promise<void> {
  const requestedSource = process.argv[2];
  const outputPath = process.argv[3] ?? DEFAULT_OUTPUT;
  const sourceDir =
    requestedSource ??
    (existsSync(DEFAULT_RAW_DIR)
      ? DEFAULT_RAW_DIR
      : existsSync(outputPath)
        ? null
        : DEFAULT_FIXTURE_DIR);

  if (!sourceDir) {
    console.log(`Kept existing ${outputPath}; ${DEFAULT_RAW_DIR} is not present`);
    return;
  }

  if (!existsSync(sourceDir)) {
    throw new Error(`No xkcd source directory found at ${sourceDir}`);
  }

  const records = await loadRecords(sourceDir);
  records.sort((a, b) => a.num - b.num);
  const publicRecords = records.map(toPublicRecord);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(publicRecords)}\n`);

  console.log(`Wrote ${records.length} records from ${sourceDir} to ${outputPath}`);
}

function toPublicRecord(record: ComicRecord): ComicRecord {
  const publicRecord = { ...record };

  delete publicRecord.searchText;

  return publicRecord;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
