import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { normalizeXkcdRecord } from "../src/lib/normalize.ts";
import type { ComicRecord, ExplainXkcdRawPage, XkcdRawComic } from "../src/lib/types.ts";
import { formatPublicRecords } from "./lib/public-index.ts";

const DEFAULT_OUTPUT = "public/search-index.json";

interface BuildOptions {
  sourceDir: string;
  outputPath: string;
  explainDir?: string;
}

async function loadRecords(options: BuildOptions): Promise<ComicRecord[]> {
  const { explainDir, sourceDir } = options;
  const entries = await readdir(sourceDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));

  const records: ComicRecord[] = [];

  for (const file of files) {
    const filePath = path.join(sourceDir, file);
    const raw = JSON.parse(await readFile(filePath, "utf8")) as XkcdRawComic;
    const explainRaw = explainDir ? await readExplainRecord(explainDir, Number.parseInt(file, 10)) : null;
    const record = normalizeXkcdRecord(raw, explainRaw);

    if (record) {
      records.push(record);
    }
  }

  return records;
}

async function readExplainRecord(explainDir: string, num: number): Promise<ExplainXkcdRawPage | null> {
  const explainPath = path.join(explainDir, `${num}.json`);

  if (!existsSync(explainPath)) {
    return null;
  }

  return JSON.parse(await readFile(explainPath, "utf8")) as ExplainXkcdRawPage;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));

  if (!existsSync(options.sourceDir)) {
    throw new Error(`No xkcd source directory found at ${options.sourceDir}`);
  }

  if (options.explainDir && !existsSync(options.explainDir)) {
    throw new Error(`No explainxkcd source directory found at ${options.explainDir}`);
  }

  const records = await loadRecords(options);
  records.sort((a, b) => a.num - b.num);
  const publicRecords = records.map(toPublicRecord);

  await mkdir(path.dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, formatPublicRecords(publicRecords));

  console.log(`Wrote ${records.length} records from ${options.sourceDir} to ${options.outputPath}`);
}

function parseOptions(args: string[]): BuildOptions {
  let sourceDir = "";
  let explainDir: string | undefined;
  let outputPath = DEFAULT_OUTPUT;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--source") {
      sourceDir = requiredValue(args, index);
      index += 1;
      continue;
    }

    if (arg === "--explain-source") {
      explainDir = requiredValue(args, index);
      index += 1;
      continue;
    }

    if (arg === "--output") {
      outputPath = requiredValue(args, index);
      index += 1;
      continue;
    }

    throw new Error(`Unknown option ${arg}`);
  }

  if (!sourceDir) {
    throw new Error(
      "Choose an explicit index source with --source. Local raw_data is a maintainer archive, not a build input.",
    );
  }

  return { sourceDir, explainDir, outputPath };
}

function requiredValue(args: string[], index: number): string {
  const value = args[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${args[index]}`);
  }

  return value;
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
